(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const App = {
    init() {
      QWAS.Prefs.load();
      QWAS.Prefs.applyTheme();
      this.detectMobile();
      window.addEventListener('resize', QWAS.Util.debounce(() => this.detectMobile(), 200));
      this.attachAuthHandlers();
      QWAS.Emoji.init();
      QWAS.Attach.init();
      QWAS.Composer.init();
      QWAS.Chats.init();

      document.addEventListener('click', (e) => {
        const search = document.getElementById('searchInput');
        if (search && !e.target.closest('.sidebar-search') && !e.target.closest('.search-results')) {
          QWAS.Search.hide();
        }
        const mainMenu = document.querySelector('.main-menu');
        if (mainMenu && !e.target.closest('.main-menu') && !e.target.closest('.sidebar-menu')) {
          mainMenu.remove();
        }
      });

      window.addEventListener('online', () => {
        QWAS.State.isOnline = true;
        QWAS.Toast.success('Соединение восстановлено');
        if (QWAS.State.socket) QWAS.State.socket.connect();
      });
      window.addEventListener('offline', () => {
        QWAS.State.isOnline = false;
        QWAS.Toast.warning('Нет подключения к интернету');
      });

      QWAS.Auth.checkAutoLogin();
    },

    detectMobile() {
      QWAS.State.isMobile = window.innerWidth <= 900;
    },

    attachAuthHandlers() {
      const lp = document.getElementById('loginPassword');
      if (lp) lp.addEventListener('keypress', (e) => { if (e.key === 'Enter') QWAS.Auth.handleLogin(); });
      const cp = document.getElementById('regConfirmPassword');
      if (cp) cp.addEventListener('keypress', (e) => { if (e.key === 'Enter') QWAS.Auth.handleRegister(); });
      const le = document.getElementById('loginEye');
      if (le) le.addEventListener('click', () => QWAS.Auth.togglePassword(document.getElementById('loginPassword')));
    },

    async start() {
      this.connectSocket();
      await this.loadInitialData();
      this.startUI();
    },

    startUI() {
      QWAS.Chats.render();
      QWAS.Chats.renderFolders();
      QWAS.Chats.renderStories();
    },

    connectSocket() {
      if (QWAS.State.socket) return;
      const socket = io({ auth: { token: QWAS.State.userToken }, transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        console.log('✅ Socket connected');
        socket.emit('set_presence', { presence: 'online' });
        if (QWAS.Messages && QWAS.Messages.resendPending) QWAS.Messages.resendPending();
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        if (QWAS.Messages && QWAS.Messages.markAllPending) QWAS.Messages.markAllPending();
      });

      socket.on('connect_error', (err) => {
        console.error('Socket error:', err.message);
      });

      socket.on('chat_list', (chats) => {
        QWAS.State.chats = chats || [];
        QWAS.Chats.render();
      });

      socket.on('group_list', (groups) => {
        QWAS.State.myGroups = groups || [];
      });

      socket.on('all_users', (users) => {
        QWAS.State.allUsers = users || [];
      });

      socket.on('notifications', (notifs) => {
        QWAS.State.notifications = notifs || [];
      });

      socket.on('new_message', (msg) => {
        this.handleNewMessage(msg);
      });

      socket.on('message_updated', (msg) => {
        this.handleMessageUpdate(msg);
      });

      socket.on('message_deleted', (data) => {
        this.handleMessageDelete(data.messageId);
      });

      socket.on('message_reaction', (data) => {
        QWAS.Messages.updateReactions(data.messageId, data.reactions);
      });

      socket.on('message_pinned', (data) => {
        const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
        const m = list.find(x => x._id === data.messageId);
        if (m) {
          m.isPinned = data.isPinned;
          m.pinnedBy = data.pinnedBy;
        }
        this.handleMessageUpdate(m);
      });

      socket.on('messages_read', (data) => {
        const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
        const isGroupRead = data.chatId && data.chatId.startsWith('group:');
        list.forEach(m => {
          if (m.from !== QWAS.State.me) return;
          if (isGroupRead) {
            if (m.to === data.chatId) {
              m.status = 'read';
              QWAS.Messages.updateStatus(m._id, 'read');
            }
          } else {
            if (data.chatWith === m.to || data.by === m.to) {
              m.status = 'read';
              QWAS.Messages.updateStatus(m._id, 'read');
            }
          }
        });
      });

      socket.on('message_status', (data) => {
        QWAS.Messages.updateStatus(data.messageId, data.status);
      });

      socket.on('chat_history', (data) => {
        if (QWAS.State.pagination.currentChat !== QWAS.State.current) return;
        const messages = data.messages || [];
        QWAS.State.hasMore = data.hasMore;
        if (data.page === 1) {
          QWAS.State.messagesByChat.set(QWAS.State.current, messages);
          QWAS.Messages.renderAll(messages);
        } else {
          const existing = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
          QWAS.State.messagesByChat.set(QWAS.State.current, [...messages, ...existing]);
          const wrap = document.getElementById('messagesWrapper');
          const st = wrap?.scrollTop;
          QWAS.Messages.renderAll(QWAS.State.messagesByChat.get(QWAS.State.current));
          if (wrap && st != null) wrap.scrollTop = st;
        }
      });

      socket.on('typing', (data) => {
        if (data.from === QWAS.State.current || data.chatId === QWAS.State.current) {
          QWAS.State.typingUsers.set(QWAS.State.current, data.from);
          if (QWAS.State.current === data.chatId || QWAS.State.current === data.from) {
            QWAS.Chat.renderHeader();
            const ind = document.getElementById('typingIndicator');
            const txt = document.getElementById('typingText');
            if (ind && txt) {
              ind.style.display = 'flex';
              txt.textContent = `${data.from} печатает...`;
            }
          }
        }
      });

      socket.on('stop_typing', (data) => {
        QWAS.State.typingUsers.delete(QWAS.State.current);
        const ind = document.getElementById('typingIndicator');
        if (ind) ind.style.display = 'none';
        if (QWAS.State.current) QWAS.Chat.renderHeader();
      });

      socket.on('incoming_call', (data) => {
        QWAS.Calls.incoming(data);
      });

      socket.on('call_signal', (data) => {
        QWAS.Calls.signal(data);
      });

      socket.on('call_end', (data) => {
        QWAS.Calls.end(data);
      });

      socket.on('group_updated', () => {
        this.loadGroups();
      });

      socket.on('group_deleted', (data) => {
        QWAS.Chats.removeChat('group:' + data.groupId);
        if (QWAS.State.current === 'group:' + data.groupId) QWAS.Chat.close();
        this.loadGroups();
      });

      socket.on('stories_feed', (stories) => {
        const grouped = {};
        for (const s of stories || []) {
          if (!grouped[s.author]) grouped[s.author] = [];
          grouped[s.author].push(s);
        }
        QWAS.State.stories = grouped;
        QWAS.Chats.renderStories();
      });

      QWAS.State.socket = socket;
    },

    handleNewMessage(msg) {
      const me = QWAS.State.me;
      const chatKey = msg.to.startsWith('group:')
        ? msg.to
        : (msg.from === me ? msg.to : msg.from);

      if (msg.to === QWAS.Config.FAVORITE_CHAT_ID) {
        if (QWAS.State.current === QWAS.Config.FAVORITE_CHAT_ID) {
          QWAS.Messages.add(msg);
        }
        return;
      }

      const isCurrentChat = QWAS.State.current === chatKey;

      if (isCurrentChat) {
        QWAS.Messages.add(msg);
        if (msg.from !== me) {
          QWAS.State.socket.emit('mark_as_read', { chatId: chatKey, from: msg.from });
        }
      } else {
        if (msg.from !== me) {
          QWAS.Toast.show(`Новое сообщение от ${msg.from}`, 'info', 2000);
          if (QWAS.State.settings && QWAS.State.settings.soundEnabled) {
            try {
              const a = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
              a.volume = 0.3;
              a.play().catch(() => {});
            } catch {}
          }
          if ('Notification' in window && Notification.permission === 'granted' && QWAS.State.settings && QWAS.State.settings.notifications) {
            try {
              new Notification(`QWAS — @${msg.from}`, { body: msg.message || '📎 Вложение' });
            } catch {}
          }
        }
      }
    },

    handleMessageUpdate(msg) {
      if (!msg) return;
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const idx = list.findIndex(m => m._id === msg._id);
      if (idx >= 0) {
        list[idx] = msg;
        QWAS.State.messagesByChat.set(QWAS.State.current, list);
        const container = document.getElementById('messages');
        if (container) {
          container.innerHTML = '';
          QWAS.Messages.appendMany(list);
        }
      }
    },

    handleMessageDelete(messageId) {
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const filtered = list.filter(m => m._id !== messageId);
      QWAS.State.messagesByChat.set(QWAS.State.current, filtered);
      const el = document.getElementById('msg-' + messageId)?.closest('.message-group');
      if (el) {
        el.style.transition = 'all 0.2s';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.95)';
        setTimeout(() => {
          const container = document.getElementById('messages');
          if (container) {
            container.innerHTML = '';
            QWAS.Messages.appendMany(filtered);
          }
        }, 200);
      }
    },

    async loadInitialData() {
      try {
        const [chats, users, contacts, blocked, folders] = await Promise.all([
          QWAS.API.get('/chats'),
          QWAS.API.get('/profile/all'),
          QWAS.API.get('/profile/contacts/list'),
          QWAS.API.get('/profile/blocked/list'),
          QWAS.API.get('/folders')
        ]);

        if (chats.ok) {
          QWAS.State.chats = chats.chats || [];
          QWAS.Chats.render();
        }
        if (users.ok) QWAS.State.allUsers = users.users || [];
        if (contacts.ok) QWAS.State.contacts = contacts.users || [];
        if (blocked.ok) QWAS.State.blocked = blocked.users || [];
        if (folders.ok) {
          QWAS.State.folders = folders.folders || [];
          QWAS.Chats.renderFolders();
        }

        await this.loadGroups();
      } catch (err) {
        console.error('loadInitialData', err);
      }
    },

    async loadGroups() {
      const r = await QWAS.API.get('/groups/my');
      if (r.ok) {
        QWAS.State.myGroups = r.groups || [];
      }
    }
  };

  QWAS.App = App;

  document.addEventListener('DOMContentLoaded', () => QWAS.App.init());
})();
