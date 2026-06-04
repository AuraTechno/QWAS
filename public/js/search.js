(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Search = {
    active: false,
    overlay: null,

    show() { this.active = true; },
    hide() {
      this.active = false;
      this.removeOverlay();
    },

    handleSearch(q) {
      q = (q || '').trim();
      if (!q) { this.hide(); return; }
      this.show();
      this.render(q);
    },

    render(q) {
      this.removeOverlay();
      const results = this.search(q);
      this.overlay = document.createElement('div');
      this.overlay.className = 'search-results';
      this.overlay.style.cssText = 'position:absolute;top:60px;left:12px;right:12px;background:var(--bg-elevated);border-radius:12px;padding:8px;z-index:100;box-shadow:var(--shadow-2);max-height:60vh;overflow-y:auto;';
      document.querySelector('.sidebar').appendChild(this.overlay);

      if (results.length === 0) {
        this.overlay.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);">Ничего не найдено</div>';
        return;
      }

      this.overlay.innerHTML = results.map(r => this.renderItem(r)).join('');
    },

    renderItem(r) {
      const isFav = r.username === QWAS.Config.FAVORITE_CHAT_ID;
      const isGroup = r.type === 'group';
      const displayName = isFav ? 'Избранное' :
        isGroup ? r.name : (r.firstName ? `${r.firstName} ${r.lastName || ''}`.trim() : r.username);
      const avatarContent = isFav ? '⭐' : isGroup ? (r.groupType === 'channel' ? '📢' : '👥') : (r.firstName || r.username || '?').substring(0, 2);
      const gradClass = isFav ? 'avatar-gradient-4' : QWAS.Util.gradientFor(r.username || r.name);

      return `<div class="search-result-item" onclick="QWAS.Search.open('${QWAS.Util.escapeAttr(r.username)}')" style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;cursor:pointer;transition:background 0.15s;">
        <div class="avatar size-40 ${gradClass}">${QWAS.Util.escapeHtml(avatarContent)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:500;">${QWAS.Util.escapeHtml(displayName)}</div>
          <div style="font-size:12px;color:var(--text-tertiary);">@${QWAS.Util.escapeHtml(isGroup ? r._id : r.username)}</div>
        </div>
      </div>`;
    },

    search(q) {
      const ql = q.toLowerCase();
      const results = [];

      if ('избранное'.includes(ql) || 'favorites'.includes(ql)) {
        results.push({ username: QWAS.Config.FAVORITE_CHAT_ID });
      }

      for (const g of QWAS.State.myGroups || []) {
        if (g.name && g.name.toLowerCase().includes(ql)) {
          results.push({ ...g, type: 'group' });
        }
      }

      const seen = new Set();
      for (const c of QWAS.State.chats || []) {
        if (seen.has(c.username)) continue;
        const name = (c.name || c.firstName || '').toLowerCase();
        if (name.includes(ql) || c.username.toLowerCase().includes(ql)) {
          results.push(c);
          seen.add(c.username);
        }
      }

      for (const u of QWAS.State.allUsers || []) {
        if (seen.has(u.username)) continue;
        const fName = (u.firstName || '').toLowerCase();
        const lName = (u.lastName || '').toLowerCase();
        if (fName.includes(ql) || lName.includes(ql) || u.username.toLowerCase().includes(ql)) {
          results.push(u);
          seen.add(u.username);
        }
      }

      return results.slice(0, 10);
    },

    open(username) {
      this.hide();
      document.getElementById('searchInput').value = '';
      if (!username.startsWith('group:') && username !== QWAS.Config.FAVORITE_CHAT_ID) {
        if (!QWAS.State.chats.find(c => c.username === username)) {
          const user = (QWAS.State.allUsers || []).find(u => u.username === username);
          if (user) {
            QWAS.State.chats.unshift({ ...user, type: 'dm', lastMessage: '', lastMessageTime: new Date(), unreadCount: 0 });
            QWAS.Chats.render();
          }
        }
      } else if (username.startsWith('group:')) {
        const id = username.slice(6);
        const group = QWAS.State.myGroups.find(g => g._id === id);
        if (group && !QWAS.State.chats.find(c => c.username === username)) {
          QWAS.State.chats.unshift({
            ...group, type: 'group', username, memberCount: group.memberCount, lastMessage: '', lastMessageTime: new Date(), unreadCount: 0
          });
          QWAS.Chats.render();
        }
      }
      QWAS.Chat.open(username);
    },

    removeOverlay() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
    }
  };

  QWAS.Search = Search;
  QWAS.State.allUsers = QWAS.State.allUsers || [];
})();
