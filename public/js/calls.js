// WebRTC звонки (аудио/видео)
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  // STUN-серверы для определения внешнего IP.
  // TURN-серверы (для NAT traversal) подгружаются с сервера через /api/ice,
  // иначе звонки за symmetric NAT (~10% юзеров) будут падать.
  const ICE_STUN_FALLBACK = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Кеш ICE-серверов, заполняется на init
  let ICE_CACHE = null;
  let ICE_FETCH_PROMISE = null;

  function getIceServers() {
    if (ICE_CACHE) return ICE_CACHE;
    return ICE_STUN_FALLBACK;
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

  // SVG-иконки для кнопок (mute/camera)
  const ICONS = {
    mic: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3m5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23A6.92 6.92 0 0 0 19 11m-4 .08L15 11c0 1.66-1.34 3-3 3v1.5c2.21 0 4.16-1.21 5.21-3M4.27 3 3 4.27 7.73 9H6c0 1.66 1.34 3 3 3v6h2v-1.73L14.73 17H10v-1c-.71 0-1.39-.16-2-.43L6.27 15 4.27 13 6.73 10.54 3.18 7 4.27 6.18 5 5.45 6 4.45 8.27 2.18 4.27 3M19 11h-1.7c0-.74-.16-1.43-.43-2.05l1.23 1.23A6.92 6.92 0 0 1 19 11z"/></svg>',
    cam: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M21 6.5 17.5 10 21 13.5V6.5M3.27 2 2 3.27 4.73 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.21 0 .39-.08.55-.18L19.73 21 21 19.73 3.27 2M16 16.5 5.5 6H16v10.5z"/></svg>',
    end: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    accept: '<svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.02.24l-2.2 2.2a15.05 15.05 0 0 1-6.59-6.58l2.2-2.21a1 1 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1c0 9.39 7.61 17 17 17a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1"/></svg>',
    reject: '<svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
  };

  const Calls = {
    pc: null,
    localStream: null,
    remoteStream: null,
    currentCall: null, // { peerName, type, isCaller }
    ringtone: null,
    ringtoneCtx: null,
    timer: null,
    timerStart: 0,
    overlay: null,
    _pendingOffer: null,

    init() {
      this._injectStyles();
      fetchIceServers();
    },

    _injectStyles() {
      if (document.getElementById('call-styles')) return;
      const s = document.createElement('style');
      s.id = 'call-styles';
      s.textContent = `
        .call-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.92); z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }
        .call-stage { position: relative; width: min(900px, 90vw); height: min(70vh, 600px); background: #111; border-radius: 12px; overflow: hidden; }
        .call-remote-video { width: 100%; height: 100%; object-fit: cover; background: #222; }
        .call-local-video { position: absolute; bottom: 16px; right: 16px; width: 140px; height: 200px; border-radius: 8px; object-fit: cover; background: #000; box-shadow: 0 4px 16px rgba(0,0,0,.5); z-index: 2; border: 2px solid rgba(255,255,255,.2); }
        .call-header { position: absolute; top: 16px; left: 16px; right: 16px; display: flex; align-items: center; gap: 12px; z-index: 2; }
        .call-avatar { width: 40px; height: 40px; border-radius: 50%; background: #2a7ae0; display: flex; align-items: center; justify-content: center; font-weight: 700; }
        .call-name { font-weight: 600; font-size: 16px; }
        .call-status { font-size: 13px; opacity: 0.7; }
        .call-timer { position: absolute; top: 16px; right: 16px; z-index: 2; font-size: 14px; background: rgba(0,0,0,.5); padding: 4px 10px; border-radius: 12px; }
        .call-actions { position: absolute; bottom: 24px; left: 0; right: 0; display: flex; gap: 12px; justify-content: center; z-index: 2; }
        .call-btn { width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.15); color: #fff; }
        .call-btn:hover { background: rgba(255,255,255,.25); }
        .call-btn.danger { background: #e74c3c; }
        .call-btn.accept { background: #2ecc71; }
        .call-btn.secondary { background: rgba(255,255,255,.15); }
        .call-btn.active { background: #2a7ae0; }
      `;
      document.head.appendChild(s);
    },

    async start(type) {
      if (this.currentCall) {
        QWAS.Toast.error('Звонок уже идёт');
        return;
      }
      if (!QWAS.State.currentChatInfo || !QWAS.State.currentChatInfo.chat) {
        QWAS.Toast.error('Откройте чат');
        return;
      }
      const c = QWAS.State.currentChatInfo.chat;
      const other = c.otherUser;
      if (!other) { QWAS.Toast.error('Нельзя позвонить в группу'); return; }
      await this._startCall(other.username, type);
    },

    async _startCall(peerName, type) {
      try {
        const constraints = {
          audio: true,
          video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        QWAS.Toast.error('Нет доступа к медиа: ' + (err.message || err.name));
        return;
      }
      await fetchIceServers();
      this._showOverlay(peerName, type, true);
      this._playRingtone();
      // Создаём peer connection
      this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
      this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));
      this.pc.ontrack = (e) => this._onTrack(e);
      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          QWAS.State.socket && QWAS.State.socket.emit('call_ice_candidate', { to: peerName, candidate: e.candidate });
        }
      };
      this.pc.onconnectionstatechange = () => {
        if (!this.pc) return;
        if (['failed', 'disconnected', 'closed'].includes(this.pc.connectionState)) {
          this._cleanup();
          QWAS.Toast.error('Связь потеряна');
        }
      };

      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        QWAS.State.socket && QWAS.State.socket.emit('call_user', { to: peerName, type, offer });
        this.currentCall = { peerName: peerName, type, isCaller: true };
      } catch (err) {
        QWAS.Toast.error('Не удалось начать звонок');
        this._cleanup();
      }
    },

    onIncoming(data) {
      if (!data || !data.from) return;
      // Если уже в звонке — отклонить
      if (this.currentCall) {
        QWAS.State.socket && QWAS.State.socket.emit('call_reject', { to: data.from });
        return;
      }
      this._showOverlay(data.from, data.type, false);
      this._playRingtone();
      this._pendingOffer = data.offer;
      this.currentCall = { peerName: data.from, type: data.type, isCaller: false };
    },

    async accept() {
      const call = this.currentCall;
      if (!call || call.isCaller) return;
      try {
        const constraints = {
          audio: true,
          video: call.type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        QWAS.Toast.error('Нет доступа к медиа');
        this._cleanup();
        return;
      }
      await fetchIceServers();
      this._stopRingtone();
      this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
      this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));
      this.pc.ontrack = (e) => this._onTrack(e);
      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          QWAS.State.socket && QWAS.State.socket.emit('call_ice_candidate', { to: call.peerName, candidate: e.candidate });
        }
      };
      this.pc.onconnectionstatechange = () => {
        if (!this.pc) return;
        if (['failed', 'disconnected', 'closed'].includes(this.pc.connectionState)) {
          this._cleanup();
          QWAS.Toast.error('Связь потеряна');
        }
      };
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
      // Переключаем оверлей: accept/reject → mute/camera/end, статус → "В разговоре"
      this._swapToInCall(call.peerName, call.type);
      this._startTimer();
    },

    reject() {
      const call = this.currentCall;
      if (!call) return;
      QWAS.State.socket && QWAS.State.socket.emit('call_reject', { to: call.peerName });
      this._cleanup();
    },

    onSignal(data) {
      if (!data || !data.answer) return;
      if (!this.pc) return;
      this.pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
      this._stopRingtone();
      this._startTimer();
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
      // Видео-элемент существует всегда, но для аудио-звонка он display:none.
      // Используем audio-элемент, если видео скрыто или его нет.
      const videoVisible = video && video.style.display !== 'none' && getComputedStyle(video).display !== 'none';
      if (videoVisible) {
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
          <video id="callRemoteVideo" class="call-remote-video" autoplay playsinline ${type === 'video' ? '' : 'style="display:none"'}></video>
          <audio id="callRemoteAudio" autoplay></audio>
          ${type === 'video' ? '' : `
            <div class="call-header" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div class="call-avatar" style="width:80px;height:80px;font-size:32px">${QWAS.Util.getInitials(peerName)}</div>
              <div class="call-name" style="margin-top:12px;font-size:22px">${QWAS.Util.escapeHtml(peerName)}</div>
              <div class="call-status" id="callStatus">${isCaller ? 'Вызов...' : 'Входящий звонок'}</div>
            </div>
          `}
          ${type === 'video' ? `
            <div class="call-header">
              <div class="call-avatar">${QWAS.Util.getInitials(peerName)}</div>
              <div>
                <div class="call-name">${QWAS.Util.escapeHtml(peerName)}</div>
                <div class="call-status" id="callStatus">${isCaller ? 'Вызов...' : 'Входящий звонок'}</div>
              </div>
            </div>
          ` : ''}
          <div class="call-timer" id="callTimer" style="display:none">0:00</div>
          ${type === 'video' ? '<video id="callLocalVideo" class="call-local-video" autoplay muted playsinline></video>' : ''}
        </div>
        <div class="call-actions" id="callActions">
          ${!isCaller ? `
            <button class="call-btn accept" id="callAcceptBtn" title="Принять">${ICONS.accept}</button>
            <button class="call-btn danger" id="callRejectBtn" title="Отклонить">${ICONS.reject}</button>
          ` : `
            <button class="call-btn secondary" id="callMuteBtn" title="Микрофон">${ICONS.mic}</button>
            ${type === 'video' ? `<button class="call-btn secondary" id="callCameraBtn" title="Камера">${ICONS.cam}</button>` : ''}
            <button class="call-btn danger" id="callEndBtn" title="Завершить">${ICONS.end}</button>
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
    },

    _swapToInCall(peerName, type) {
      // Меняет accept/reject на mute/camera/end (для callee после принятия).
      // Также обновляет #callStatus на "В разговоре".
      const actions = this.overlay?.querySelector('#callActions');
      if (!actions) return;
      actions.innerHTML = `
        <button class="call-btn secondary" id="callMuteBtn" title="Микрофон">${ICONS.mic}</button>
        ${type === 'video' ? `<button class="call-btn secondary" id="callCameraBtn" title="Камера">${ICONS.cam}</button>` : ''}
        <button class="call-btn danger" id="callEndBtn" title="Завершить">${ICONS.end}</button>
      `;
      const status = this.overlay.querySelector('#callStatus');
      if (status) status.textContent = 'В разговоре';
      // Показать локальный preview для видео
      const local = this.overlay.querySelector('#callLocalVideo');
      if (local && this.localStream && !local.srcObject) {
        local.srcObject = this.localStream;
      }
      this._bindActionButtons();
    },

    _bindActionButtons() {
      if (!this.overlay) return;
      const acceptBtn = this.overlay.querySelector('#callAcceptBtn');
      const rejectBtn = this.overlay.querySelector('#callRejectBtn');
      const endBtn = this.overlay.querySelector('#callEndBtn');
      const muteBtn = this.overlay.querySelector('#callMuteBtn');
      const camBtn = this.overlay.querySelector('#callCameraBtn');
      if (acceptBtn) acceptBtn.addEventListener('click', () => this.accept());
      if (rejectBtn) rejectBtn.addEventListener('click', () => this.reject());
      if (endBtn) endBtn.addEventListener('click', () => this.end());
      if (muteBtn) muteBtn.addEventListener('click', () => {
        const t = this.localStream?.getAudioTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        muteBtn.classList.toggle('active', !t.enabled);
        muteBtn.innerHTML = !t.enabled ? ICONS.micOff : ICONS.mic;
      });
      if (camBtn) camBtn.addEventListener('click', () => {
        const t = this.localStream?.getVideoTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        camBtn.classList.toggle('active', !t.enabled);
        camBtn.innerHTML = !t.enabled ? ICONS.camOff : ICONS.cam;
      });
    },

    _removeOverlay() {
      if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    },

    _startTimer() {
      const el = this.overlay?.querySelector('#callTimer');
      if (el) el.style.display = 'block';
      this.timerStart = Date.now();
      this.timer = setInterval(() => {
        const sec = Math.floor((Date.now() - this.timerStart) / 1000);
        if (el) el.textContent = QWAS.Util.formatDuration(sec);
        const status = this.overlay?.querySelector('#callStatus');
        if (status && this.currentCall?.isCaller) status.textContent = 'В разговоре';
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
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this.pc) { try { this.pc.close(); } catch {} this.pc = null; }
      if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
      this.remoteStream = null;
      this.currentCall = null;
      this._pendingOffer = null;
      this._removeOverlay();
    }
  };

  window.QWAS.Calls = Calls;
})();
