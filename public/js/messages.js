(function() {
  'use strict';
  
  QWAS.Socket = {
    connect: function(token) {
      QWAS.State.socket = io({ auth: { token } });
      
      QWAS.State.socket.on('chat_list', (chats) => {
        QWAS.State.chatList = chats;
        QWAS.Chat.renderList();
      });
      
      QWAS.State.socket.on('new_message', (msg) => {
        const isCurrentChat = msg.from === QWAS.State.current || msg.to === QWAS.State.current;
        const isFavoriteChat = QWAS.State.current === QWAS.Config.FAVORITE_CHAT_ID && msg.to === QWAS.Config.FAVORITE_CHAT_ID;
        
        if (isCurrentChat || isFavoriteChat) {
          QWAS.Messages.add(msg);
          
          if (msg.from === QWAS.State.current && msg.from !== QWAS.State.me) {
            QWAS.State.socket.emit('mark_as_read', { from: msg.from });
          }
        }
        
        if (msg.from !== QWAS.State.me || msg.to !== QWAS.State.me) {
          QWAS.Chat.loadChatList();
        }
      });
      
      QWAS.State.socket.on('message_updated', (msg) => {
        const el = document.getElementById(`msg-${msg._id}`);
        if (el) {
          el.querySelector('.message-bubble').textContent = msg.message;
          el.classList.add('edited');
        }
      });
      
      QWAS.State.socket.on('message_deleted', (data) => {
        document.getElementById(`msg-${data.messageId}`)?.remove();
      });
      
      QWAS.State.socket.on('messages_read', (data) => {
        if (data.chatWith === QWAS.State.current || data.by === QWAS.State.current) {
          document.querySelectorAll('.message.me').forEach(el => {
            const statusEl = el.querySelector('.message-status');
            if (statusEl) {
              statusEl.textContent = '✓✓';
              statusEl.classList.add('read');
            }
          });
        }
      });
      
      QWAS.State.socket.on('chat_history', (data) => {
        const container = document.getElementById('messages');
        const { messages, hasMore, page } = data;
        
        console.log(`📜 Получена страница ${page}, сообщений: ${messages.length}, hasMore: ${hasMore}`);
        
        QWAS.State.hasMoreMessages = hasMore;
        QWAS.State.currentPage = page || 1;
        
        if (page === 1) {
          // Первая страница - очищаем контейнер
          container.innerHTML = messages.length ? '' : 
            '<div class="empty-state"><div class="empty-state-icon">💬</div><p>Нет сообщений</p></div>';
          
          messages.forEach(m => QWAS.Messages.add(m, true));
          
          // Прокручиваем вниз
          container.scrollTop = container.scrollHeight;
        } else {
          // Подгружаем старые сообщения сверху
          const oldScrollHeight = container.scrollHeight;
          
          // Вставляем сообщения в начало (в обратном порядке)
          for (let i = messages.length - 1; i >= 0; i--) {
            QWAS.Messages.prepend(messages[i]);
          }
          
          // Восстанавливаем позицию скролла
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - oldScrollHeight;
        }
        
        QWAS.State.isLoadingMessages = false;
      });
      
      QWAS.State.socket.on('typing', (d) => {
        if (d.from === QWAS.State.current) {
          document.getElementById('typingIndicator').textContent = `@${QWAS.State.current} печатает...`;
        }
      });
      
      QWAS.State.socket.on('stop_typing', () => {
        document.getElementById('typingIndicator').textContent = '';
      });
      
      QWAS.State.socket.on('all_users', (users) => {
        QWAS.State.allUsers = users;
      });
    }
  };
})();