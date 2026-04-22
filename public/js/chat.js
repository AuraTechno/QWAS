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
        console.log('📋 Загружено пользователей:', QWAS.State.allUsers.length);
      } catch (err) {
        console.error('Load users error:', err);
        QWAS.State.allUsers = [];
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
        console.log('💬 Загружено чатов:', QWAS.State.chatList.length);
      } catch (err) {
        console.error('Load chats error:', err);
        QWAS.State.chatList = [];
        this.renderList();
      }
    },
    
    renderList: function() {
      const container = document.getElementById('users');
      if (!container) return;
      
      const chats = [
        { username: QWAS.Config.FAVORITE_CHAT_ID, isFavorite: true },
        ...(QWAS.State.chatList || [])
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
        if (avatarEl && QWAS.Utils && QWAS.Utils.renderAvatar) {
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
        ((QWAS.State.chatList || []).find(c => c.username === username) || 
         (QWAS.State.allUsers || []).find(u => u.username === username) || {});
      
      const chatHeader = document.getElementById('chatHeader');
      if (chatHeader) chatHeader.style.display = 'flex';
      
      const avatarEl = document.getElementById('chatAvatar');
      if (avatarEl && QWAS.Utils && QWAS.Utils.renderAvatar) {
        QWAS.Utils.renderAvatar(avatarEl, {
          username: username,
          avatar: userData.avatar,
          avatarColor: userData.avatarColor
        });
        
        if (isFav) {
          avatarEl.textContent = '⭐';
          avatarEl.style.background = '#6366f1';
        }
      }
      
      const chatUsername = document.getElementById('chatUsername');
      if (chatUsername) chatUsername.textContent = isFav ? 'Избранное' : '@' + username;
      
      const chatStatus = document.getElementById('chatStatus');
      if (chatStatus) chatStatus.textContent = isFav ? '' : (userData.online ? 'онлайн' : 'офлайн');
      
      const msgInput = document.getElementById('msg');
      const sendBtn = document.getElementById('sendBtn');
      if (msgInput) msgInput.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      
      const messagesContainer = document.getElementById('messages');
      if (messagesContainer) messagesContainer.innerHTML = '';
      
      const typingIndicator = document.getElementById('typingIndicator');
      if (typingIndicator) typingIndicator.textContent = '';
      
      if (QWAS.State.isMobile) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('hidden');
      }
      
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('get_history', username, 1);
      }
    },
    
    showSidebar: function() {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('hidden');
    }
  };
})();