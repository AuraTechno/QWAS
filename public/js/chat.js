(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Chat = {
    info: null,
    searchQuery: '',
    highlightMessageId: null,

    open(username) {
      if (QWAS.State.current === username && this.info) {
        this.show();
        return;
      }
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('reset_pagination');
      }
      QWAS.State.current = username;
      QWAS.State.pagination = { currentChat: username, page: 1, hasMore: true, isLoading: false };
      QWAS.State.replyTo = null;
      QWAS.State.editingId = null;
      QWAS.State.pendingFiles = [];
      QWAS.State.selectedMessages = new Set();
      QWAS.State.isSelectionMode = false;
      QWAS.State.typingUsers.delete(username);
      this.searchQuery = '';
      this.info = null;

      this.show();
      this.renderHeader();
      this.clearMessages();
      QWAS.Composer.updateSendButton();
      QWAS.Composer.hideAttachMenu();
      QWAS.Composer.hideEmojiPanel();
      QWAS.ReplyPreview.hide();
      QWAS.SelectionActions.hide();

      this.loadInfo();
      this.loadHistory();

      if (QWAS.State.isMobile) {
        document.getElementById('mainScreen').classList.add('chat-open');
      }

      QWAS.Chats.render();
    },

    show() {
      const empty = document.getElementById('emptyChat');
      const content = document.getElementById('chatContent');
      if (empty) empty.style.display = 'none';
      if (content) content.style.display = 'flex';
      const area = document.getElementById('chatArea');
      if (area) area.dataset.empty = 'false';
    },

    close() {
      QWAS.State.current = '';
      QWAS.State.replyTo = null;
      QWAS.State.editingId = null;
      QWAS.State.pendingFiles = [];
      const empty = document.getElementById('emptyChat');
      const content = document.getElementById('chatContent');
      if (empty) empty.style.display = 'flex';
      if (content) content.style.display = 'none';
      const area = document.getElementById('chatArea');
      if (area) area.dataset.empty = 'true';
      this.info = null;

      if (QWAS.State.isMobile) {
        document.getElementById('mainScreen').classList.remove('chat-open');
      }
      QWAS.Chats.render();
    },

    renderHeader() {
      const username = QWAS.State.current;
      const chat = (QWAS.State.chats || []).find(c => c.username === username) || {};
      const title = document.getElementById('chatTitle');
      const subtitle = document.getElementById('chatSubtitle');
      const avatar = document.getElementById('chatAvatar');

      if (username === QWAS.Config.FAVORITE_CHAT_ID) {
        title.textContent = 'Избранное';
        subtitle.textContent = 'Личные заметки и файлы';
        QWAS.Util.renderAvatar(avatar, { username: 'favorites', firstName: '⭐' });
        return;
      }

      if (chat.type === 'group') {
        title.textContent = chat.name || 'Группа';
        subtitle.innerHTML = `${chat.memberCount || 0} ${QWAS.Util.pluralize(chat.memberCount || 0, ['участник', 'участника', 'участников'])}`;
      } else {
        title.textContent = QWAS.Util.getUserDisplayName(chat) || chat.username || username;
        if (QWAS.State.typingUsers.get(username)) {
          subtitle.innerHTML = `печатает<span class="typing-dots-mini"><span></span><span></span><span></span></span>`;
        } else if (chat.online) {
          subtitle.innerHTML = '<span style="color:var(--green);">в сети</span>';
        } else if (chat.lastSeen && QWAS.State.settings.showLastSeen) {
          subtitle.textContent = QWAS.Util.lastSeenText(chat.lastSeen, false);
        } else {
          subtitle.textContent = '';
        }
      }

      if (chat.avatar) {
        avatar.outerHTML = `<div class="avatar size-40 chat-avatar" id="chatAvatar" style="background-image:url(${QWAS.Util.escapeAttr(chat.avatar)})"></div>`;
      } else {
        QWAS.Util.renderAvatar(document.getElementById('chatAvatar'),
          { username: username, firstName: chat.firstName || chat.name, avatarColor: chat.avatarColor });
      }

      this.renderPinned(chat);
    },

    renderPinned(chat) {
      const bar = document.getElementById('pinnedBar');
      const text = document.getElementById('pinnedBarText');
      if (!bar || !text) return;
      const pinnedId = chat.pinnedMessageId || (QWAS.State.messagesByChat.get(chat.username) || []).find(m => m.isPinned)?._id;
      if (!pinnedId) {
        bar.style.display = 'none';
        return;
      }
      const msg = (QWAS.State.messagesByChat.get(chat.username) || []).find(m => m._id === pinnedId);
      if (!msg) { bar.style.display = 'none'; return; }
      const sender = msg.from === QWAS.State.me ? 'Вы' : (QWAS.Util.getUserDisplayName({ firstName: msg.fromFirstName, username: msg.from }) || msg.from);
      const preview = msg.message || (msg.attachments?.length ? '📎 Вложение' : '');
      text.innerHTML = `<strong>${QWAS.Util.escapeHtml(sender)}</strong> <span>${QWAS.Util.escapeHtml(QWAS.Util.truncate(preview, 60))}</span>`;
      bar.style.display = 'flex';
      bar.onclick = () => this.scrollToMessage(pinnedId);
    },

    closePinned() {
      const bar = document.getElementById('pinnedBar');
      if (bar) bar.style.display = 'none';
    },

    scrollToMessage(id) {
      const el = document.getElementById('msg-' + id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.setAttribute('data-anim', 'highlight');
        setTimeout(() => el.removeAttribute('data-anim'), 800);
      }
    },

    async loadInfo() {
      const username = QWAS.State.current;
      if (!username || username === QWAS.Config.FAVORITE_CHAT_ID) return;
      if (username.startsWith('group:')) {
        const id = username.slice(6);
        const r = await QWAS.API.get('/groups/' + id);
        if (r.ok) this.info = { type: 'group', data: r.group };
      } else {
        const r = await QWAS.API.get('/profile/' + username);
        if (r.ok) this.info = { type: 'user', data: r.user };
      }
    },

    clearMessages() {
      const m = document.getElementById('messages');
      if (m) m.innerHTML = '';
    },

    async loadHistory() {
      if (!QWAS.State.current) return;
      const r = await new Promise(res => {
        if (QWAS.State.socket) {
          QWAS.State.socket.emit('get_history', QWAS.State.current, 1, res);
        } else res({ ok: false, messages: [] });
      });
      if (!r) return;
      const { messages = [], hasMore = false, page = 1 } = r;
      QWAS.State.hasMore = hasMore;
      QWAS.State.pagination.page = page;
      const list = messages || [];
      QWAS.State.messagesByChat.set(QWAS.State.current, list);
      QWAS.Messages.renderAll(list);
      if (QWAS.State.socket && QWAS.State.current && QWAS.State.current !== QWAS.Config.FAVORITE_CHAT_ID) {
        QWAS.State.socket.emit('mark_as_read', {
          chatId: QWAS.State.current,
          from: QWAS.State.current.startsWith('group:') ? undefined : QWAS.State.current
        });
      }
    },

    openInfo() {
      const username = QWAS.State.current;
      if (!username) return;
      if (username === QWAS.Config.FAVORITE_CHAT_ID) {
        QWAS.Modals.openSavedMessagesInfo();
        return;
      }
      QWAS.Modals.openChatInfo(username, this.info);
    },

    openSearch() {
      const q = prompt('Поиск в чате:');
      if (!q) return;
      this.searchQuery = q.toLowerCase();
      this.highlightSearch();
    },

    highlightSearch() {
      const msgs = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      msgs.forEach(m => {
        const el = document.getElementById('msg-' + m._id);
        if (!el) return;
        const text = m.message?.toLowerCase() || '';
        if (this.searchQuery && text.includes(this.searchQuery)) {
          el.setAttribute('data-anim', 'highlight');
          setTimeout(() => el.removeAttribute('data-anim'), 1000);
        }
      });
    },

    updateOnline(username, online, lastSeen) {
      if (username === QWAS.State.current) this.renderHeader();
    }
  };

  QWAS.Chat = Chat;
})();
