(function() {
  'use strict';

  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const query = this.value.trim().toLowerCase();

      if (!query) {
        searchResults.style.display = 'none';
        return;
      }

      let results = [];

      if ('избранное'.includes(query) || 'favorites'.includes(query) ||
          query.includes('изб') || '⭐'.includes(query)) {
        results.push({ username: QWAS.Config.FAVORITE_CHAT_ID, isFavorite: true });
      }

      const groupMatches = (QWAS.Groups.myGroups || []).filter(g =>
        g.name && g.name.toLowerCase().includes(query)
      );

      const chatMatches = (QWAS.State.chatList || []).filter(c =>
        c.username && c.username.toLowerCase().includes(query)
      );

      const userMatches = (QWAS.State.allUsers || []).filter(u =>
        u.username &&
        u.username.toLowerCase().includes(query) &&
        !(QWAS.State.chatList || []).find(c => c.username === u.username)
      );

      results = [...results, ...groupMatches.map(g => ({ isGroup: true, group: g })), ...chatMatches, ...userMatches].slice(0, 8);

      if (results.length === 0) {
        searchResults.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);">Ничего не найдено</div>';
      } else {
        searchResults.innerHTML = results.map(item => {
          if (item.isGroup) {
            const g = item.group;
            return `
              <div class="search-result-item" onclick="QWAS.Groups.select('${g._id}')">
                <div class="user-avatar small" style="background:${g.avatarColor}; font-size:14px;">&#128101;</div>
                <div style="font-weight:500;">${QWAS.Utils.escapeHtml(g.name)}</div>
              </div>
            `;
          }
          const isFav = item.username === QWAS.Config.FAVORITE_CHAT_ID;
          return `
            <div class="search-result-item" onclick="QWAS.Search.startChat('${item.username}')">
              <div class="user-avatar small" id="search-avatar-${item.username}"></div>
              <div style="font-weight:500;">${isFav ? '⭐ Избранное' : '@' + item.username}</div>
            </div>
          `;
        }).join('');

        setTimeout(() => {
          results.forEach(item => {
            if (item.isGroup) return;
            const avatarEl = document.getElementById(`search-avatar-${item.username}`);
            if (avatarEl && QWAS.Utils && QWAS.Utils.renderAvatar) {
              QWAS.Utils.renderAvatar(avatarEl, {
                username: item.username,
                avatar: item.avatar,
                avatarColor: item.avatarColor
              });
              if (item.username === QWAS.Config.FAVORITE_CHAT_ID) {
                avatarEl.textContent = '⭐';
                avatarEl.style.background = '#6366f1';
              }
            }
          });
        }, 10);
      }

      searchResults.style.display = 'block';
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim()) searchResults.style.display = 'block';
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) searchResults.style.display = 'none';
  });

  QWAS.Search = {
    startChat: function(username) {
      searchInput.value = '';
      searchResults.style.display = 'none';

      if (username !== QWAS.Config.FAVORITE_CHAT_ID &&
          !(QWAS.State.chatList || []).find(c => c.username === username)) {
        const user = (QWAS.State.allUsers || []).find(u => u.username === username);
        if (user) {
          QWAS.State.chatList.push({ ...user, online: false });
          QWAS.Chat.renderList();
        }
      }

      QWAS.Chat.select(username);
    }
  };
})();
