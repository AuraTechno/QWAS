(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const ContextMenu = {
    currentMenu: null,

    hide() {
      const m = document.getElementById('contextMenu');
      if (m) {
        m.style.display = 'none';
        m.innerHTML = '';
      }
      this.currentMenu = null;
    },

    show(x, y, items) {
      const m = document.getElementById('contextMenu');
      if (!m) return;
      m.innerHTML = items.map(it => {
        if (it.divider) return '<div class="context-divider"></div>';
        const cls = ['context-item'];
        if (it.danger) cls.push('danger');
        return `<div class="${cls.join(' ')}" onclick="QWAS.ContextMenu.run('${it.id}')">${it.icon ? `<span style="opacity:0.7;">${it.icon}</span>` : ''}<span>${it.label}</span></div>`;
      }).join('');
      this.currentMenu = items;

      m.style.display = 'block';
      const rect = m.getBoundingClientRect();
      const w = rect.width || 220;
      const h = rect.height || 240;
      let left = x, top = y;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      m.style.left = left + 'px';
      m.style.top = top + 'px';

      setTimeout(() => {
        document.addEventListener('click', () => this.hide(), { once: true });
      }, 50);
    },

    run(id) {
      this.hide();
      const handler = this.handlers[id];
      if (handler) handler();
    },

    handlers: {},

    register(id, fn) { this.handlers[id] = fn; },

    showMessage(e, messageId) {
      e.preventDefault();
      e.stopPropagation();
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const msg = list.find(m => m._id === messageId);
      if (!msg) return;
      const isMine = msg.from === QWAS.State.me;

      const items = [];

      if (msg.attachments?.length) {
        if (msg.attachments[0].type === 'image') {
          items.push({ id: 'view-image', label: 'Просмотреть', icon: '🔍' });
        }
      }

      items.push({ id: 'reply-' + messageId, label: 'Ответить', icon: '↩️' });
      items.push({ id: 'copy-' + messageId, label: 'Копировать', icon: '📋' });
      items.push({ id: 'select-' + messageId, label: 'Выбрать', icon: '☑️' });
      items.push({ id: 'react-' + messageId, label: 'Реакция', icon: '😀' });
      items.push({ id: 'pin-' + messageId, label: msg.isPinned ? 'Открепить' : 'Закрепить', icon: '📌' });

      if (isMine) {
        if (msg.message) items.push({ id: 'edit-' + messageId, label: 'Редактировать', icon: '✏️' });
        items.push({ divider: true });
        items.push({ id: 'delete-' + messageId, label: 'Удалить', danger: true, icon: '🗑' });
      } else {
        items.push({ divider: true });
        items.push({ id: 'report-' + messageId, label: 'Пожаловаться', icon: '⚠️' });
      }

      this.register('reply-' + messageId, () => this.actionReply(msg));
      this.register('copy-' + messageId, () => this.actionCopy(msg));
      this.register('select-' + messageId, () => this.actionSelect(msg));
      this.register('react-' + messageId, () => Reactions.showAt(e.clientX, e.clientY, messageId));
      this.register('pin-' + messageId, () => this.actionPin(msg));
      this.register('edit-' + messageId, () => this.actionEdit(msg));
      this.register('delete-' + messageId, () => this.actionDelete(msg));
      this.register('view-image', () => {
        if (msg.attachments) QWAS.Lightbox.open(msg.attachments[0].url, msg.attachments[0].name);
      });
      this.register('report-' + messageId, () => QWAS.Toast.info('Жалоба отправлена'));

      const x = e.clientX || (e.touches ? e.touches[0].clientX : 0) || 0;
      const y = e.clientY || (e.touches ? e.touches[0].clientY : 0) || 0;
      this.show(x, y, items);
    },

    showChat(e, username) {
      e.preventDefault();
      const items = [
        { id: 'open-' + username, label: 'Открыть', icon: '💬' },
        { id: 'pin-chat-' + username, label: 'Закрепить', icon: '📌' },
        { id: 'mute-' + username, label: 'Отключить уведомления', icon: '🔕' },
        { id: 'archive-' + username, label: 'Архивировать', icon: '📦' },
        { id: 'markread-' + username, label: 'Прочитано', icon: '✓✓' },
        { divider: true },
        { id: 'clear-' + username, label: 'Очистить историю', danger: true, icon: '🧹' },
        { id: 'delete-chat-' + username, label: 'Удалить чат', danger: true, icon: '🗑' }
      ];
      this.register('open-' + username, () => QWAS.Chat.open(username));
      this.register('pin-chat-' + username, () => this.actionPinChat(username));
      this.register('mute-' + username, () => this.actionMute(username));
      this.register('archive-' + username, () => this.actionArchive(username));
      this.register('markread-' + username, () => {
        QWAS.State.socket.emit('mark_as_read', { chatId: username, from: username.startsWith('group:') ? undefined : username });
      });
      this.register('clear-' + username, () => {
        if (confirm('Очистить историю сообщений?')) {
          QWAS.Toast.info('История очищена');
        }
      });
      this.register('delete-chat-' + username, () => {
        if (confirm('Удалить чат?')) {
          QWAS.Chats.removeChat(username);
          QWAS.Chat.close();
        }
      });

      this.show(e.clientX, e.clientY, items);
    },

    actionReply(msg) {
      QWAS.State.replyTo = msg._id;
      QWAS.ReplyPreview.show(msg);
      const ta = document.getElementById('msgInput');
      if (ta) ta.focus();
    },

    actionCopy(msg) {
      if (msg.message) {
        QWAS.Util.copyToClipboard(msg.message);
        QWAS.Toast.success('Скопировано');
      }
    },

    actionSelect(msg) {
      QWAS.State.isSelectionMode = true;
      QWAS.State.selectedMessages.add(msg._id);
      this.updateSelection();
    },

    actionPin(msg) {
      QWAS.State.socket.emit('pin_message', { messageId: msg._id, pin: !msg.isPinned });
    },

    actionEdit(msg) {
      QWAS.Composer.enterEditMode(msg);
    },

    actionDelete(msg) {
      if (!confirm('Удалить сообщение?')) return;
      QWAS.State.socket.emit('delete_message', { messageId: msg._id });
    },

    actionPinChat(username) {
      const chat = QWAS.State.chats.find(c => c.username === username);
      const pin = !chat?.pinned;
      QWAS.API.post('/chats/pin', { chatId: username, pin }).then(r => {
        if (r.ok) {
          if (chat) chat.pinned = pin;
          QWAS.Chats.render();
          QWAS.Toast.success(pin ? 'Закреплено' : 'Откреплено');
        }
      });
    },

    actionMute(username) {
      const chat = QWAS.State.chats.find(c => c.username === username);
      const mute = !chat?.muted;
      QWAS.API.post('/chats/mute', { chatId: username, mute }).then(r => {
        if (r.ok) {
          if (chat) chat.muted = mute;
          QWAS.Chats.render();
          QWAS.Toast.success(mute ? 'Уведомления отключены' : 'Уведомления включены');
        }
      });
    },

    actionArchive(username) {
      QWAS.API.post('/chats/archive', { chatId: username, archive: true }).then(r => {
        if (r.ok) {
          QWAS.Chats.removeChat(username);
          QWAS.Toast.success('Архивировано');
        }
      });
    },

    updateSelection() {
      const ids = [...QWAS.State.selectedMessages];
      if (!ids.length) {
        QWAS.SelectionActions.hide();
        return;
      }
      QWAS.SelectionActions.show(ids);
    }
  };

  QWAS.ContextMenu = ContextMenu;
  QWAS.SelectionActions = {
    el: null,
    show(ids) {
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.className = 'selection-actions';
        document.body.appendChild(this.el);
      }
      this.el.innerHTML = `
        <button class="selection-action" onclick="QWAS.SelectionActions.forward()">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="m20 8-8 5-8-5V6l8 5 8-5m0-2H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/></svg>
          Переслать
        </button>
        <button class="selection-action" onclick="QWAS.SelectionActions.copy()">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1z"/></svg>
          Копировать
        </button>
        <button class="selection-action" onclick="QWAS.SelectionActions.pin()">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/></svg>
          Закрепить
        </button>
        <button class="selection-action danger" onclick="QWAS.SelectionActions.delete()">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6z"/></svg>
          Удалить
        </button>
        <button class="selection-action" onclick="QWAS.SelectionActions.cancel()">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          Отмена
        </button>
      `;
      this.el.style.display = 'flex';
    },
    hide() {
      if (this.el) this.el.style.display = 'none';
      QWAS.State.isSelectionMode = false;
      QWAS.State.selectedMessages.clear();
      document.querySelectorAll('.message.selected').forEach(el => el.classList.remove('selected'));
    },
    forward() {
      const ids = [...QWAS.State.selectedMessages];
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const msgs = list.filter(m => ids.includes(m._id));
      if (msgs.length) QWAS.Modals.openForward(msgs);
      this.hide();
    },
    copy() {
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const text = [...QWAS.State.selectedMessages]
        .map(id => list.find(m => m._id === id))
        .filter(Boolean)
        .map(m => m.message)
        .filter(Boolean)
        .join('\n');
      if (text) {
        QWAS.Util.copyToClipboard(text);
        QWAS.Toast.success('Скопировано');
      }
      this.hide();
    },
    pin() {
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const ids = [...QWAS.State.selectedMessages];
      ids.forEach(id => {
        const msg = list.find(m => m._id === id);
        if (msg) QWAS.State.socket.emit('pin_message', { messageId: id, pin: true });
      });
      this.hide();
    },
    delete() {
      if (!confirm('Удалить выбранные сообщения?')) return;
      const ids = [...QWAS.State.selectedMessages];
      QWAS.State.socket.emit('delete_messages_bulk', { ids });
      this.hide();
    },
    cancel() { this.hide(); }
  };
})();
