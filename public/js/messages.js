(function() {
  'use strict';

  QWAS.Messages = {
    firstMessageBeforeLoad: null,
    uploading: false,

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
        setTimeout(() => container.scrollTop = container.scrollHeight, 10);
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

    saveScrollPosition: function() {
      const container = document.getElementById('messages');
      if (!container) return;

      const messages = Array.from(container.children).filter(
        child => child.classList.contains('message')
      );

      const containerRect = container.getBoundingClientRect();

      for (const msg of messages) {
        const rect = msg.getBoundingClientRect();
        if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
          this.firstMessageBeforeLoad = {
            id: msg.id,
            offset: rect.top - containerRect.top
          };
          break;
        }
      }

      if (!this.firstMessageBeforeLoad && messages.length > 0) {
        const firstMsg = messages[0];
        const rect = firstMsg.getBoundingClientRect();
        this.firstMessageBeforeLoad = {
          id: firstMsg.id,
          offset: rect.top - containerRect.top
        };
      }
    },

    restoreScrollPosition: function() {
      const container = document.getElementById('messages');
      if (!container || !this.firstMessageBeforeLoad) return;

      const targetMsg = document.getElementById(this.firstMessageBeforeLoad.id);
      if (targetMsg) {
        const rect = targetMsg.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const currentOffset = rect.top - containerRect.top;
        const delta = currentOffset - this.firstMessageBeforeLoad.offset;
        container.scrollTop = container.scrollTop + delta;
      }

      this.firstMessageBeforeLoad = null;
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

      let attachmentsHtml = '';
      if (msg.attachments && msg.attachments.length > 0) {
        attachmentsHtml = msg.attachments.map(a => this.renderAttachment(a)).join('');
      }

      div.innerHTML = `
        <div class="message-avatar" style="background: ${(isMe && QWAS.State.currentUser.avatar) ? 'transparent' : avatarColor};">
          ${avatarContent}
        </div>
        <div style="flex:1;">
          ${msg.isForwarded && msg.forwardedFrom ?
            `<div class="message-forwarded">↪ Переслано от @${msg.forwardedFrom}</div>` : ''}
          ${attachmentsHtml}
          ${msg.message ? `<div class="message-bubble">${QWAS.Utils.escapeHtml(msg.message)}</div>` : ''}
          <div class="message-meta">
            <span>${QWAS.Utils.formatTime(msg.createdAt)}</span>
            ${isMe ? `<span class="message-status ${msg.status === 'read' ? 'read' : ''}">${msg.status === 'read' ? '✓✓' : '✓'}</span>` : ''}
          </div>
        </div>
      `;

      // Click handler for images
      if (msg.attachments) {
        msg.attachments.forEach(a => {
          if (a.type === 'image') {
            setTimeout(() => {
              const img = div.querySelector(`img[src="${QWAS.Utils.escapeHtml(a.url)}"]`);
              if (img) img.addEventListener('click', () => QWAS.Messages.openLightbox(a.url));
            }, 0);
          }
        });
      }

      return div;
    },

    renderAttachment: function(att) {
      if (att.type === 'image') {
        return `<div class="message-attachment-image" onclick="QWAS.Messages.openLightbox('${att.url}')">
          <img src="${att.url}" alt="${QWAS.Utils.escapeHtml(att.name)}" loading="lazy">
        </div>`;
      }
      if (att.type === 'audio') {
        return `<div class="message-attachment-audio">
          <audio src="${att.url}" controls preload="metadata"></audio>
        </div>`;
      }
      return `<div class="message-attachment-file">
        <a href="${att.url}" download="${QWAS.Utils.escapeHtml(att.name)}" target="_blank">
          <span class="file-icon">📎</span>
          <span class="file-name">${QWAS.Utils.escapeHtml(att.name)}</span>
          <span class="file-size">${QWAS.Utils.formatSize(att.size)}</span>
        </a>
      </div>`;
    },

    openLightbox: function(url) {
      const modal = document.getElementById('lightboxModal');
      const img = document.getElementById('lightboxImage');
      if (!modal || !img) return;
      img.src = url;
      modal.classList.add('show');
    },

    closeLightbox: function() {
      const modal = document.getElementById('lightboxModal');
      if (modal) modal.classList.remove('show');
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
      if (!text && !QWAS.Messages.pendingFile) return;
      if (!QWAS.State.current) return;

      if (QWAS.State.editingMessageId) {
        QWAS.State.socket.emit('edit_message', {
          messageId: QWAS.State.editingMessageId,
          newText: text
        });
        QWAS.State.editingMessageId = null;
        input.value = '';
        return;
      }

      const payload = { to: QWAS.State.current, message: text || '' };

      if (QWAS.Messages.pendingFile) {
        payload.attachments = [QWAS.Messages.pendingFile];
        QWAS.Messages.pendingFile = null;
        const preview = document.getElementById('filePreview');
        if (preview) preview.style.display = 'none';
      }

      QWAS.State.socket.emit('send_message', payload);
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

    handleFileSelect: function(e) {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 20 * 1024 * 1024) {
        QWAS.Notifications.error('Файл слишком большой (макс 20MB)');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const uploadBtn = document.getElementById('fileUploadBtn');
      if (uploadBtn) uploadBtn.textContent = '⏳';

      fetch('/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${QWAS.State.userToken}` },
        body: formData
      })
      .then(r => r.json())
      .then(data => {
        if (uploadBtn) uploadBtn.textContent = '📎';
        if (!data.ok) {
          QWAS.Notifications.error(data.error || 'Ошибка загрузки');
          return;
        }

        QWAS.Messages.pendingFile = data.file;
        QWAS.Messages.showFilePreview(data.file);
      })
      .catch(err => {
        if (uploadBtn) uploadBtn.textContent = '📎';
        console.error('Upload error:', err);
        QWAS.Notifications.error('Ошибка загрузки');
      });

      e.target.value = '';
    },

    showFilePreview: function(file) {
      const preview = document.getElementById('filePreview');
      if (!preview) return;

      let html = '';
      if (file.type === 'image') {
        html = `<img src="${file.url}" class="file-preview-img">`;
      } else if (file.type === 'audio') {
        html = `<audio src="${file.url}" controls style="width:100%;"></audio>`;
      } else {
        html = `<div class="file-preview-info">📎 ${QWAS.Utils.escapeHtml(file.name)} (${QWAS.Utils.formatSize(file.size)})</div>`;
      }

      html += `<button class="file-preview-remove" onclick="QWAS.Messages.removeFile()">✕</button>`;
      preview.innerHTML = html;
      preview.style.display = 'block';

      const msgInput = document.getElementById('msg');
      if (msgInput) msgInput.focus();
    },

    removeFile: function() {
      QWAS.Messages.pendingFile = null;
      const preview = document.getElementById('filePreview');
      if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
      }
    },

    openForwardModal: function() {
      const list = document.getElementById('forwardChatList');
      if (!list) return;

      const dmChats = (QWAS.State.chatList || [])
        .filter(c => c.username !== QWAS.State.current && !c.username.startsWith('group:'));

      const groupChats = (QWAS.Groups.myGroups || [])
        .filter(g => `group:${g._id}` !== QWAS.State.current);

      const available = [
        { username: QWAS.Config.FAVORITE_CHAT_ID },
        ...groupChats.map(g => ({ isGroup: true, _id: g._id, name: g.name, avatarColor: g.avatarColor })),
        ...dmChats
      ];

      list.innerHTML = available.map(c => {
        if (c.isGroup) {
          return `
            <div class="forward-chat-item" onclick="QWAS.Messages.sendForward('group:${c._id}')">
              <div class="user-avatar small" style="background:${c.avatarColor}; font-size:14px;">👥</div>
              <div>${QWAS.Utils.escapeHtml(c.name)}</div>
            </div>
          `;
        }
        const isFav = c.username === QWAS.Config.FAVORITE_CHAT_ID;
        return `
          <div class="forward-chat-item" onclick="QWAS.Messages.sendForward('${c.username}')">
            <div class="user-avatar small" id="forward-avatar-${c.username}"></div>
            <div>${isFav ? 'Избранное' : '@' + c.username}</div>
          </div>
        `;
      }).join('');

      available.forEach(c => {
        if (c.isGroup) return;
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

      const payload = {
        to,
        message: QWAS.State.selectedMessage.message || '',
        isForwarded: true,
        forwardedFrom: QWAS.State.selectedMessage.from
      };

      if (QWAS.State.selectedMessage.attachments && QWAS.State.selectedMessage.attachments.length > 0) {
        payload.attachments = QWAS.State.selectedMessage.attachments;
      }

      QWAS.State.socket.emit('send_message', payload);
      this.closeForwardModal();
      QWAS.Notifications.success('Переслано');
    },

    showScrollButton: function(count = 1) {
      const btn = document.getElementById('scrollToBottomBtn');
      const badge = document.getElementById('scrollUnreadBadge');

      if (btn) {
        btn.classList.add('show');
        if (badge) {
          QWAS.State.unreadCount = (QWAS.State.unreadCount || 0) + count;
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

  const messagesContainer = document.getElementById('messages');
  if (messagesContainer) {
    let isLoadingMore = false;

    messagesContainer.addEventListener('scroll', () => {
      const scrollTop = messagesContainer.scrollTop;

      if (scrollTop < 50 && QWAS.State.hasMoreMessages && !QWAS.State.isLoadingMessages && !isLoadingMore) {
        isLoadingMore = true;
        QWAS.State.isLoadingMessages = true;
        QWAS.Messages.saveScrollPosition();

        if (QWAS.State.socket) QWAS.State.socket.emit('load_more');

        setTimeout(() => { isLoadingMore = false; }, 2000);
      }

      QWAS.Messages.updateScrollButton();
    });
  }

  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => QWAS.Messages.handleFileSelect(e));
  }
})();
