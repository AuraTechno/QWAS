(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.miwifi.com:3478' }
  ];

  const Calls = {
    callId: null,
    peer: null,
    localStream: null,
    remoteStream: null,
    callType: null,
    remoteUser: null,
    ringing: null,
    startedAt: 0,
    timerInt: null,
    muted: false,
    cameraOff: false,
    isCaller: false,
    hasEnded: false,
    audioCtx: null,
    audioAnalyser: null,
    audioData: null,
    ringtone: null,

    async start(type, username) {
      username = username || QWAS.State.current;
      if (!username || username.startsWith('group:') || username === QWAS.Config.FAVORITE_CHAT_ID) {
        QWAS.Toast.error('Звонки доступны только в личных чатах');
        return;
      }
      if (this.callId) { QWAS.Toast.info('Звонок уже идёт'); return; }

      this.callType = type;
      this.remoteUser = username;
      this.callId = 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      this.isCaller = true;
      this.hasEnded = false;
      this.showOverlay({ status: 'Вызов...', showAccept: false });
      try {
        await this.openLocalStream(type);
        await this.createPeer();
        const offer = await this.peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
        await this.peer.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', sdp: offer.sdp });
        QWAS.State.socket.emit('call_user', { to: username, type, callId: this.callId });
      } catch (err) {
        console.error('Call start error:', err);
        QWAS.Toast.error('Не удалось начать звонок: ' + (err.message || err.name));
        this.end();
      }
    },

    async openLocalStream(type) {
      const constraints = {
        audio: {
          echoCancellation: QWAS.State.settings?.echoCancellation !== false,
          noiseSuppression: QWAS.State.settings?.noiseSuppression !== false,
          autoGainControl: QWAS.State.settings?.autoGainControl !== false
        },
        video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
      };
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      const localVideo = document.getElementById('callLocalVideo');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
        localVideo.muted = true;
        localVideo.play().catch(() => {});
      }
    },

    async createPeer() {
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.peer = peer;
      this.localStream.getTracks().forEach(t => peer.addTrack(t, this.localStream));
      peer.ontrack = (e) => {
        this.remoteStream = e.streams[0];
        const remoteVideo = document.getElementById('callRemoteVideo');
        const remoteAudio = document.getElementById('callRemoteAudio');
        if (this.callType === 'video' && remoteVideo) {
          remoteVideo.srcObject = this.remoteStream;
          remoteVideo.play().catch(() => {});
        } else if (remoteAudio) {
          remoteAudio.srcObject = this.remoteStream;
          remoteAudio.play().catch(() => {});
        }
        this.markConnected();
      };
      peer.onicecandidate = (e) => {
        if (e.candidate) {
          this.sendSignal({ type: 'ice', candidate: e.candidate });
        }
      };
      peer.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
          if (!this.hasEnded) this.end();
        }
      };
    },

    sendSignal(signal) {
      if (!this.callId || !this.remoteUser) return;
      QWAS.State.socket.emit('call_signal', {
        to: this.remoteUser,
        callId: this.callId,
        signal
      });
    },

    incoming(data) {
      if (this.callId) {
        QWAS.Toast.info(`Входящий звонок от @${data.from} (занято)`);
        QWAS.State.socket.emit('call_end', { to: data.from, callId: data.callId, reason: 'busy' });
        return;
      }
      this.callId = data.callId;
      this.callType = data.type;
      this.remoteUser = data.from;
      this.isCaller = false;
      this.hasEnded = false;
      this.showOverlay({ status: 'Входящий ' + (data.type === 'video' ? 'видео' : '') + 'звонок', showAccept: true });
      this.playRingtone();
    },

    async accept() {
      try {
        this.stopRingtone();
        this.markAccepted();
        await this.openLocalStream(this.callType);
        await this.createPeer();
        this.sendSignal({ type: 'accept' });
      } catch (err) {
        console.error('Accept error:', err);
        QWAS.Toast.error('Не удалось принять звонок');
        this.end();
      }
    },

    async onSignal(data) {
      try {
        if (!this.peer) return;
        const sig = data.signal;
        if (!sig) return;
        if (sig.type === 'offer') {
          await this.peer.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
          const answer = await this.peer.createAnswer();
          await this.peer.setLocalDescription(answer);
          this.sendSignal({ type: 'answer', sdp: answer.sdp });
          this.markConnected();
        } else if (sig.type === 'answer') {
          await this.peer.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
        } else if (sig.type === 'ice') {
          if (sig.candidate) {
            try { await this.peer.addIceCandidate(sig.candidate); } catch {}
          }
        } else if (sig.type === 'accept') {
          this.markAccepted();
        }
      } catch (err) {
        console.error('Signal error:', err);
      }
    },

    onIceCandidate(data) {
      if (!this.peer || !data.candidate) return;
      try { this.peer.addIceCandidate(data.candidate); } catch {}
    },

    reject() {
      this.stopRingtone();
      if (this.remoteUser && this.callId) {
        QWAS.State.socket.emit('call_end', { to: this.remoteUser, callId: this.callId, reason: 'rejected' });
      }
      this.cleanup();
    },

    end() {
      if (this.hasEnded) return;
      this.hasEnded = true;
      this.stopRingtone();
      if (this.remoteUser && this.callId) {
        QWAS.State.socket.emit('call_end', { to: this.remoteUser, callId: this.callId, reason: 'ended' });
      }
      this.cleanup();
    },

    onRemoteEnd(data) {
      if (this.hasEnded) return;
      this.hasEnded = true;
      this.stopRingtone();
      const reason = data?.reason;
      if (reason === 'rejected') QWAS.Toast.info('Звонок отклонён');
      else if (reason === 'busy') QWAS.Toast.info('Абонент занят');
      else QWAS.Toast.info('Звонок завершён');
      this.cleanup();
    },

    toggleMute() {
      if (!this.localStream) return;
      this.muted = !this.muted;
      this.localStream.getAudioTracks().forEach(t => t.enabled = !this.muted);
      const btn = document.getElementById('callMuteBtn');
      if (btn) btn.classList.toggle('active', this.muted);
    },

    toggleCamera() {
      if (!this.localStream || this.callType !== 'video') return;
      this.cameraOff = !this.cameraOff;
      this.localStream.getVideoTracks().forEach(t => t.enabled = !this.cameraOff);
      const btn = document.getElementById('callCamBtn');
      if (btn) btn.classList.toggle('active', this.cameraOff);
    },

    async flipCamera() {
      if (!this.localStream) return;
      const tracks = this.localStream.getVideoTracks();
      if (!tracks.length) return;
      const cur = tracks[0].getSettings().facingMode;
      const next = cur === 'user' ? 'environment' : 'user';
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const newTrack = newStream.getVideoTracks()[0];
        const sender = this.peer?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
        tracks[0].stop();
        this.localStream.removeTrack(tracks[0]);
        this.localStream.addTrack(newTrack);
        const localVideo = document.getElementById('callLocalVideo');
        if (localVideo) localVideo.srcObject = this.localStream;
      } catch (e) {
        console.error('flip error', e);
      }
    },

    showOverlay({ status, showAccept }) {
      const chat = (QWAS.State.chats || []).find(c => c.username === this.remoteUser) || {};
      const name = chat.name || this.remoteUser || 'Собеседник';
      const avatar = chat.avatar;
      const avatarContent = avatar
        ? `<div class="call-avatar" style="background-image:url(${avatar});background-size:cover;"></div>`
        : `<div class="call-avatar avatar ${QWAS.Util.gradientFor(name)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(name))}</div>`;

      const wrap = document.createElement('div');
      wrap.className = 'call-overlay';
      wrap.id = 'callOverlay';
      wrap.innerHTML = `
        <div class="call-stage">
          ${this.callType === 'video' ? `
            <video id="callRemoteVideo" class="call-remote-video" autoplay playsinline></video>
            <video id="callLocalVideo" class="call-local-video" autoplay muted playsinline></video>
          ` : `<audio id="callRemoteAudio" autoplay></audio>`}
        </div>
        <div class="call-header">
          ${avatarContent}
          <div class="call-name">${QWAS.Util.escapeHtml(name)}</div>
          <div class="call-status" id="callStatus">${QWAS.Util.escapeHtml(status || '')}</div>
          <div class="call-timer" id="callTimer" style="display:none;">0:00</div>
        </div>
        <div class="call-actions">
          <button class="call-btn secondary" id="callMuteBtn" onclick="QWAS.Calls.toggleMute()" style="display:none;" title="Микрофон">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3m5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>
          </button>
          <button class="call-btn secondary" id="callCamBtn" onclick="QWAS.Calls.toggleCamera()" style="display:none;" title="Камера">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>
          </button>
          <button class="call-btn secondary" id="callFlipBtn" onclick="QWAS.Calls.flipCamera()" style="display:none;" title="Сменить камеру">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M20 4h-3.17L15 2H9L7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m-5 11.5V13H9v-2h6V8.5l3.5 3.5z"/></svg>
          </button>
          ${showAccept ? `
            <button class="call-btn accept" onclick="QWAS.Calls.accept()" title="Принять">
              <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.02.24l-2.2 2.2a15.05 15.05 0 0 1-6.59-6.58l2.2-2.21a1 1 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1c0 9.39 7.61 17 17 17a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1"/></svg>
            </button>
            <button class="call-btn danger" onclick="QWAS.Calls.reject()" title="Отклонить">
              <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.91 1.1-2.77 1.81-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 14.29c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 9.78 7.46 8 12 8s8.66 1.78 11.71 4.88c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.37 2.37c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.86-.71-1.79-1.32-2.77-1.81-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9"/></svg>
            </button>
          ` : `
            <button class="call-btn danger" onclick="QWAS.Calls.end()" title="Завершить">
              <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.91 1.1-2.77 1.81-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 14.29c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 9.78 7.46 8 12 8s8.66 1.78 11.71 4.88c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.37 2.37c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.86-.71-1.79-1.32-2.77-1.81-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9"/></svg>
            </button>
          `}
        </div>
      `;
      const old = document.getElementById('callOverlay');
      if (old) old.remove();
      document.body.appendChild(wrap);
    },

    markAccepted() {
      this.stopRingtone();
      const status = document.getElementById('callStatus');
      if (status) status.textContent = 'Соединение...';
      const muteBtn = document.getElementById('callMuteBtn');
      const camBtn = document.getElementById('callCamBtn');
      const flipBtn = document.getElementById('callFlipBtn');
      if (muteBtn) muteBtn.style.display = 'flex';
      if (this.callType === 'video' && camBtn) camBtn.style.display = 'flex';
      if (this.callType === 'video' && flipBtn) flipBtn.style.display = 'flex';
    },

    markConnected() {
      const status = document.getElementById('callStatus');
      if (status) status.style.display = 'none';
      const timer = document.getElementById('callTimer');
      if (timer) {
        timer.style.display = 'block';
        this.startedAt = Date.now();
        clearInterval(this.timerInt);
        this.timerInt = setInterval(() => {
          const s = (Date.now() - this.startedAt) / 1000;
          timer.textContent = QWAS.Util.formatDuration(s);
        }, 500);
      }
    },

    playRingtone() {
      try {
        this.stopRingtone();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain();
        gain.gain.value = 0.05;
        gain.connect(ctx.destination);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440;
        osc.connect(gain);
        osc.start();
        const beep = () => {
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          osc.frequency.setValueAtTime(480, ctx.currentTime + 0.2);
        };
        beep();
        this.ringtone = { ctx, osc, interval: setInterval(beep, 1000) };
      } catch {}
    },

    stopRingtone() {
      if (this.ringtone) {
        clearInterval(this.ringtone.interval);
        try { this.ringtone.osc.stop(); this.ringtone.ctx.close(); } catch {}
        this.ringtone = null;
      }
    },

    cleanup() {
      this.stopRingtone();
      clearInterval(this.timerInt);
      this.timerInt = null;
      this.startedAt = 0;
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop());
        this.localStream = null;
      }
      if (this.peer) {
        try { this.peer.close(); } catch {}
        this.peer = null;
      }
      this.remoteStream = null;
      this.callId = null;
      this.remoteUser = null;
      this.muted = false;
      this.cameraOff = false;
      const ov = document.getElementById('callOverlay');
      if (ov) ov.remove();
    }
  };

  QWAS.Calls = Calls;
})();
