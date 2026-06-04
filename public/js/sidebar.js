(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Chats = {
    currentTab: 'all',
    activeFolder: null,
    archivedVisible: false,

    init() {
      this.currentTab = 'all';
      this.activeFolder = null;
      this.attachHandlers();
      this.setupScroll();
    },

    attachHandlers() {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.addEventListener('input', QWAS.Util.debounce(() => {
          QWAS.Search && QWAS.Search.handleSearch(searchInput.value);
        }, 200));
        searchInput.addEventListener('focus', () => {
          if (searchInput.value.trim()) QWAS.Search && QWAS.Search.show();
        });
      }
    },

    setupScroll() {
      const wrapper = document.querySelector('.chats-list-wrapper');
      if (wrapper) {
        const sentinel = document.createElement('div');
        sentinel.style.height = '1px';
        wrapper.appendChild(sentinel);
        const obs = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            this.loadMore();
          }
        }, { root: wrapper });
        obs.observe(sentinel);
      }
    },

    loadMore() {
      // no-op for now (chats are preloaded)
    },

    switchTab(tab) {
      this.currentTab = tab;
      this.activeFolder = null;
      document.querySelectorAll('.chats-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
      });
      this.render();
    },

    selectFolder(folderId) {
      this.activeFolder = folderId;
      document.querySelectorAll('.folder-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.folderId === folderId);
      });
      this.render();
    },

    setChats(chats) {
      QWAS.State.chats = chats || [];
      this.render();
    },

    upsertChat(chat) {
      const idx = QWAS.State.chats.findIndex(c => c.username === chat.username);
      if (idx >= 0) QWAS.State.chats[idx] = Object.assign({}, QWAS.State.chats[idx], chat);
      else QWAS.State.chats.unshift(chat);
      this.render();
    },

    removeChat(username) {
      QWAS.State.chats = QWAS.State.chats.filter(c => c.username !== username);
      this.render();
    },

    updateChatMeta(username, updates) {
      const chat = QWAS.State.chats.find(c => c.username === username);
      if (chat) {
        Object.assign(chat, updates);
        this.render();
      }
    },

    getFiltered() {
      let chats = QWAS.State.chats;

      if (this.activeFolder) {
        const folder = QWAS.State.folders.find(f => f._id === this.activeFolder);
        if (folder) {
          chats = chats.filter(c => (folder.chatIds || []).includes(c.username));
        }
      } else {
        chats = chats.filter(c => !c.archived);
      }

      switch (this.currentTab) {
        case 'unread':
          return chats.filter(c => c.unreadCount > 0);
        case 'groups':
          return chats.filter(c => c.type === 'group' && c.groupType !== 'channel');
        case 'channels':
          return chats.filter(c => c.groupType === 'channel');
        case 'contacts':
          return chats.filter(c => c.type === 'dm');
        default:
          return chats;
      }
    },

    render() {
      const list = document.getElementById('chatsList');
      const empty = document.getElementById('chatsEmpty');
      if (!list) return;

      const filtered = this.getFiltered();
      filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        if (a.pinOrder != null && b.pinOrder != null) return a.pinOrder - b.pinOrder;
        const ta = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
        const tb = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
        return tb - ta;
      });

      if (filtered.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
      }
      if (empty) empty.style.display = 'none';

      list.innerHTML = filtered.map(c => this.renderChat(c)).join('');
    },

    renderChat(c) {
      const isActive = QWAS.State.current === c.username;
      const unread = c.unreadCount || 0;
      const isMuted = c.muted;
      const isPinned = c.pinned;

      const previewText = this.getPreview(c);
      const meta = this.getMeta(c);

      return `
        <div class="chat-item ${isActive ? 'active' : ''} ${isPinned ? 'pinned' : ''}"
             data-username="${QWAS.Util.escapeAttr(c.username)}"
             onclick="QWAS.Chats.open('${QWAS.Util.escapeAttr(c.username)}')"
             oncontextmenu="QWAS.ContextMenu.showChat(event, '${QWAS.Util.escapeAttr(c.username)}')">
          <div class="chat-item-avatar">
            ${this.renderAvatar(c)}
          </div>
          <div class="chat-item-content">
            <div class="chat-item-row1">
              <div class="chat-item-name">
                ${QWAS.Util.escapeHtml(this.getName(c))}
                ${c.verified ? '<span class="verified">✓</span>' : ''}
              </div>
              <div class="chat-item-meta">${meta}</div>
            </div>
            <div class="chat-item-row2">
              <div class="chat-item-preview">
                ${previewText}
              </div>
              <div class="chat-item-badges">
                ${isMuted ? '<span class="chat-item-mute">🔕</span>' : ''}
                ${unread > 0 ? `<span class="chat-item-unread ${isMuted ? 'muted' : ''}">${unread > 99 ? '99+' : unread}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    },

    renderAvatar(c) {
      if (c.type === 'group') {
        const icon = c.groupType === 'channel' ? '📢' : '👥';
        const color = c.avatarColor || QWAS.Util.avatarColor(c.name);
        if (c.avatar) {
          return `<div class="avatar size-48" style="background-image:url(${QWAS.Util.escapeAttr(c.avatar)})">${icon}</div>`;
        }
        return `<div class="avatar size-48 ${QWAS.Util.gradientFor(c.name)}">${icon}</div>`;
      }

      if (c.username === QWAS.Config.FAVORITE_CHAT_ID) {
        return `<div class="avatar size-48 avatar-gradient-4">⭐</div>`;
      }

      if (c.avatar) {
        return `<div class="avatar size-48" style="background-image:url(${QWAS.Util.escapeAttr(c.avatar)})"></div>`;
      }
      return `<div class="avatar size-48 ${QWAS.Util.gradientFor(c.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(c.firstName || c.name || c.username))}</div>`;
    },

    getName(c) {
      if (c.username === QWAS.Config.FAVORITE_CHAT_ID) return 'Избранное';
      if (c.type === 'group') return c.name || 'Группа';
      return c.name || c.firstName || c.username;
    },

    getPreview(c) {
      if (c.draft) return `<span class="preview-icon draft">📝</span> <span class="draft">Черновик:</span> ${QWAS.Util.escapeHtml(QWAS.Util.truncate(c.draft, 30))}`;
      if (c.typing) return `<span class="typing">печатает</span><span class="typing-dots-mini"><span></span><span></span><span></span></span>`;
      if (!c.lastMessage) return `<span class="preview-icon">💬</span> Нет сообщений`;
      const isMine = c.lastMessageFrom === QWAS.State.me;
      const prefix = isMine ? '<span class="preview-icon">✓</span> ' : '';
      const text = c.lastMessage;
      const icon = this.getPreviewIcon(text);
      return prefix + icon + QWAS.Util.escapeHtml(QWAS.Util.truncate(text.replace(/^📎 /, ''), 40));
    },

    getPreviewIcon(text) {
      if (!text) return '';
      if (text.startsWith('📷')) return '<span class="preview-icon">📷</span> ';
      if (text.startsWith('🎤')) return '<span class="preview-icon">🎤</span> ';
      if (text.startsWith('📍')) return '<span class="preview-icon">📍</span> ';
      if (text.startsWith('📎')) return '<span class="preview-icon">📎</span> ';
      if (text.startsWith('/poll')) return '<span class="preview-icon">📊</span> ';
      if (text === 'Нет сообщений') return '';
      return '';
    },

    getMeta(c) {
      if (c.typing) return '';
      if (!c.lastMessageTime) return '';
      return QWAS.Util.formatDate(c.lastMessageTime);
    },

    open(username) {
      QWAS.Chat.open(username);
    },

    renderFolders() {
      const bar = document.getElementById('foldersBar');
      if (!bar) return;
      const folders = QWAS.State.folders || [];
      bar.innerHTML = `
        <div class="folder-chip ${!this.activeFolder && this.currentTab === 'all' ? 'active' : ''}" onclick="QWAS.Chats.selectFolder(null)">
          <span class="folder-dot"></span> Все
        </div>
        ${folders.map(f => `
          <div class="folder-chip ${this.activeFolder === f._id ? 'active' : ''}" data-folder-id="${QWAS.Util.escapeAttr(f._id)}" onclick="QWAS.Chats.selectFolder('${QWAS.Util.escapeAttr(f._id)}')">
            <span class="folder-dot" style="background:${QWAS.Util.escapeAttr(f.color)}"></span> ${QWAS.Util.escapeHtml(f.title)}
          </div>
        `).join('')}
        <div class="folder-chip add-folder" onclick="QWAS.Modals.openCreateFolder()">＋ Папка</div>
      `;
    },

    renderStories() {
      const rail = document.getElementById('storiesRail');
      if (!rail) return;
      const stories = QWAS.State.stories || {};
      const authors = Object.keys(stories);

      const html = [`<div class="story-item my-story" onclick="QWAS.Stories.openCreator()">
        <div class="story-avatar-wrap">
          <div class="story-avatar">
            <div class="story-avatar-inner ${QWAS.Util.gradientFor(QWAS.State.me)}">
              ${QWAS.Util.escapeHtml(QWAS.Util.getInitials(QWAS.State.currentUser?.firstName || QWAS.State.me))}
            </div>
          </div>
          <div class="story-add">+</div>
        </div>
        <div class="story-name">Моя история</div>
      </div>`];

      for (const author of authors) {
        const userStories = stories[author];
        const first = userStories[0];
        const allViewed = userStories.every(s => s.views?.includes(QWAS.State.me));
        const displayName = first.author === QWAS.State.me ? 'Вы' :
          QWAS.Util.getUserDisplayName(first) || first.author;
        html.push(`<div class="story-item" onclick="QWAS.Stories.open('${QWAS.Util.escapeAttr(author)}')">
          <div class="story-avatar-wrap ${allViewed ? 'viewed' : 'has-story'}">
            <div class="story-avatar">
              <div class="story-avatar-inner ${QWAS.Util.gradientFor(author)}">
                ${QWAS.Util.escapeHtml(QWAS.Util.getInitials(displayName))}
              </div>
            </div>
          </div>
          <div class="story-name">${QWAS.Util.escapeHtml(displayName)}</div>
        </div>`);
      }

      rail.innerHTML = html.join('');
    }
  };

  QWAS.Chats = Chats;
})();
