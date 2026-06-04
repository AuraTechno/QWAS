// WebRTC звонки (аудио/видео)
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.miwifi.com:3478' }
  ];

  const Calls = {
    pc: null,
    localStream: null,
    remoteStream: null,
    currentCall: null, // { peerName, type, isCaller, isP2P }
    ringtone: null,
    timer: null,
    timerStart: 0,
    overlay: null,

    init() {
      this._injectStyles();
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
          video: type === 'video' ? { width: 1280, height: 720 } : false
        };
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        QWAS.Toast.error('Нет доступа к медиа: ' + (err.message || err.name));
        return;
      }
      this._showOverlay(peerName, type, true);
      this._playRingtone();
      // Создаём peer connection
      this.pc = new RTCPeerConnection({ iceServers: ICE });
      this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));
      this.pc.ontrack = (e) => this._onTrack(e);
      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          QWAS.State.socket && QWAS.State.socket.emit('call_ice_candidate', { to: peerName, candidate: e.candidate });
        }
      };
      this.pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(this.pc?.connectionState)) {
          this.end();
        }
      };

      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        QWAS.State.socket && QWAS.State.socket.emit('call_user', { to: peerName, type, offer });
        this.currentCall = { peerName: peerName, type, isCaller: true };
      } catch (err) {
        QWAS.Toast.error('Не удалось начать звонок');
        this.end();
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
          video: call.type === 'video' ? { width: 1280, height: 720 } : false
        };
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        QWAS.Toast.error('Нет доступа к медиа');
        this.end();
        return;
      }
      this._stopRingtone();
      this.pc = new RTCPeerConnection({ iceServers: ICE });
      this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));
      this.pc.ontrack = (e) => this._onTrack(e);
      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          QWAS.State.socket && QWAS.State.socket.emit('call_ice_candidate', { to: call.peerName, candidate: e.candidate });
        }
      };
      this.pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(this.pc?.connectionState)) {
          this.end();
        }
      };
      await this.pc.setRemoteDescription(new RTCSessionDescription(this._pendingOffer));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      QWAS.State.socket && QWAS.State.socket.emit('call_answer', { to: call.peerName, answer });
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
      const video = this.overlay?.querySelector('#callRemoteVideo');
      const audio = this.overlay?.querySelector('#callRemoteAudio');
      if (video && e.streams[0]) {
        video.srcObject = e.streams[0];
        video.play().catch(() => {});
      }
      if (audio && e.streams[0] && !video) {
        audio.srcObject = e.streams[0];
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
            <div class="call-avatar" id="callAvatar"></div>
            <div class="call-header" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div class="call-avatar" style="width:80px;height:80px;font-size:32px">${QWAS.Util.getInitials(peerName)}</div>
              <div class="call-name" style="margin-top:12px;font-size:22px">${QWAS.Util.escapeHtml(peerName)}</div>
              <div class="call-status">${isCaller ? 'Вызов...' : 'Входящий звонок'}</div>
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
        <div class="call-actions">
          ${!isCaller ? `
            <button class="call-btn accept" id="callAcceptBtn" title="Принять">
              <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.02.24l-2.2 2.2a15.05 15.05 0 0 1-6.59-6.58l2.2-2.21a1 1 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1c0 9.39 7.61 17 17 17a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1"/></svg>
            </button>
            <button class="call-btn danger" id="callRejectBtn" title="Отклонить">
              <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          ` : `
            <button class="call-btn secondary" id="callMuteBtn" title="Микрофон">
              <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3m5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>
            </button>
            ${type === 'video' ? `<button class="call-btn secondary" id="callCameraBtn" title="Камера">
              <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>
            </button>` : ''}
            <button class="call-btn danger" id="callEndBtn" title="Завершить">
              <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
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
      // Bind buttons
      const acceptBtn = o.querySelector('#callAcceptBtn');
      const rejectBtn = o.querySelector('#callRejectBtn');
      const endBtn = o.querySelector('#callEndBtn');
      const muteBtn = o.querySelector('#callMuteBtn');
      const camBtn = o.querySelector('#callCameraBtn');
      if (acceptBtn) acceptBtn.addEventListener('click', () => this.accept());
      if (rejectBtn) rejectBtn.addEventListener('click', () => this.reject());
      if (endBtn) endBtn.addEventListener('click', () => this.end());
      if (muteBtn) muteBtn.addEventListener('click', () => {
        const t = this.localStream?.getAudioTracks()[0];
        if (t) { t.enabled = !t.enabled; muteBtn.classList.toggle('active', !t.enabled); }
      });
      if (camBtn) camBtn.addEventListener('click', () => {
        const t = this.localStream?.getVideoTracks()[0];
        if (t) { t.enabled = !t.enabled; camBtn.classList.toggle('active', !t.enabled); }
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
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const beep = () => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 440;
          g.gain.value = 0.05;
          o.start();
          setTimeout(() => { o.stop(); }, 200);
        };
        this.ringtone = setInterval(beep, 1500);
        beep();
      } catch (e) {}
    },

    _stopRingtone() {
      if (this.ringtone) { clearInterval(this.ringtone); this.ringtone = null; }
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
