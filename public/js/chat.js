(function() {
  'use strict';
  
  QWAS.Chat = {
    loadAllUsers: async function() {
      try {
        const res = await fetch(QWAS.Config.API.USERS_ALL, {
          headers: { 'Authorization': `Bearer ${QWAS.State.userToken}` }
        });
        const data = await res.json();
        QWAS.State.allUsers = data.ok ? data.users : [];
      } catch (err) {
        console.error('Load users error:', err);
      }
    },
    
    loadChatList: async function() {
      try {
        const res = await fetch(QWAS.Config.API.CHATS, {
          headers: { 'Authorization': `Bearer ${QWAS.State.userToken}` }
        });
        const data = await res.json();
        QWAS.State.chatList = data.chats || [];
        this.renderList();
      } catch (err) {
        console.error('Load chats error:', err);
      }
    },
    
    renderList: function() {
      const container = document.getElementById('users');
      const chats = [
        { username: QWAS.Config.FAVORITE_CHAT_ID, isFavorite: true },
        ...QWAS.State.chatList
      ];
      
      container.innerHTML = chats.map(u => {
        const isFav = u.username === QWAS.Config.FAVORITE_CHAT_ID;
        const selected = QWAS.State.current === u.username ? 'selected' : '';
        
        return `
          <div class="user ${selected}" onclick="QWAS.Chat.select('${u.username}')">
            <div class="user-avatar small" id="avatar-${u.username}"></div>
            <div style="flex:1;">
              <div style="font-weight:500;">${isFav ? 'Избранное' : '@' + u.username}</div>
            </div>
            ${!isFav ? `<span class="${u.online ? 'online' : 'offline'}-indicator"></span>` : ''}
          </div>
        `;
      }).join('');
      
      chats.forEach(u => {
        const avatarEl = document.getElementById(`avatar-${u.username}`);
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
    },
    
    select: function(username) {
      // Сбрасываем пагинацию
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('reset_pagination');
      }
      
      QWAS.State.current = username;
      QWAS.State.hasMoreMessages = true;
      QWAS.State.isLoadingMessages = false;
      QWAS.State.currentPage = 1;
      
      this.renderList();
      
      const isFav = username === QWAS.Config.FAVORITE_CHAT_ID;
      const userData = isFav ? {} : 
        (QWAS.State.chatList.find(c => c.username === username) || 
         QWAS.State.allUsers.find(u => u.username === username) || {});
      
      document.getElementById('chatHeader').style.display = 'flex';
      
      const avatarEl = document.getElementById('chatAvatar');
      QWAS.Utils.renderAvatar(avatarEl, {
        username: username,
        avatar: userData.avatar,
        avatarColor: userData.avatarColor
      });
      
      if (isFav) {
        avatarEl.textContent = '⭐';
        avatarEl.style.background = '#6366f1';
      }
      
      document.getElementById('chatUsername').textContent = isFav ? 'Избранное' : '@' + username;
      document.getElementById('chatStatus').textContent = isFav ? '' : 
        (userData.online ? 'онлайн' : 'офлайн');
      
      const msgInput = document.getElementById('msg');
      const sendBtn = document.getElementById('sendBtn');
      msgInput.disabled = false;
      sendBtn.disabled = false;
      
      // Очищаем контейнер перед загрузкой
      document.getElementById('messages').innerHTML = '';
      document.getElementById('typingIndicator').textContent = '';
      
      if (QWAS.State.isMobile) {
        document.getElementById('sidebar').classList.add('hidden');
      }
      
      // Загружаем первую страницу
      QWAS.State.socket.emit('get_history', username, 1);
    }
    
    showSidebar: function() {
      document.getElementById('sidebar').classList.remove('hidden');
    }
  };
})();