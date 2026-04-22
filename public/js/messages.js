(function() {
  'use strict';
  
  QWAS.Messages = {
    ensureSpacer: function() {
      const container = document.getElementById('messages');
      if (!container) return;
      
      let spacer = container.querySelector('.messages-spacer');
      if (!spacer) {
        spacer = document.createElement('div');
        spacer.className = 'messages-spacer';
        container.appendChild(spacer);
      }
      return spacer;
    },
    
    add: function(msg, skipScroll = false) {
      const container = document.getElementById('messages');
      if (!container) return;
      
      if (container.children.length === 1 && 
          container.children[0].classList.contains('empty-state')) {
        container.innerHTML = '';
      }
      
      if (document.getElementById(`msg-${msg._id}`)) return;
      
      const spacer = container.querySelector('.messages-spacer');
      if (spacer) spacer.remove();
      
      const messageElement = this.createMessageElement(msg);
      container.appendChild(messageElement);
      
      this.ensureSpacer();
      
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (!skipScroll && isNearBottom) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 10);
      } else if (!isNearBottom) {
        this.showScrollButton(msg.from !== QWAS.State.me ? 1 : 0);
      }
    },
    
    prepend: function(msg) {
      const container = document.getElementById('messages');
      if (!container) return;
      
      if (container.children.length === 1 && 
          container.children[0].classList.contains('empty-state')) {
        container.innerHTML = '';
      }
      
      if (document.getElementById(`msg-${msg._id}`)) return;
      
      const messageElement = this.createMessageElement(msg);
      
      const firstMessage = Array.from(container.children).find(
        child => !child.classList.contains('messages-spacer')
      );
      
      if (firstMessage) {
        container.insertBefore(messageElement, firstMessage);
      } else {
        container.appendChild(messageElement);
      }
      
      this.ensureSpacer();
    },
    
    createMessageElement: function(msg) {
      const isMe = msg.from === QWAS.State.me;
      const div = document.createElement('div');
      div.className = `message ${isMe ? 'me' : 'other'} ${msg.edited ? 'edited' : ''}`;
      div.id = `msg-${msg._id}`;
      
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showMenu(msg, e);
      });
      
      let timer;
      div.addEventListener('touchstart', (e) => {
        timer = setTimeout(() => this.showMenu(msg, e), 500);
      });
      div.addEventListener('touchend', () => clearTimeout(timer));
      div.addEventListener('touchmove', () => clearTimeout(timer));
      
      const avatarColor = isMe ? QWAS.State.currentUser.avatarColor : '#6366f1';
      const avatarContent = isMe && QWAS.State.currentUser.avatar
        ? `<img src="${QWAS.State.currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        : QWAS.Utils.getAvatarLetter(msg.from);
      
      div.innerHTML = `
        <div class="message-avatar" style="background: ${(isMe && QWAS.State.currentUser.avatar) ? 'transparent' : avatarColor};">
          ${avatarContent}
        </div>
        <div style="flex:1;">
          ${msg.isForwarded && msg.forwardedFrom ? 
            `<div class="message-forwarded">↪ Переслано от @${msg.forwardedFrom}</div>` : ''}
          <div class="message-bubble">${QWAS.Utils.escapeHtml(msg.message)}</div>
          <div class="message-meta">
            <span>${QWAS.Utils.formatTime(msg.createdAt)}</span>
            ${isMe ? `<span class="message-status ${msg.status === 'read' ? 'read' : ''}">${msg.status === 'read' ? '✓✓' : '✓'}</span>` : ''}
          </div>
        </div>
      `;
      
      return div;
    },
    
    showMenu: function(msg, event) {
      QWAS.State.selectedMessage = msg;
      const menu = document.getElementById('messageMenu');
      if (!menu) return;
      
      const x = event.clientX || (event.touches ? event.touches[0].clientX : 0);
      const y = event.clientY || (event.touches ? event.touches[0].clientY : 0);
      
      menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
      menu.style.top = Math.min(y, window.innerHeight - 160) + 'px';
      menu.classList.add('show');
      
      setTimeout(() => {
        document.addEventListener('click', () => menu.classList.remove('show'), { once: true });
      }, 100);
    },
    
    send: function() {
      const input = document.getElementById('msg');
      if (!input) return;
      
      const text = input.value.trim();
      if (!text || !QWAS.State.current) return;
      
      if (QWAS.State.editingMessageId) {
        QWAS.State.socket.emit('edit_message', {
          messageId: QWAS.State.editingMessageId,
          newText: text
        });
        QWAS.State.editingMessageId = null;
      } else {
        QWAS.State.socket.emit('send_message', {
          to: QWAS.State.current,
          message: text
        });
      }
      
      input.value = '';
    },
    
    forward: function() {
      if (!QWAS.State.selectedMessage) return;
      document.getElementById('messageMenu').classList.remove('show');
      this.openForwardModal();
    },
    
    edit: function() {
      const msg = QWAS.State.selectedMessage;
      if (!msg || msg.from !== QWAS.State.me) {
        QWAS.Notifications.error('Только свои сообщения');
        document.getElementById('messageMenu').classList.remove('show');
        return;
      }
      
      QWAS.State.editingMessageId = msg._id;
      document.getElementById('msg').value = msg.message;
      document.getElementById('msg').focus();
      document.getElementById('messageMenu').classList.remove('show');
    },
    
    delete: function() {
      const msg = QWAS.State.selectedMessage;
      if (!msg || msg.from !== QWAS.State.me) {
        QWAS.Notifications.error('Только свои сообщения');
        document.getElementById('messageMenu').classList.remove('show');
        return;
      }
      
      if (!confirm('Удалить сообщение?')) {
        document.getElementById('messageMenu').classList.remove('show');
        return;
      }
      
      QWAS.State.socket.emit('delete_message', { messageId: msg._id });
      document.getElementById('messageMenu').classList.remove('show');
    },
    
    openForwardModal: function() {
      const list = document.getElementById('forwardChatList');
      if (!list) return;
      
      const available = [
        { username: QWAS.Config.FAVORITE_CHAT_ID },
        ...QWAS.State.chatList.filter(c => c.username !== QWAS.State.current)
      ];
      
      list.innerHTML = available.map(c => {
        const isFav = c.username === QWAS.Config.FAVORITE_CHAT_ID;
        return `
          <div class="forward-chat-item" onclick="QWAS.Messages.sendForward('${c.username}')">
            <div class="user-avatar small" id="forward-avatar-${c.username}"></div>
            <div>${isFav ? 'Избранное' : '@' + c.username}</div>
          </div>
        `;
      }).join('');
      
      available.forEach(c => {
        const avatarEl = document.getElementById(`forward-avatar-${c.username}`);
        if (avatarEl) {
          QWAS.Utils.renderAvatar(avatarEl, {
            username: c.username,
            avatar: c.avatar,
            avatarColor: c.avatarColor
          });
          if (c.username === QWAS.Config.FAVORITE_CHAT_ID) {
            avatarEl.textContent = '⭐';
            avatarEl.style.background = '#6366f1';
          }
        }
      });
      
      document.getElementById('forwardModal').classList.add('show');
    },
    
    closeForwardModal: function() {
      document.getElementById('forwardModal').classList.remove('show');
    },
    
    sendForward: function(to) {
      if (!QWAS.State.selectedMessage) return;
      
      QWAS.State.socket.emit('send_message', {
        to,
        message: QWAS.State.selectedMessage.message,
        isForwarded: true,
        forwardedFrom: QWAS.State.selectedMessage.from
      });
      
      this.closeForwardModal();
      QWAS.Notifications.success('Переслано');
    },
    
    showScrollButton: function(count = 1) {
      const btn = document.getElementById('scrollToBottomBtn');
      const badge = document.getElementById('scrollUnreadBadge');
      
      if (btn) {
        btn.classList.add('show');
        if (badge) {
          QWAS.State.unreadCount += count;
          badge.textContent = QWAS.State.unreadCount;
          badge.style.display = 'flex';
        }
      }
    },
    
    hideScrollButton: function() {
      const btn = document.getElementById('scrollToBottomBtn');
      const badge = document.getElementById('scrollUnreadBadge');
      
      if (btn) {
        btn.classList.remove('show');
        if (badge) {
          QWAS.State.unreadCount = 0;
          badge.textContent = '';
          badge.style.display = 'none';
        }
      }
    },
    
    updateScrollButton: function() {
      const container = document.getElementById('messages');
      const btn = document.getElementById('scrollToBottomBtn');
      if (!container || !btn) return;
      
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isNearBottom) {
        this.hideScrollButton();
      }
    },
    
    scrollToBottom: function() {
      const container = document.getElementById('messages');
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        this.hideScrollButton();
      }
    }
  };
  
  // Инициализация ввода
  const msgInput = document.getElementById('msg');
  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        QWAS.Messages.send();
      }
    });
    
    msgInput.addEventListener('input', () => {
      if (!QWAS.State.current || QWAS.State.current === QWAS.Config.FAVORITE_CHAT_ID) return;
      
      QWAS.State.socket.emit('typing', QWAS.State.current);
      clearTimeout(QWAS.State.typingTimeout);
      QWAS.State.typingTimeout = setTimeout(() => {
        QWAS.State.socket.emit('stop_typing', QWAS.State.current);
      }, QWAS.Config.TYPING_TIMEOUT);
    });
  }
  
  // Пагинация и кнопка скролла
  const messagesContainer = document.getElementById('messages');
  if (messagesContainer) {
    let isLoadingMore = false;
    
    messagesContainer.addEventListener('scroll', () => {
      const scrollTop = messagesContainer.scrollTop;
      
      if (scrollTop < 30 && QWAS.State.hasMoreMessages && !QWAS.State.isLoadingMessages && !isLoadingMore) {
        isLoadingMore = true;
        QWAS.State.isLoadingMessages = true;
        
        if (QWAS.State.socket) {
          QWAS.State.socket.emit('load_more');
        }
        
        setTimeout(() => {
          isLoadingMore = false;
        }, 2000);
      }
      
      QWAS.Messages.updateScrollButton();
    });
  }
})();