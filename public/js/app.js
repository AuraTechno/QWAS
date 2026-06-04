// Главный модуль: инициализация после входа
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const App = {
    async start() {
      // Инициализируем все модули (навешиваем обработчики)
      QWAS.Toast && QWAS.Toast._ensure();

      // Подключаем сокет
      this.connectSocket();

      // Инициализация модулей
      const mods = [
        QWAS.Sidebar, QWAS.SidebarSearch, QWAS.Chats,
        QWAS.Chat, QWAS.Messages, QWAS.Composer, QWAS.Attach, QWAS.Emoji, QWAS.Voice,
        QWAS.Calls, QWAS.Notifications, QWAS.Folders, QWAS.Stories, QWAS.Groups,
        QWAS.Search, QWAS.Lightbox, QWAS.Reactions, QWAS.ContextMenu,
        QWAS.Modals, QWAS.Profile, QWAS.MainMenu
      ];
      for (const m of mods) {
        if (m && typeof m.init === 'function') {
          try { m.init(); }
          catch (e) { console.error('init error in module:', m, e); }
        }
      }

      // Глобальные кнопки
      this._bindGlobalButtons();

      // Загружаем начальные данные
      await this.loadInitialData();
      QWAS.State.triggerReady();
    },

    connectSocket() {
      const token = QWAS.State.getToken();
      if (!token) return;
      if (QWAS.State.socket) {
        try { QWAS.State.socket.disconnect(); } catch {}
        QWAS.State.socket = null;
      }
      // eslint-disable-next-line no-undef
      const socket = io({
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
      });
      QWAS.State.socket = socket;

      socket.on('connect', () => {
        console.log('[WS] connected');
      });

      socket.on('connect_error', (err) => {
        console.warn('[WS] connect_error', err.message);
        if (err.message === 'INVALID_TOKEN' || err.message === 'AUTH_REQUIRED') {
          QWAS.Toast.error('Сессия истекла, войдите снова');
          QWAS.Auth.logout();
        }
      });

      socket.on('init', (data) => {
        if (data.me) QWAS.State.me = data.me;
        if (Array.isArray(data.onlineUsers)) {
          QWAS.State.online = new Set(data.onlineUsers.map(u => u.username));
        }
        if (data.chats) QWAS.Chats && QWAS.Chats.setChats(data.chats);
        if (data.notifications) QWAS.Notifications && QWAS.Notifications.setNotifications(data.notifications);
        if (data.stories) QWAS.Stories && QWAS.Stories.setStories(data.stories);
        if (data.totalUnread !== undefined) {
          QWAS.Sidebar && QWAS.Sidebar.setTotalUnread(data.totalUnread);
        }
        if (QWAS.Sidebar && QWAS.Sidebar.updateOnline) QWAS.Sidebar.updateOnline();
        if (QWAS.Sidebar && QWAS.Sidebar.render) QWAS.Sidebar.render();
      });

      socket.on('new_message', (msg) => {
        QWAS.Messages && QWAS.Messages.onIncoming(msg);
      });

      socket.on('message_edited', (msg) => {
        QWAS.Messages && QWAS.Messages.onEdited(msg);
      });

      socket.on('message_deleted', (data) => {
        QWAS.Messages && QWAS.Messages.onDeleted(data);
      });

      socket.on('message_read', (data) => {
        QWAS.Messages && QWAS.Messages.onReadReceipt(data);
      });

      socket.on('reaction_added', (data) => {
        QWAS.Messages && QWAS.Messages.onReaction(data);
      });
      socket.on('reaction_removed', (data) => {
        QWAS.Messages && QWAS.Messages.onReaction(data);
      });

      socket.on('user:online', (data) => {
        if (data && data.username) {
          QWAS.State.online.add(data.username);
          QWAS.Sidebar && QWAS.Sidebar.updateOnline && QWAS.Sidebar.updateOnline();
          QWAS.Messages && QWAS.Messages.updateOnline && QWAS.Messages.updateOnline();
        }
      });
      socket.on('user:offline', (data) => {
        if (data && data.username) {
          QWAS.State.online.delete(data.username);
          QWAS.Sidebar && QWAS.Sidebar.updateOnline && QWAS.Sidebar.updateOnline();
          QWAS.Messages && QWAS.Messages.updateOnline && QWAS.Messages.updateOnline();
        }
      });

      socket.on('typing', (data) => QWAS.Chat && QWAS.Chat.onTyping(data));
      socket.on('stop_typing', (data) => QWAS.Chat && QWAS.Chat.onStopTyping(data));

      socket.on('incoming_call', (data) => QWAS.Calls && QWAS.Calls.onIncoming(data));
      socket.on('call_signal', (data) => QWAS.Calls && QWAS.Calls.onSignal(data));
      socket.on('call_ice_candidate', (data) => QWAS.Calls && QWAS.Calls.onIceCandidate(data));
      socket.on('call_end', (data) => QWAS.Calls && QWAS.Calls.onRemoteEnd(data));

      socket.on('chat_update', () => {
        QWAS.Chats && QWAS.Chats.reload();
      });

      socket.on('disconnect', (reason) => {
        console.log('[WS] disconnect', reason);
      });
    },

    async loadInitialData() {
      try {
        const r = await QWAS.API.chats('all');
        if (r && r.ok) {
          QWAS.Chats && QWAS.Chats.setChats(r.chats);
          if (QWAS.Sidebar && QWAS.Sidebar.setTotalUnread) QWAS.Sidebar.setTotalUnread(r.totalUnread || 0);
          if (QWAS.Sidebar && QWAS.Sidebar.render) QWAS.Sidebar.render();
        }
      } catch (e) { console.warn('load chats failed', e); }
    },

    _bindGlobalButtons() {
      // FAB — новый чат
      const fab = document.getElementById('fabNewChat');
      if (fab) fab.addEventListener('click', () => QWAS.Modals && QWAS.Modals.openNewChat());

      // Voice record UI buttons
      const vCancel = document.getElementById('voiceCancelBtn');
      if (vCancel) vCancel.addEventListener('click', () => QWAS.Voice && QWAS.Voice.cancel());
      const vLock = document.getElementById('voiceLockBtn');
      if (vLock) vLock.addEventListener('click', () => QWAS.Voice && QWAS.Voice.lockRecord());
      const vSend = document.getElementById('voiceSendBtn');
      if (vSend) vSend.addEventListener('click', () => QWAS.Voice && QWAS.Voice.stop());

      // Lightbox клик по фону
      const lb = document.getElementById('lightbox');
      if (lb) {
        lb.addEventListener('click', () => QWAS.Lightbox && QWAS.Lightbox.close());
        const closeBtn = lb.querySelector('.lightbox-close');
        if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); QWAS.Lightbox && QWAS.Lightbox.close(); });
      }

      // Emoji init
      if (QWAS.Emoji && typeof QWAS.Emoji.init === 'function') {
        QWAS.Emoji.init();
      }
    }
  };

  window.QWAS.App = App;
})();
