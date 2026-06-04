// Контекстное меню: правый клик по чату/сообщению
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const ContextMenu = {
    init() {
      document.addEventListener('click', () => this.hide());
      const menu = document.getElementById('contextMenu');
      if (menu) {
        menu.addEventListener('click', (e) => e.stopPropagation());
      }
    },

    show(e, items) {
      const menu = document.getElementById('contextMenu');
      if (!menu) return;
      e.preventDefault();
      e.stopPropagation();
      menu.innerHTML = items.map(it => {
        if (it.divider) return '<div class="context-divider"></div>';
        return `<button class="context-item ${it.danger ? 'danger' : ''}" data-id="${it.id || ''}">
          ${it.icon ? `<span class="context-icon">${it.icon}</span>` : ''}
          <span>${QWAS.Util.escapeHtml(it.label)}</span>
        </button>`;
      }).join('');
      menu.querySelectorAll('.context-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const it = items.find(x => x.id === id);
          if (it && it.onclick) it.onclick();
          this.hide();
        });
      });
      // Позиция
      const x = Math.min(e.clientX, window.innerWidth - 240);
      const y = Math.min(e.clientY, window.innerHeight - 300);
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.style.display = 'block';
    },

    showChatMenu(e, chatId) {
      const c = QWAS.Chats.list.find(x => x.chatId === chatId);
      if (!c) return;
      this.show(e, [
        { id: 'open', label: 'Открыть', icon: '💬', onclick: () => QWAS.Chat.open(chatId) },
        { id: 'pin', label: c.isPinned ? 'Открепить' : 'Закрепить', icon: '📌', onclick: () => QWAS.Chats.setPinned(chatId, !c.isPinned) },
        { id: 'mute', label: c.isMuted ? 'Включить звук' : 'Отключить звук', icon: '🔕', onclick: () => QWAS.Chats.setMuted(chatId, !c.isMuted) },
        { id: 'archive', label: c.isArchived ? 'Разархивировать' : 'В архив', icon: '📦', onclick: () => QWAS.Chats.setArchived(chatId, !c.isArchived) },
        { divider: true },
        { id: 'markread', label: 'Прочитано', icon: '✓', onclick: () => QWAS.Chats.markRead(chatId) }
      ]);
    },

    showMessageMenu(e, messageId) {
      const me = QWAS.State.me;
      const m = (QWAS.State.messagesByChat.get(QWAS.State.current) || []).find(x => x.id === messageId);
      if (!m) return;
      const isMine = m.fromId === me?.id;
      const items = [
        { id: 'react', label: 'Реакция', icon: '😊', onclick: () => QWAS.Messages.showReactionPicker(e.target, messageId) },
        { id: 'reply', label: 'Ответить', icon: '↩', onclick: () => QWAS.Messages.replyTo(messageId) },
        { id: 'copy', label: 'Копировать', icon: '📋', onclick: () => QWAS.Messages.copyMessage(messageId) },
        { id: 'forward', label: 'Переслать', icon: '↗', onclick: () => QWAS.Messages.forwardMessage(messageId) },
        { id: 'pin', label: 'Закрепить', icon: '📌', onclick: () => QWAS.Messages.pinMessage(messageId) }
      ];
      if (isMine) {
        items.push({ divider: true });
        items.push({ id: 'edit', label: 'Редактировать', icon: '✎', onclick: () => QWAS.Messages.editMessage(messageId) });
        items.push({ id: 'delete', label: 'Удалить', icon: '🗑', danger: true, onclick: () => QWAS.Messages.confirmDelete(messageId) });
      }
      this.show(e, items);
    },

    hide() {
      const menu = document.getElementById('contextMenu');
      if (menu) menu.style.display = 'none';
    }
  };

  window.QWAS.ContextMenu = ContextMenu;
})();
