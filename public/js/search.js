(function() {
  'use strict';
  
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  
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
    
    const chatMatches = QWAS.State.chatList.filter(c => 
      c.username.toLowerCase().includes(query)
    );
    
    const userMatches = QWAS.State.allUsers.filter(u => 
      u.username.toLowerCase().includes(query) &&
      !QWAS.State.chatList.find(c => c.username === u.username)
    );
    
    results = [...results, ...chatMatches, ...userMatches].slice(0, 8);
    
    if (results.length === 0) {
      searchResults.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);">Ничего не найдено</div>';
    } else {
      searchResults.innerHTML = results.map(u => {
        const isFav = u.username === QWAS.Config.FAVORITE_CHAT_ID;
        return `
          <div class="search-result-item" onclick="QWAS.Search.startChat('${u.username}')">
            <div class="user-avatar small" id="search-avatar-${u.username}"></div>
            <div>${isFav ? 'Избранное' : '@' + u.username}</div>
          </div>
        `;
      }).join('');
      
      results.forEach(u => {
        const avatarEl = document.getElementById(`search-avatar-${u.username}`);
        if (avatarEl) {
          QWAS.Utils.renderAvatar(avatarEl, {
            username: u.username,
            avatar: u.avatar,
            avatarColor: u.avatarColor
          });
          if (u.username === QWAS.Config.FAVORITE_CHAT_ID) {
            avatarEl.textContent = '⭐';
            avatarEl.style.background = '#6366f1';
          }
        }
      });
    }
    
    searchResults.style.display = 'block';
  });
  
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) {
      searchResults.style.display = 'block';
    }
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchResults.style.display = 'none';
    }
  });
  
  QWAS.Search = {
    startChat: function(username) {
      searchInput.value = '';
      searchResults.style.display = 'none';
      
      if (username !== QWAS.Config.FAVORITE_CHAT_ID && 
          !QWAS.State.chatList.find(c => c.username === username)) {
        const user = QWAS.State.allUsers.find(u => u.username === username);
        if (user) {
          QWAS.State.chatList.push({ ...user, online: false });
          QWAS.Chat.renderList();
        }
      }
      
      QWAS.Chat.select(username);
    }
  };
})();