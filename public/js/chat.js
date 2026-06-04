// Открытие/закрытие чата, инфо о чате
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Chat = {
    init() {
      this.bindHeaderButtons();
      this.bindPinnedBarClose();
      this.bindEmptyActions();
      this.bindTyping();
      this.bindSwipeBack();
      this.bindPopState();
    },

    bindSwipeBack() {
      // Свайп вправо от левого края экрана → закрыть чат
      const area = document.getElementById('chatArea');
      if (!area) return;
      let startX = 0, startY = 0, tracking = false;
      const onStart = (e) => {
        if (window.innerWidth > 900) return;
        const t = e.touches ? e.touches[0] : e;
        if (!t) return;
        startX = t.clientX;
        startY = t.clientY;
        // Только если начало близко к левому краю
        tracking = startX <= 30;
      };
      const onMove = (e) => {
        if (!tracking) return;
        const t = e.touches ? e.touches[0] : e;
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = Math.abs(t.clientY - startY);
        if (dy > 50) { tracking = false; return; }
        if (dx > 80) {
          tracking = false;
          this.close();
        }
      };
      const onEnd = () => { tracking = false; };
      area.addEventListener('touchstart', onStart, { passive: true });
      area.addEventListener('touchmove', onMove, { passive: true });
      area.addEventListener('touchend', onEnd, { passive: true });
    },

    bindPopState() {
      // Кнопка "назад" в браузере закрывает чат
      window.addEventListener('popstate', (e) => {
        if (QWAS.State.current && window.innerWidth <= 900) {
          this.close();
        }
      });
    },

    bindHeaderButtons() {
      const map = {
        'chatBackBtn': () => this.close(),
        'chatVoiceCallBtn': () => QWAS.Calls && QWAS.Calls.start('voice'),
        'chatVideoCallBtn': () => QWAS.Calls && QWAS.Calls.start('video'),
        'chatSearchBtn': () => QWAS.Modals && QWAS.Modals.openChatSearch(),
        'chatInfoBtn': () => this.openInfo()
      };
      Object.keys(map).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', map[id]);
      });
      const headerInfo = document.getElementById('chatHeaderInfo');
      if (headerInfo) {
        headerInfo.addEventListener('click', () => this.openInfo());
      }
    },

    bindPinnedBarClose() {
      const close = document.getElementById('pinnedBarClose');
      if (close) close.addEventListener('click', () => this.closePinned());
    },

    bindEmptyActions() {
      const btn = document.getElementById('emptyChatNewChatBtn');
      if (btn) btn.addEventListener('click', () => QWAS.Modals && QWAS.Modals.openNewChat());
    },

    bindTyping() {
      // очистка таймеров печатания
      QWAS.State._typingTimers = QWAS.State._typingTimers || new Map();
    },

    async open(chatId) {
      chatId = parseInt(chatId);
      if (!chatId) return;

      // Если открыт другой чат — закроем
      const prev = QWAS.State.current;
      if (prev && prev !== chatId) {
        this.leaveChatRoom(prev);
      }

      QWAS.State.current = chatId;
      QWAS.State.currentChatInfo = null;
      QWAS.State.editingId = null;
      QWAS.State.replyingTo = null;
      QWAS.State.pendingFiles = [];

      // UI
      const empty = document.getElementById('emptyChat');
      const content = document.getElementById('chatContent');
      const area = document.getElementById('chatArea');
      if (empty) empty.style.display = 'none';
      if (content) content.style.display = 'flex';
      if (area) area.dataset.empty = 'false';

      // Очистим сообщения
      const list = document.getElementById('messages');
      if (list) list.innerHTML = '';

      // Присоединимся к комнате
      if (QWAS.State.socket) QWAS.State.socket.emit('join_chat', { chatId });

      // Загрузим инфо
      const info = await QWAS.API.chatInfo(chatId);
      if (info && info.ok) {
        QWAS.State.currentChatInfo = info;
        this.renderHeader(info);
      }

      // Загрузим сообщения
      await QWAS.Messages && QWAS.Messages.loadInitial(chatId);

      // Помечаем прочитанным
      QWAS.Chats.markRead(chatId);

      // Мобильный: показать чат со слайдом
      if (window.innerWidth <= 900) {
        const main = document.getElementById('mainScreen');
        if (main) {
          main.classList.add('chat-open');
          // Запускаем историю для браузерной кнопки "назад"
          try { history.pushState({ chat: chatId }, '', '#chat/' + chatId); } catch (e) {}
        }
      }

      // Скроллим вниз
      QWAS.Messages && QWAS.Messages.scrollToBottom(true);

      // Обновить список чатов (highlight)
      QWAS.Chats.render();
    },

    leaveChatRoom(chatId) {
      if (!chatId) return;
      if (QWAS.State.socket) QWAS.State.socket.emit('leave_chat', { chatId });
    },

    close() {
      const prev = QWAS.State.current;
      if (prev) this.leaveChatRoom(prev);

      QWAS.State.clearCurrent();

      const empty = document.getElementById('emptyChat');
      const content = document.getElementById('chatContent');
      const area = document.getElementById('chatArea');
      if (empty) empty.style.display = 'flex';
      if (content) content.style.display = 'none';
      if (area) area.dataset.empty = 'true';

      const list = document.getElementById('messages');
      if (list) list.innerHTML = '';

      QWAS.Chats.render();

      if (window.innerWidth <= 900) {
        const main = document.getElementById('mainScreen');
        if (main) main.classList.remove('chat-open');
        try { if (location.hash.startsWith('#chat/')) history.back(); } catch (e) {}
      }
    },

    renderHeader(info) {
      const c = info.chat;
      const other = c.otherUser;
      let title = c.title || (other ? QWAS.Util.getUserDisplayName(other) : 'Чат');
      const avatarEl = document.getElementById('chatAvatar');
      const titleEl = document.getElementById('chatTitle');
      const subtitleEl = document.getElementById('chatSubtitle');

      if (titleEl) titleEl.textContent = title;
      if (avatarEl) {
        if (c.avatarUrl) {
          avatarEl.innerHTML = `<img src="${QWAS.Util.escapeAttr(c.avatarUrl)}" alt="">`;
        } else if (other) {
          avatarEl.innerHTML = '';
          avatarEl.appendChild(this._avatarNode(other, 40));
        } else {
          avatarEl.innerHTML = '';
          avatarEl.appendChild(this._avatarNode({ firstName: c.title, username: 'g' + c.chatId }, 40));
        }
      }

      if (subtitleEl) {
        if (c.type === 'dm' && other) {
          const online = QWAS.State.online.has(other.username);
          subtitleEl.textContent = online ? 'в сети' : (other.lastSeen ? QWAS.Util.timeAgo(other.lastSeen) : 'не в сети');
        } else if (c.type === 'group' || c.type === 'channel') {
          const n = (info.members || []).length;
          subtitleEl.textContent = `${n} участник${this._plural(n)}`;
        } else {
          subtitleEl.textContent = '';
        }
      }
    },

    _avatarNode(u, size) {
      const div = document.createElement('div');
      div.className = 'avatar';
      if (u.avatarUrl) {
        div.innerHTML = `<img src="${QWAS.Util.escapeAttr(u.avatarUrl)}" alt="">`;
      } else {
        div.classList.add('avatar-letters');
        div.style.background = QWAS.Util.avatarColor(u.username || u.firstName);
        div.textContent = QWAS.Util.getInitials(u.firstName, u.lastName);
      }
      div.style.width = size + 'px';
      div.style.height = size + 'px';
      return div;
    },

    _plural(n) {
      const mod10 = n % 10, mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return '';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'а';
      return 'ов';
    },

    async openInfo() {
      if (!QWAS.State.current) return;
      if (QWAS.Modals) QWAS.Modals.openChatInfo(QWAS.State.current);
    },

    closePinned() {
      const bar = document.getElementById('pinnedBar');
      if (bar) bar.style.display = 'none';
    },

    onTyping(data) {
      if (!data || !data.chatId) return;
      if (data.chatId !== QWAS.State.current) return;
      if (data.username === QWAS.State.me?.username) return;
      const ind = document.getElementById('typingIndicator');
      const txt = document.getElementById('typingText');
      if (!ind || !txt) return;
      txt.textContent = `${data.username} печатает...`;
      ind.style.display = 'flex';
      // auto-hide
      const map = QWAS.State._typingTimers;
      if (map.has(data.username)) clearTimeout(map.get(data.username));
      map.set(data.username, setTimeout(() => this.onStopTyping({ chatId: data.chatId, username: data.username }), 5000));
    },

    onStopTyping(data) {
      if (!data || !data.chatId) return;
      if (data.chatId !== QWAS.State.current) return;
      const map = QWAS.State._typingTimers;
      if (map && map.has(data.username)) {
        clearTimeout(map.get(data.username));
        map.delete(data.username);
      }
      // Скрываем только если других "печатающих" не осталось
      const ind = document.getElementById('typingIndicator');
      if (!ind) return;
      const stillTyping = map && map.size > 0;
      if (!stillTyping) ind.style.display = 'none';
    }
  };

  window.QWAS.Chat = Chat;
})();
