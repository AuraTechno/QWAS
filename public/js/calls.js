(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Calls = {
    callId: null,
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    callType: null,
    caller: null,

    async start(type, username) {
      username = username || QWAS.State.current;
      if (!username || username.startsWith('group:') || username === QWAS.Config.FAVORITE_CHAT_ID) {
        QWAS.Toast.error('Звонки доступны только в личных чатах');
        return;
      }

      this.callType = type;
      this.caller = QWAS.State.me;
      this.callId = 'call_' + Date.now();
      this.showOutgoing(username);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video' ? { facingMode: 'user' } : false
        });
        if (QWAS.State.socket) {
          QWAS.State.socket.emit('call_user', { to: username, type, callId: this.callId });
        }
      } catch (err) {
        QWAS.Toast.error('Нет доступа к медиа');
        this.end();
      }
    },

    showOutgoing(username) {
      const chat = (QWAS.State.chats || []).find(c => c.username === username) || {};
      const name = QWAS.Util.getUserDisplayName(chat) || username;
      this.renderCallScreen({
        name,
        avatar: chat.avatar,
        status: 'Вызов...',
        showAccept: false
      });
    },

    incoming(data) {
      this.callId = data.callId;
      this.callType = data.type;
      this.caller = data.from;
      const chat = (QWAS.State.chats || []).find(c => c.username === data.from) || {};
      const name = QWAS.Util.getUserDisplayName(chat) || data.from;

      if (this.callOver) return;
      this.renderCallScreen({
        name, avatar: chat.avatar,
        status: 'Входящий ' + (data.type === 'video' ? 'видео' : '') + 'звонок',
        showAccept: true
      });
    },

    renderCallScreen({ name, avatar, status, showAccept }) {
      this.callOver = null;
      const overlay = document.createElement('div');
      overlay.className = 'call-overlay';
      overlay.id = 'callOverlay';

      const avatarContent = avatar
        ? `<div class="call-avatar" style="background-image:url(${avatar});background-size:cover;"></div>`
        : `<div class="call-avatar avatar ${QWAS.Util.gradientFor(name)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(name))}</div>`;

      overlay.innerHTML = `
        <div class="call-header">
          ${avatarContent}
          <div class="call-name">${QWAS.Util.escapeHtml(name)}</div>
          <div class="call-status">${QWAS.Util.escapeHtml(status)}</div>
        </div>
        <div class="call-actions">
          ${showAccept
            ? `<button class="call-btn accept" onclick="QWAS.Calls.accept()">
                <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.02.24l-2.2 2.2a15.05 15.05 0 0 1-6.59-6.58l2.2-2.21a1 1 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1c0 9.39 7.61 17 17 17a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1"/></svg>
              </button>
              <button class="call-btn danger" onclick="QWAS.Calls.reject()">
                <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.91 1.1-2.77 1.81-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 14.29c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 9.78 7.46 8 12 8s8.66 1.78 11.71 4.88c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.37 2.37c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.86-.71-1.79-1.32-2.77-1.81-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9"/></svg>
              </button>`
            : `<button class="call-btn danger" onclick="QWAS.Calls.end()">
                <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.91 1.1-2.77 1.81-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 14.29c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 9.78 7.46 8 12 8s8.66 1.78 11.71 4.88c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.37 2.37c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.86-.71-1.79-1.32-2.77-1.81-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9"/></svg>
              </button>`}
        </div>
      `;
      const existing = document.getElementById('callOverlay');
      if (existing) existing.remove();
      document.body.appendChild(overlay);
    },

    async accept() {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: this.callType === 'video' ? { facingMode: 'user' } : false
        });
        if (QWAS.State.socket) {
          QWAS.State.socket.emit('call_signal', { to: this.caller, callId: this.callId, signal: { type: 'accept' } });
        }
      } catch (err) {
        QWAS.Toast.error('Нет доступа к медиа');
        this.end();
      }
    },

    reject() {
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('call_end', { to: this.caller, callId: this.callId });
      }
      this.cleanup();
    },

    signal(data) {
      if (data.signal?.type === 'accept') {
        QWAS.Toast.info('Звонок принят');
      }
    },

    end(data) {
      if (data && QWAS.State.socket) {
        QWAS.State.socket.emit('call_end', { to: data.from || this.caller, callId: data.callId || this.callId });
      }
      this.cleanup();
    },

    cleanup() {
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop());
        this.localStream = null;
      }
      const overlay = document.getElementById('callOverlay');
      if (overlay) overlay.remove();
      this.callId = null;
    }
  };

  QWAS.Calls = Calls;
})();
