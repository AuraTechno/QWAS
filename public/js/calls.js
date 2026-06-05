// WebRTC звонки (аудио/видео) — QWAS
// Features:
//  - STUN/TURN через /api/ice
//  - Drag & drop плавающего локального видео
//  - Авто-скрытие контролов через 3с (показ по тапу)
//  - Flip camera (мобильные)
//  - Voice wave animation (аудио-звонки)
//  - Opus codec предпочтение
//  - Перетаскиваемое, glassmorphism-стилизованное
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const ICE_STUN_FALLBACK = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  let ICE_CACHE = null;
  let ICE_FETCH_PROMISE = null;

  function getIceServers() {
    return ICE_CACHE || ICE_STUN_FALLBACK;
  }

  async function fetchIceServers() {
    if (ICE_CACHE) return ICE_CACHE;
    if (ICE_FETCH_PROMISE) return ICE_FETCH_PROMISE;
    ICE_FETCH_PROMISE = fetch('/api/ice')
      .then(r => r.json())
      .then(data => {
        if (data && Array.isArray(data.iceServers) && data.iceServers.length) {
          ICE_CACHE = data.iceServers;
        } else {
          ICE_CACHE = ICE_STUN_FALLBACK.slice();
        }
        return ICE_CACHE;
      })
      .catch(() => { ICE_CACHE = ICE_STUN_FALLBACK.slice(); return ICE_CACHE; });
    return ICE_FETCH_PROMISE;
  }

  // Помощник для иконок
  const I = (name, size = 24) => QWAS.Util && QWAS.Util.icon ? QWAS.Util.icon(name, { size }) : '';

  const Calls = {
    pc: null,
    localStream: null,
    remoteStream: null,
    currentCall: null,
    ringtone: null,
    ringtoneCtx: null,
    ringtoneAnalyser: null,
    ringtoneAnimFrame: null,
    ringtoneLevel: 0,
    timer: null,
    timerStart: 0,
    overlay: null,
    _pendingOffer: null,
    _hideControlsTimer: null,
    _videoSender: null,    // RTCRtpSender для camera track
    _facingMode: 'user',   // user | environment
    _dragging: false,
    _dragOffset: { x: 0, y: 0 },
    _audioAnalyser: null,
    _audioLevel: 0,
    _audioAnimFrame: null,

    init() {
      this._injectStyles();
      fetchIceServers();
    },

    _injectStyles() {
      if (document.getElementById('call-styles')) return;
      const s = document.createElement('style');
      s.id = 'call-styles';
      s.textContent = `
        .call-overlay {
          position: fixed; inset: 0;
          background: radial-gradient(circle at 50% 30%, #1a2a3a 0%, #050810 100%);
          z-index: 10000;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
          overflow: hidden;
          animation: call-fade-in 0.3s var(--ease-ios, cubic-bezier(0.32, 0.72, 0, 1));
        }
        @keyframes call-fade-in { from { opacity: 0; } to { opacity: 1; } }

        .call-stage {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .call-remote-video {
          width: 100%; height: 100%;
          object-fit: cover;
          background: #000;
        }
        .call-remote-audio { display: none; }

        /* === Плавающая локальная камера (draggable) === */
        .call-local-wrap {
          position: fixed;
          top: 80px; right: 16px;
          width: 140px; height: 200px;
          border-radius: 14px;
          overflow: hidden;
          background: #000;
          box-shadow: 0 8px 24px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.15);
          z-index: 10002;
          cursor: grab;
          touch-action: none;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
          will-change: transform;
        }
        .call-local-wrap:active { cursor: grabbing; transform: scale(1.04); }
        .call-local-wrap.dragging {
          transform: scale(1.06);
          box-shadow: 0 16px 40px rgba(0,0,0,0.7), 0 0 0 2px rgba(106, 178, 242, 0.5);
          transition: none;
        }
        .call-local-video {
          width: 100%; height: 100%;
          object-fit: cover;
          background: #000;
          display: block;
        }

        /* === Заголовок звонка === */
        .call-header {
          position: absolute; top: 0; left: 0; right: 0;
          padding: calc(20px + env(safe-area-inset-top, 0)) 20px 20px;
          background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%);
          display: flex; align-items: center; gap: 14px;
          z-index: 10001;
          transition: opacity 0.3s;
          pointer-events: auto;
        }
        .call-avatar {
          width: 48px; height: 48px; border-radius: 50%;
          background: linear-gradient(135deg, #5e8ee7, #2a7ae0);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 18px; color: #fff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .call-name { font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }
        .call-status { font-size: 13px; opacity: 0.75; margin-top: 2px; }

        .call-timer {
          position: absolute; top: calc(20px + env(safe-area-inset-top, 0)); right: 20px;
          font-size: 13px; font-weight: 600;
          background: rgba(0,0,0,0.5);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          padding: 5px 12px; border-radius: 12px;
          z-index: 10001;
          transition: opacity 0.3s;
        }

        /* === Аудио-экран === */
        .call-audio {
          position: absolute; inset: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 40px 20px;
          gap: 24px;
        }
        .call-audio-avatar {
          width: 140px; height: 140px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 56px; font-weight: 700; color: #fff;
          background: linear-gradient(135deg, #5e8ee7, #2a7ae0);
          box-shadow: 0 12px 40px rgba(94, 142, 231, 0.4);
          position: relative;
        }
        .call-audio-name { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
        .call-audio-status { font-size: 15px; opacity: 0.7; }

        /* Голосовая волна */
        .call-wave {
          display: flex; align-items: center; justify-content: center;
          gap: 3px; height: 56px;
        }
        .call-wave-bar {
          width: 4px; min-height: 4px;
          background: linear-gradient(180deg, #6ab2f2, #5e8ee7);
          border-radius: 4px;
          transition: height 0.08s ease;
        }
        .call-audio.speaking .call-audio-avatar { animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        /* === Кнопки управления === */
        .call-actions {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 20px 20px calc(28px + env(safe-area-inset-bottom, 0));
          display: flex; gap: 12px; justify-content: center; align-items: center;
          background: linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%);
          z-index: 10001;
          transition: opacity 0.3s, transform 0.3s;
        }
        .call-overlay.controls-hidden .call-header,
        .call-overlay.controls-hidden .call-timer,
        .call-overlay.controls-hidden .call-actions {
          opacity: 0;
          pointer-events: none;
        }
        .call-overlay.controls-hidden .call-header,
        .call-overlay.controls-hidden .call-actions {
          transform: translateY(20px);
        }
        .call-overlay.controls-hidden .call-local-wrap { cursor: grab; }

        .call-btn {
          width: 56px; height: 56px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.18);
          color: #fff;
          -webkit-backdrop-filter: blur(20px);
          backdrop-filter: blur(20px);
          transition: background 0.15s, transform 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .call-btn:hover { background: rgba(255,255,255,0.28); }
        .call-btn:active { transform: scale(0.92); }
        .call-btn svg { width: 26px; height: 26px; }
        .call-btn.danger { background: #ff3b30; }
        .call-btn.danger:hover { background: #ff453a; }
        .call-btn.accept { background: #34c759; }
        .call-btn.accept:hover { background: #30d158; }
        .call-btn.active { background: #ffffff; color: #0a0a0a; }
        .call-btn.lg {
          width: 68px; height: 68px;
          background: rgba(255,255,255,0.22);
        }
        .call-btn.lg.danger { background: #ff3b30; }

        /* === Flip camera === */
        .call-flip-btn {
          position: absolute;
          top: 50%; right: 12px;
          transform: translateY(-50%);
          width: 40px; height: 40px;
          border-radius: 50%;
          background: rgba(0,0,0,0.5);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          z-index: 10003;
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          transition: background 0.15s, transform 0.15s;
        }
        .call-flip-btn:hover { background: rgba(0,0,0,0.7); }
        .call-flip-btn:active { transform: translateY(-50%) scale(0.9); }
        .call-flip-btn svg { width: 22px; height: 22px; }

        /* === Качество видео === */
        .call-quality {
          position: absolute; top: calc(20px + env(safe-area-inset-top, 0)); right: 20px;
          font-size: 11px; opacity: 0.6;
          z-index: 10001;
        }

        /* === Адаптив === */
        @media (max-width: 600px) {
          .call-local-wrap { width: 110px; height: 160px; }
          .call-audio-avatar { width: 120px; height: 120px; font-size: 48px; }
          .call-audio-name { font-size: 22px; }
          .call-btn { width: 52px; height: 52px; }
          .call-btn.lg { width: 64px; height: 64px; }
        }
      `;
      document.head.appendChild(s);
    },

    async start(type) {
      if (this.currentCall) { QWAS.Toast.error('Звонок уже идёт'); return; }
      if (!QWAS.State.currentChatInfo || !QWAS.State.currentChatInfo.chat) {
        QWAS.Toast.error('Откройте чат'); return;
      }
      const c = QWAS.State.currentChatInfo.chat;
      const other = c.otherUser;
      if (!other) { QWAS.Toast.error('Нельзя позвонить в группу'); return; }
      await this._startCall(other.username, type);
    },

    async _startCall(peerName, type) {
      try {
        this._facingMode = 'user';
        this.localStream = await this._getMedia({ video: type === 'video', audio: true });
      } catch (err) {
        QWAS.Toast.error('Нет доступа к медиа: ' + (err.message || err.name));
        return;
      }
      await fetchIceServers();
      this._showOverlay(peerName, type, true);
      this._playRingtone();
      this.pc = this._createPeer(peerName);
      this.localStream.getTracks().forEach(t => {
        const sender = this.pc.addTrack(t, this.localStream);
        if (t.kind === 'video') this._videoSender = sender;
      });
      try {
        const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
        await this.pc.setLocalDescription(offer);
        QWAS.State.socket && QWAS.State.socket.emit('call_user', { to: peerName, type, offer });
        this.currentCall = { peerName, type, isCaller: true };
        this._setPreferredCodecs();
      } catch (err) {
        QWAS.Toast.error('Не удалось начать звонок');
        this._cleanup();
      }
    },

    async _getMedia({ video, audio }) {
      // video: false | { facingMode: 'user' | 'environment' }
      const constraints = {
        audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
        video: video ? {
          facingMode: this._facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } : false
      };
      return await navigator.mediaDevices.getUserMedia(constraints);
    },

    async _flipCamera() {
      if (!this.localStream) return;
      this._facingMode = this._facingMode === 'user' ? 'environment' : 'user';
      try {
        const newStream = await this._getMedia({
          video: this.currentCall?.type === 'video',
          audio: false
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        if (newVideoTrack && this._videoSender) {
          await this._videoSender.replaceTrack(newVideoTrack);
        }
        // Заменяем в локальном стриме
        const oldVideo = this.localStream.getVideoTracks()[0];
        if (oldVideo) {
          this.localStream.removeTrack(oldVideo);
          oldVideo.stop();
        }
        this.localStream.addTrack(newVideoTrack);
        // Обновить video в overlay
        const localVideo = this.overlay?.querySelector('#callLocalVideo');
        if (localVideo) localVideo.srcObject = this.localStream;
      } catch (err) {
        QWAS.Toast.error('Не удалось переключить камеру');
        // Откатить facingMode
        this._facingMode = this._facingMode === 'user' ? 'environment' : 'user';
      }
    },

    _createPeer(peerName) {
      const pc = new RTCPeerConnection({
        iceServers: getIceServers(),
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });
      pc.ontrack = (e) => this._onTrack(e);
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          QWAS.State.socket && QWAS.State.socket.emit('call_ice_candidate', { to: peerName, candidate: e.candidate });
        }
      };
      pc.onconnectionstatechange = () => {
        if (!this.pc) return;
        const st = this.pc.connectionState;
        if (st === 'connected') {
          this._stopRingtone();
          this._startAudioAnalyser();
        }
        if (['failed', 'disconnected', 'closed'].includes(st)) {
          this._cleanup();
          QWAS.Toast.error('Связь потеряна');
        }
      };
      return pc;
    },

    async _setPreferredCodecs() {
      if (!this.pc) return;
      try {
        const transceivers = this.pc.getTransceivers();
        for (const tr of transceivers) {
          if (tr.sender && tr.sender.track?.kind === 'audio') {
            const caps = RTCRtpSender.getCapabilities('audio');
            const opus = caps.codecs.find(c => c.mimeType.toLowerCase().includes('opus'));
            if (opus) {
              await tr.setCodecPreferences([opus, ...caps.codecs.filter(c => c !== opus)]);
            }
          }
        }
      } catch {}
    },

    onIncoming(data) {
      if (!data || !data.from) return;
      if (this.currentCall) {
        QWAS.State.socket && QWAS.State.socket.emit('call_reject', { to: data.from });
        return;
      }
      this._facingMode = 'user';
      this._showOverlay(data.from, data.type, false);
      this._playRingtone();
      this._pendingOffer = data.offer;
      this.currentCall = { peerName: data.from, type: data.type, isCaller: false };
    },

    async accept() {
      const call = this.currentCall;
      if (!call || call.isCaller) return;
      try {
        this.localStream = await this._getMedia({ video: call.type === 'video', audio: true });
      } catch (err) {
        QWAS.Toast.error('Нет доступа к медиа');
        this._cleanup();
        return;
      }
      this._stopRingtone();
      await fetchIceServers();
      this.pc = this._createPeer(call.peerName);
      this.localStream.getTracks().forEach(t => {
        const sender = this.pc.addTrack(t, this.localStream);
        if (t.kind === 'video') this._videoSender = sender;
      });
      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(this._pendingOffer));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        QWAS.State.socket && QWAS.State.socket.emit('call_answer', { to: call.peerName, answer });
      } catch (err) {
        QWAS.Toast.error('Не удалось ответить на звонок');
        this._cleanup();
        return;
      }
      this._swapToInCall(call.peerName, call.type);
      this._startTimer();
      this._setPreferredCodecs();
    },

    reject() {
      const call = this.currentCall;
      if (!call) return;
      QWAS.State.socket && QWAS.State.socket.emit('call_reject', { to: call.peerName });
      this._cleanup();
    },

    onSignal(data) {
      if (!data || !data.answer || !this.pc) return;
      this.pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
      this._stopRingtone();
      this._startTimer();
      this._startAudioAnalyser();
    },

    onIceCandidate(data) {
      if (!data || !data.candidate || !this.pc) return;
      this.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    },

    onRemoteEnd(data) {
      QWAS.Toast.info('Звонок завершён');
      this._cleanup();
    },

    end() {
      const call = this.currentCall;
      if (call) {
        QWAS.State.socket && QWAS.State.socket.emit('call_end', { to: call.peerName });
      }
      this._cleanup();
    },

    _onTrack(e) {
      const stream = e.streams && e.streams[0];
      if (!stream) return;
      const video = this.overlay?.querySelector('#callRemoteVideo');
      const audio = this.overlay?.querySelector('#callRemoteAudio');
      const videoVisible = video && getComputedStyle(video).display !== 'none';
      if (videoVisible && video) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
      if (audio) {
        audio.srcObject = stream;
        audio.play().catch(() => {});
      }
    },

    _showOverlay(peerName, type, isCaller) {
      this._removeOverlay();
      const o = document.createElement('div');
      o.className = 'call-overlay';
      o.id = 'callOverlay';
      o.innerHTML = `
        <div class="call-stage">
          ${type === 'video' ? `
            <video id="callRemoteVideo" class="call-remote-video" autoplay playsinline></video>
            <audio id="callRemoteAudio" class="call-remote-audio" autoplay></audio>
          ` : `
            <audio id="callRemoteAudio" class="call-remote-audio" autoplay></audio>
            <div class="call-audio" id="callAudioPane">
              <div class="call-audio-avatar" id="callAudioAvatar">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(peerName))}</div>
              <div class="call-audio-name">${QWAS.Util.escapeHtml(peerName)}</div>
              <div class="call-audio-status" id="callStatus">${isCaller ? 'Вызов...' : 'Входящий звонок'}</div>
              <div class="call-wave" id="callWave">
                ${Array.from({ length: 24 }, () => '<div class="call-wave-bar" style="height: 6px"></div>').join('')}
              </div>
            </div>
          `}
        </div>

        ${type === 'video' ? `
          <div class="call-header">
            <div class="call-avatar">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(peerName))}</div>
            <div>
              <div class="call-name">${QWAS.Util.escapeHtml(peerName)}</div>
              <div class="call-status" id="callStatus">${isCaller ? 'Вызов...' : 'Входящий звонок'}</div>
            </div>
          </div>
          <div class="call-timer" id="callTimer" style="display:none">0:00</div>
          <div class="call-local-wrap" id="callLocalWrap">
            <video id="callLocalVideo" class="call-local-video" autoplay muted playsinline></video>
            <button class="call-flip-btn" id="callFlipBtn" title="Переключить камеру">${I('refresh')}</button>
          </div>
        ` : ''}

        <div class="call-actions" id="callActions">
          ${!isCaller ? `
            <button class="call-btn lg accept" id="callAcceptBtn" title="Принять">${I('phone', 32)}</button>
            <button class="call-btn lg danger" id="callRejectBtn" title="Отклонить">${I('phoneOff', 32)}</button>
          ` : `
            <button class="call-btn" id="callMuteBtn" title="Микрофон">${I('mic')}</button>
            ${type === 'video' ? `<button class="call-btn" id="callCameraBtn" title="Камера">${I('video')}</button>` : ''}
            <button class="call-btn lg danger" id="callEndBtn" title="Завершить">${I('phoneOff', 32)}</button>
          `}
        </div>
      `;
      document.body.appendChild(o);
      this.overlay = o;

      // Local preview
      const local = o.querySelector('#callLocalVideo');
      if (local && this.localStream) {
        local.srcObject = this.localStream;
      }

      this._bindActionButtons();
      this._bindDragAndDrop();
      this._bindAutoHideControls();
    },

    _swapToInCall(peerName, type) {
      const actions = this.overlay?.querySelector('#callActions');
      if (!actions) return;
      actions.innerHTML = `
        <button class="call-btn" id="callMuteBtn" title="Микрофон">${I('mic')}</button>
        ${type === 'video' ? `<button class="call-btn" id="callCameraBtn" title="Камера">${I('video')}</button>` : ''}
        <button class="call-btn lg danger" id="callEndBtn" title="Завершить">${I('phoneOff', 32)}</button>
      `;
      const status = this.overlay.querySelector('#callStatus');
      if (status) status.textContent = 'В разговоре';
      this._bindActionButtons();
    },

    _bindActionButtons() {
      if (!this.overlay) return;
      const overlayRef = this.overlay;
      const acceptBtn = overlayRef.querySelector('#callAcceptBtn');
      const rejectBtn = overlayRef.querySelector('#callRejectBtn');
      const endBtn = overlayRef.querySelector('#callEndBtn');
      const muteBtn = overlayRef.querySelector('#callMuteBtn');
      const camBtn = overlayRef.querySelector('#callCameraBtn');
      const flipBtn = overlayRef.querySelector('#callFlipBtn');
      if (acceptBtn) acceptBtn.addEventListener('click', () => { if (overlayRef.isConnected) this.accept(); });
      if (rejectBtn) rejectBtn.addEventListener('click', () => { if (overlayRef.isConnected) this.reject(); });
      if (endBtn) endBtn.addEventListener('click', () => { if (overlayRef.isConnected) this.end(); });
      if (muteBtn) muteBtn.addEventListener('click', () => {
        if (!overlayRef.isConnected) return;
        const t = this.localStream?.getAudioTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        muteBtn.classList.toggle('active', !t.enabled);
        muteBtn.innerHTML = !t.enabled ? I('micOff') : I('mic');
      });
      if (camBtn) camBtn.addEventListener('click', () => {
        if (!overlayRef.isConnected) return;
        const t = this.localStream?.getVideoTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        camBtn.classList.toggle('active', !t.enabled);
        camBtn.innerHTML = !t.enabled ? I('videoOff') : I('video');
      });
      if (flipBtn) flipBtn.addEventListener('click', () => { if (overlayRef.isConnected) this._flipCamera(); });
    },

    /**
     * Drag & drop для плавающей локальной камеры
     */
    _bindDragAndDrop() {
      const overlayRef = this.overlay;
      const wrap = overlayRef?.querySelector('#callLocalWrap');
      if (!wrap) return;
      const onStart = (clientX, clientY) => {
        if (!overlayRef?.isConnected) return;
        this._dragging = true;
        wrap.classList.add('dragging');
        const rect = wrap.getBoundingClientRect();
        this._dragOffset.x = clientX - rect.left;
        this._dragOffset.y = clientY - rect.top;
        wrap.style.transition = 'none';
      };
      const onMove = (clientX, clientY) => {
        if (!this._dragging || !overlayRef?.isConnected) return;
        const x = Math.max(0, Math.min(window.innerWidth - wrap.offsetWidth, clientX - this._dragOffset.x));
        const y = Math.max(60, Math.min(window.innerHeight - wrap.offsetHeight - 100, clientY - this._dragOffset.y));
        wrap.style.left = x + 'px';
        wrap.style.top = y + 'px';
        wrap.style.right = 'auto';
        wrap.style.bottom = 'auto';
      };
      const onEnd = () => {
        this._dragging = false;
        if (wrap?.isConnected) {
          wrap.classList.remove('dragging');
          wrap.style.transition = '';
        }
      };
      wrap.addEventListener('mousedown', e => { e.preventDefault(); onStart(e.clientX, e.clientY); });
      document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
      document.addEventListener('mouseup', onEnd);
      wrap.addEventListener('touchstart', e => { const t = e.touches[0]; onStart(t.clientX, t.clientY); }, { passive: true });
      document.addEventListener('touchmove', e => { const t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: true });
      document.addEventListener('touchend', onEnd);
    },

    /**
     * Авто-скрытие контролов через 3с бездействия
     */
    _bindAutoHideControls() {
      if (!this.overlay) return;
      const overlayRef = this.overlay;
      const show = () => {
        if (!overlayRef.isConnected) return;
        overlayRef.classList.remove('controls-hidden');
        clearTimeout(this._hideControlsTimer);
        this._hideControlsTimer = setTimeout(() => {
          if (overlayRef.isConnected && this.currentCall && this.pc?.connectionState === 'connected') {
            overlayRef.classList.add('controls-hidden');
          }
        }, 3000);
      };
      overlayRef.addEventListener('click', show);
      overlayRef.addEventListener('touchstart', show, { passive: true });
      overlayRef.addEventListener('mousemove', show);
      show();
    },

    /**
     * Анимация голосовой волны по уровню входящего аудио
     */
    _startAudioAnalyser() {
      if (!this.overlay) return;
      const audioPane = this.overlay.querySelector('#callAudioPane');
      const wave = this.overlay.querySelector('#callWave');
      if (!audioPane || !wave) return;
      const bars = wave.querySelectorAll('.call-wave-bar');
      if (!bars.length) return;

      const audio = this.overlay.querySelector('#callRemoteAudio');
      if (!audio || !audio.srcObject) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(audio.srcObject);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        src.connect(analyser);
        this._audioAnalyser = { ctx, analyser, src };
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!this._audioAnalyser) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < 32; i++) sum += data[i];
          const avg = sum / 32;
          const norm = Math.min(1, avg / 96);
          this._audioLevel = norm;
          bars.forEach((b, i) => {
            const offset = Math.sin(Date.now() / 200 + i * 0.5) * 0.3 + 0.7;
            const h = 4 + norm * 50 * offset;
            b.style.height = h + 'px';
          });
          if (norm > 0.05) audioPane.classList.add('speaking');
          else audioPane.classList.remove('speaking');
          this._audioAnimFrame = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { /* no audio analysis available */ }
    },

    _stopAudioAnalyser() {
      if (this._audioAnimFrame) {
        cancelAnimationFrame(this._audioAnimFrame);
        this._audioAnimFrame = null;
      }
      if (this._audioAnalyser) {
        try { this._audioAnalyser.ctx.close(); } catch {}
        this._audioAnalyser = null;
      }
    },

    _removeOverlay() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      this._stopAudioAnalyser();
    },

    _startTimer() {
      const el = this.overlay?.querySelector('#callTimer');
      if (el) el.style.display = 'block';
      this.timerStart = Date.now();
      this.timer = setInterval(() => {
        const sec = Math.floor((Date.now() - this.timerStart) / 1000);
        if (el) el.textContent = QWAS.Util.formatDuration(sec);
      }, 1000);
    },

    _playRingtone() {
      try {
        if (!this.ringtoneCtx) {
          this.ringtoneCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = this.ringtoneCtx;
        const beep = () => {
          if (!ctx || ctx.state === 'closed') return;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 440;
          o.type = 'sine';
          g.gain.value = 0.05;
          o.start();
          setTimeout(() => { try { o.stop(); } catch {} }, 200);
        };
        this.ringtone = setInterval(beep, 1500);
        beep();
      } catch (e) {}
    },

    _stopRingtone() {
      if (this.ringtone) { clearInterval(this.ringtone); this.ringtone = null; }
      if (this.ringtoneCtx) { try { this.ringtoneCtx.close(); } catch {} this.ringtoneCtx = null; }
    },

    _cleanup() {
      this._stopRingtone();
      this._stopAudioAnalyser();
      clearTimeout(this._hideControlsTimer);
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this._videoSender) { try { this._videoSender = null; } catch {} this._videoSender = null; }
      if (this.pc) { try { this.pc.close(); } catch {} this.pc = null; }
      if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
      this.remoteStream = null;
      this.currentCall = null;
      this._pendingOffer = null;
      this._dragging = false;
      this._removeOverlay();
    }
  };

  window.QWAS.Calls = Calls;
})();
