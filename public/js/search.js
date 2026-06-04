// Глобальный поиск: пользователи, чаты, сообщения
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const SidebarSearch = {
    timer: null,
    lastQuery: '',

    init() {
      const input = document.getElementById('searchInput');
      if (!input) return;
      input.addEventListener('input', (e) => this.onInput(e.target.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.commit(input.value);
        } else if (e.key === 'Escape') {
          input.value = '';
          this.hide();
        }
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar-search') && !e.target.closest('.search-results')) {
          this.hide();
        }
      });
    },

    onInput(q) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.commit(q), 250);
    },

    async commit(q) {
      q = (q || '').trim();
      if (q === this.lastQuery) return;
      this.lastQuery = q;
      if (!q) { this.hide(); return; }
      const [u, c, m] = await Promise.all([
        QWAS.API.searchUsers(q).catch(() => ({ users: [] })),
        QWAS.API.searchChats(q).catch(() => ({ chats: [] })),
        QWAS.API.searchMessages(q).catch(() => ({ messages: [] }))
      ]);
      this.render({
        users: (u && u.users) || [],
        chats: (c && c.chats) || [],
        messages: (m && m.messages) || []
      }, q);
    },

    render(data, q) {
      let panel = document.getElementById('searchResults');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'searchResults';
        panel.className = 'search-results';
        const search = document.querySelector('.sidebar-search');
        if (search && search.parentNode) search.parentNode.appendChild(panel);
      }
      const has = data.users.length || data.chats.length || data.messages.length;
      if (!has) {
        panel.innerHTML = `<div class="search-empty">Ничего не найдено по «${QWAS.Util.escapeHtml(q)}»</div>`;
        panel.style.display = 'block';
        return;
      }
      let html = '';
      if (data.users.length) {
        html += `<div class="search-section-title">Пользователи</div>`;
        html += data.users.map(u => `
          <div class="search-item" data-type="user" data-username="${QWAS.Util.escapeAttr(u.username)}">
            ${QWAS.Util.avatarHtml(u, 36)}
            <div class="search-item-body">
              <div class="search-item-title">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u))}</div>
              <div class="search-item-sub">@${QWAS.Util.escapeHtml(u.username)}</div>
            </div>
          </div>`).join('');
      }
      if (data.chats.length) {
        html += `<div class="search-section-title">Чаты</div>`;
        html += data.chats.map(c => `
          <div class="search-item" data-type="chat" data-chat-id="${QWAS.Util.escapeAttr(c.id)}">
            ${QWAS.Util.avatarHtml({ firstName: c.title, username: 'g' + c.id }, 36)}
            <div class="search-item-body">
              <div class="search-item-title">${QWAS.Util.escapeHtml(c.title || 'Чат')}</div>
            </div>
          </div>`).join('');
      }
      if (data.messages.length) {
        html += `<div class="search-section-title">Сообщения</div>`;
        html += data.messages.slice(0, 20).map(m => `
          <div class="search-item" data-type="message" data-msg-id="${QWAS.Util.escapeAttr(m.id)}" data-chat-id="${QWAS.Util.escapeAttr(m.chatId)}">
            <div class="search-item-icon">💬</div>
            <div class="search-item-body">
              <div class="search-item-title">${this._highlight(m.text || '', q)}</div>
              <div class="search-item-sub">${QWAS.Util.timeAgo(m.createdAt)}</div>
            </div>
          </div>`).join('');
      }
      panel.innerHTML = html;
      panel.style.display = 'block';
      panel.querySelectorAll('.search-item').forEach(el => {
        el.addEventListener('click', () => this._onItemClick(el));
      });
    },

    _onItemClick(el) {
      const type = el.dataset.type;
      if (type === 'user') {
        const u = el.dataset.username;
        this.hide();
        if (QWAS.Modals) QWAS.Modals.openUserProfile(u);
      } else if (type === 'chat') {
        const id = parseInt(el.dataset.chatId);
        this.hide();
        if (QWAS.Chat) QWAS.Chat.open(id);
      } else if (type === 'message') {
        const chatId = parseInt(el.dataset.chatId);
        this.hide();
        if (QWAS.Chat) QWAS.Chat.open(chatId);
        // TODO: прокрутить к сообщению
      }
    },

    _highlight(text, q) {
      if (!q) return QWAS.Util.escapeHtml(text);
      const safe = QWAS.Util.escapeHtml(text);
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return safe.replace(re, '<mark>$1</mark>');
    },

    hide() {
      const panel = document.getElementById('searchResults');
      if (panel) panel.style.display = 'none';
    }
  };

  window.QWAS.SidebarSearch = SidebarSearch;
  window.QWAS.Search = SidebarSearch;
})();
