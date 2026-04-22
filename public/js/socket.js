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
        if (msg.from === QWAS.State.current || msg.to === QWAS.State.current || 
            QWAS.State.current === QWAS.Config.FAVORITE_CHAT_ID) {
          QWAS.Messages.add(msg);
          if (msg.from === QWAS.State.current) {
            QWAS.State.socket.emit('mark_as_read', { from: msg.from });
          }
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
      
      QWAS.State.socket.on('chat_history', (msgs) => {
        const container = document.getElementById('messages');
        container.innerHTML = msgs.length ? '' : 
          '<div class="empty-state"><div class="empty-state-icon">💬</div><p>Нет сообщений</p></div>';
        msgs.forEach(m => QWAS.Messages.add(m, true));
        container.scrollTop = container.scrollHeight;
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