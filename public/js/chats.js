// Список чатов: рендер, фильтры по вкладкам, закрепление/архив
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Chats = {
    list: [],
    currentTab: 'all',
    isLoading: false,

    init() {
      this.bindTabs();
    },

    bindTabs() {
      document.querySelectorAll('.chats-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const t = tab.dataset.tab;
          if (t) this.switchTab(t);
        });
      });
    },

    setChats(list) {
      this.list = Array.isArray(list) ? list : [];
    },

    switchTab(tab) {
      this.currentTab = tab;
      document.querySelectorAll('.chats-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
      });
      this.render();
    },

    async reload() {
      if (this.isLoading) return;
      this.isLoading = true;
      try {
        const tab = this.currentTab;
        const endpoint = (tab === 'archived') ? '/chats/archived' : `/chats?tab=${tab}`;
        const r = await QWAS.API.get(endpoint);
        if (r && r.ok) {
          this.setChats(r.chats);
          if (r.totalUnread !== undefined && QWAS.Sidebar) {
            QWAS.Sidebar.setTotalUnread(r.totalUnread);
          }
          this.render();
        }
      } finally {
        this.isLoading = false;
      }
    },

    render() {
      const container = document.getElementById('chatsList');
      const empty = document.getElementById('chatsEmpty');
      if (!container) return;

      const filtered = this.filterForTab(this.list);
      if (!filtered.length) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
      }
      if (empty) empty.style.display = 'none';
      container.innerHTML = filtered.map(c => this.renderItem(c)).join('');
      this._bindItemEvents(container);
    },

    _bindItemEvents(container) {
      container.querySelectorAll('.chat-item').forEach(el => {
        if (el.dataset.bound) return;
        el.dataset.bound = '1';
        el.addEventListener('click', () => {
          const id = parseInt(el.dataset.chatId);
          if (id) QWAS.Chat && QWAS.Chat.open(id);
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const id = parseInt(el.dataset.chatId);
          if (id && QWAS.ContextMenu) QWAS.ContextMenu.showChatMenu(e, id);
        });
      });
    },

    // Инкрементальный апдейт: меняем только затронутый элемент, не перерисовывая весь список
    updateItem(chatId, patch) {
      const idx = this.list.findIndex(c => c.chatId === chatId);
      if (idx < 0) return false;
      this.list[idx] = { ...this.list[idx], ...patch };
      // Если этот чат в текущем табе — обновим DOM-узел
      const filtered = this.filterForTab(this.list);
      const visible = filtered.findIndex(c => c.chatId === chatId);
      const container = document.getElementById('chatsList');
      if (!container) return false;
      if (visible < 0) {
        // Чат больше не в текущем табе — удалим
        const node = container.querySelector(`[data-chat-id="${chatId}"]`);
        if (node) node.remove();
        if (!container.children.length) {
          const empty = document.getElementById('chatsEmpty');
          if (empty) empty.style.display = 'flex';
        }
        return true;
      }
      const node = container.querySelector(`[data-chat-id="${chatId}"]`);
      if (node) {
        const tmp = document.createElement('div');
        tmp.innerHTML = this.renderItem(this.list[idx]);
        const newNode = tmp.firstElementChild;
        if (newNode) {
          newNode.dataset.bound = '1';
          newNode.addEventListener('click', () => QWAS.Chat && QWAS.Chat.open(chatId));
          newNode.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (QWAS.ContextMenu) QWAS.ContextMenu.showChatMenu(e, chatId);
          });
          node.replaceWith(newNode);
        }
      }
      return true;
    },

    // Вставить новый чат наверх или переместить существующий
    promoteChat(chatId) {
      const idx = this.list.findIndex(c => c.chatId === chatId);
      if (idx < 0) return;
      const item = this.list[idx];
      this.list.splice(idx, 1);
      this.list.unshift(item);
    },

    filterForTab(list) {
      if (this.currentTab === 'all') {
        return list.filter(c => !c.isArchived);
      }
      if (this.currentTab === 'unread') {
        return list.filter(c => c.unreadCount > 0 && !c.isArchived);
      }
      if (this.currentTab === 'groups') {
        return list.filter(c => c.type === 'group' || c.type === 'channel');
      }
      if (this.currentTab === 'channels') {
        return list.filter(c => c.type === 'channel');
      }
      if (this.currentTab === 'contacts') {
        return list.filter(c => c.type === 'dm' && c.otherUser);
      }
      if (this.currentTab === 'archived') {
        return list.filter(c => c.isArchived);
      }
      return list;
    },

    renderItem(c) {
      const isOnline = c.otherUser && QWAS.State.online.has(c.otherUser.username);
      let title = c.title || (c.otherUser ? QWAS.Util.getUserDisplayName(c.otherUser) : 'Чат');
      let avatar = QWAS.Util.avatarHtml(c.otherUser || { firstName: c.title, lastName: '', username: 'g' + c.chatId }, 48);
      if (c.avatarUrl) {
        avatar = `<div class="avatar" style="width:48px;height:48px"><img src="${QWAS.Util.escapeAttr(c.avatarUrl)}" alt=""></div>`;
      }
      let last = c.lastMessageText || '';
      if (c.lastMessageType && c.lastMessageType !== 'text') {
        const prefix = this.typePrefix(c.lastMessageType);
        last = prefix + (last ? ' ' + last : '');
      }
      if (c.lastMessageFrom) {
        const fromName = c.lastMessageFrom.username === QWAS.State.me?.username
          ? 'Вы'
          : (c.lastMessageFrom.firstName || c.lastMessageFrom.username);
        last = `${QWAS.Util.escapeHtml(fromName)}: ${QWAS.Util.escapeHtml(last)}`;
      }
      const time = c.lastMessageAt ? QWAS.Util.formatTime(c.lastMessageAt) : '';
      const unread = c.unreadCount > 0 ? `<span class="chat-item-unread">${c.unreadCount > 99 ? '99+' : c.unreadCount}</span>` : '';
      const muted = c.isMuted ? '<span class="chat-item-mute">🔕</span>' : '';
      const pinned = c.isPinned ? '<span class="chat-item-pin">📌</span>' : '';
      const verified = (c.type === 'channel' || c.type === 'group') && c.username ? '<span class="verified">✓</span>' : '';
      const isActive = QWAS.State.current === c.chatId ? ' active' : '';
      const onlineDot = isOnline ? '<span class="online-dot"></span>' : '';

      return `<div class="chat-item${isActive}" data-chat-id="${c.chatId}">
        <div class="chat-item-avatar">
          ${avatar}
          ${onlineDot}
        </div>
        <div class="chat-item-content">
          <div class="chat-item-row1">
            <div class="chat-item-name">${QWAS.Util.escapeHtml(title)} ${verified} ${pinned} ${muted}</div>
            <div class="chat-item-meta">${time}</div>
          </div>
          <div class="chat-item-row2">
            <div class="chat-item-preview">${last || '<i>Нет сообщений</i>'}</div>
            ${unread}
          </div>
        </div>
      </div>`;
    },

    typePrefix(type) {
      const map = {
        image: '📷', video: '🎥', voice: '🎤', file: '📎',
        round: '⭕', location: '📍', contact: '👤', poll: '📊',
        system: '⚙️', service: 'ℹ️'
      };
      return map[type] || '';
    },

    // Обновить один чат в списке (после нового сообщения)
    upsert(userChat) {
      if (!userChat) return;
      const idx = this.list.findIndex(c => c.chatId === userChat.chatId);
      if (idx >= 0) {
        this.list[idx] = { ...this.list[idx], ...userChat };
        this.promoteChat(userChat.chatId);
      } else {
        this.list.unshift(userChat);
      }
      // Инкрементальный апдейт вместо полного re-render
      this.updateItem(userChat.chatId, userChat);
    },

    async setPinned(chatId, pinned) {
      const r = await QWAS.API.setPinned(chatId, pinned);
      if (r && r.ok) {
        const c = this.list.find(x => x.chatId === chatId);
        if (c) c.isPinned = !!pinned;
        this.render();
      }
    },

    async setArchived(chatId, archived) {
      const r = await QWAS.API.setArchived(chatId, archived);
      if (r && r.ok) {
        const c = this.list.find(x => x.chatId === chatId);
        if (c) c.isArchived = !!archived;
        this.render();
      }
    },

    async setMuted(chatId, muted) {
      const r = await QWAS.API.setMuted(chatId, muted);
      if (r && r.ok) {
        const c = this.list.find(x => x.chatId === chatId);
        if (c) c.isMuted = !!muted;
        this.updateItem(chatId, { isMuted: !!muted });
      }
    },

    async markRead(chatId) {
      const c = this.list.find(x => x.chatId === chatId);
      if (c) {
        c.unreadCount = 0;
        this.updateItem(chatId, { unreadCount: 0 });
      }
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('mark_as_read', { chatId });
      } else {
        await QWAS.API.markRead(chatId);
      }
    }
  };

  window.QWAS.Chats = Chats;
})();
