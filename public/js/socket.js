(function() {
  'use strict';
  
  QWAS.Socket = {
    connect: function(token) {
      QWAS.State.socket = io({ auth: { token } });
      
      QWAS.State.socket.on('chat_list', (chats) => {
        console.log('📋 Получен список чатов:', chats?.length || 0);
        QWAS.State.chatList = chats || [];
        
        // Проверяем что Chat модуль загружен
        if (QWAS.Chat && typeof QWAS.Chat.renderList === 'function') {
          QWAS.Chat.renderList();
        } else {
          console.warn('⚠️ QWAS.Chat.renderList еще не доступен');
          // Попробуем позже
          setTimeout(() => {
            if (QWAS.Chat && QWAS.Chat.renderList) {
              QWAS.Chat.renderList();
            }
          }, 100);
        }
      });
      
      QWAS.State.socket.on('new_message', (msg) => {
        console.log('📨 Новое сообщение:', msg.message?.substring(0, 30));
        const isCurrentChat = msg.from === QWAS.State.current || msg.to === QWAS.State.current;
        const isFavoriteChat = QWAS.State.current === QWAS.Config.FAVORITE_CHAT_ID && msg.to === QWAS.Config.FAVORITE_CHAT_ID;
        
        if (isCurrentChat || isFavoriteChat) {
          if (QWAS.Messages && QWAS.Messages.add) {
            QWAS.Messages.add(msg);
          }
          
          if (msg.from === QWAS.State.current && msg.from !== QWAS.State.me) {
            QWAS.State.socket.emit('mark_as_read', { from: msg.from });
          }
        }
        
        // Обновляем список чатов
        if (QWAS.Chat && QWAS.Chat.loadChatList) {
          QWAS.Chat.loadChatList();
        }
      });
      
      QWAS.State.socket.on('message_updated', (msg) => {
        const el = document.getElementById(`msg-${msg._id}`);
        if (el) {
          const bubble = el.querySelector('.message-bubble');
          if (bubble) bubble.textContent = msg.message;
          el.classList.add('edited');
        }
      });
      
      QWAS.State.socket.on('message_deleted', (data) => {
        const el = document.getElementById(`msg-${data.messageId}`);
        if (el) el.remove();
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
        console.log(`📜 chat_history: page=${data.page}, messages=${data.messages?.length}, hasMore=${data.hasMore}`);
        const container = document.getElementById('messages');
        if (!container) return;
        
        const { messages, hasMore, page } = data;
        
        QWAS.State.hasMoreMessages = hasMore;
        QWAS.State.currentPage = page || 1;
        
        if (page === 1) {
          // Первая страница - очищаем
          container.innerHTML = '';
          
          if (!messages || messages.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><p>Нет сообщений</p></div>';
          } else {
            messages.forEach(m => {
              if (QWAS.Messages && QWAS.Messages.add) {
                QWAS.Messages.add(m, true);
              }
            });
            if (QWAS.Messages && QWAS.Messages.ensureSpacer) {
              QWAS.Messages.ensureSpacer();
            }
          }
          
          setTimeout(() => {
            container.scrollTop = container.scrollHeight;
          }, 50);
        } else {
          // Подгружаем старые сообщения
          const oldScrollHeight = container.scrollHeight;
          
          if (messages && messages.length > 0) {
            for (let i = messages.length - 1; i >= 0; i--) {
              if (QWAS.Messages && QWAS.Messages.prepend) {
                QWAS.Messages.prepend(messages[i]);
              }
            }
          }
          
          setTimeout(() => {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - oldScrollHeight;
          }, 50);
        }
        
        QWAS.State.isLoadingMessages = false;
      });
      
      QWAS.State.socket.on('typing', (d) => {
        if (d.from === QWAS.State.current) {
          const indicator = document.getElementById('typingIndicator');
          if (indicator) indicator.textContent = `@${QWAS.State.current} печатает...`;
        }
      });
      
      QWAS.State.socket.on('stop_typing', () => {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) indicator.textContent = '';
      });
      
      QWAS.State.socket.on('all_users', (users) => {
        console.log('👥 Получены пользователи:', users?.length || 0);
        QWAS.State.allUsers = users || [];
      });
      
      QWAS.State.socket.on('connect', () => {
        console.log('✅ Socket подключен');
      });
      
      QWAS.State.socket.on('disconnect', () => {
        console.log('❌ Socket отключен');
      });
      
      QWAS.State.socket.on('connect_error', (err) => {
        console.error('❌ Ошибка подключения:', err.message);
      });
    }
  };
})();