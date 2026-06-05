// Контекстное меню: клик по сообщению / чату с iOS-анимацией (scale+fade)
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const ContextMenu = {
    init() {
      document.addEventListener('click', (e) => {
        // Не закрывать если клик по самому меню
        const menu = document.getElementById('contextMenu');
        if (menu && menu.contains(e.target)) return;
        this.hide();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.hide();
      });
      const menu = document.getElementById('contextMenu');
      if (menu) {
        menu.addEventListener('click', (e) => e.stopPropagation());
        // Reposition on resize/scroll
        window.addEventListener('resize', () => this.hide());
        document.addEventListener('scroll', () => this.hide(), true);
      }
    },

    /**
     * Показать контекстное меню
     * @param {Event|{clientX, clientY, target}} e - событие или {clientX, clientY}
     * @param {Array} items - [{id, label, icon, danger, divider, onclick, disabled}]
     * @param {Object} opts - {origin, anchorEl}
     */
    show(e, items, opts = {}) {
      const menu = document.getElementById('contextMenu');
      if (!menu) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      // Закрыть старое с анимацией
      if (menu.style.display === 'block') {
        this.hide(true);
        setTimeout(() => this._doShow(e, items, opts, menu), 80);
        return;
      }
      this._doShow(e, items, opts, menu);
    },

    _doShow(e, items, opts, menu) {
      menu.innerHTML = items.map(it => {
        if (it.divider) return '<div class="context-divider"></div>';
        return `<button class="context-item ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}" data-id="${QWAS.Util.escapeAttr(it.id || '')}" ${it.disabled ? 'disabled' : ''}>
          <span class="ctx-icon">${it.icon || ''}</span>
          <span>${QWAS.Util.escapeHtml(it.label)}</span>
          ${it.shortcut ? `<span class="ctx-shortcut">${QWAS.Util.escapeHtml(it.shortcut)}</span>` : ''}
        </button>`;
      }).join('');
      menu.querySelectorAll('.context-item').forEach(btn => {
        if (btn.disabled) return;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = btn.dataset.id;
          const it = items.find(x => x.id === id);
          if (it && it.onclick) it.onclick();
          this.hide();
        });
      });

      // Позиция + предотвращение выхода за экран
      const margin = 8;
      const w = 220, h = items.length * 40 + 20;
      const cx = e.clientX ?? opts.x ?? window.innerWidth / 2;
      const cy = e.clientY ?? opts.y ?? window.innerHeight / 2;
      let x = Math.max(margin, Math.min(window.innerWidth - w - margin, cx));
      let y = Math.max(margin, Math.min(window.innerHeight - h - margin, cy));
      // Origin для анимации (раскрытие от точки клика)
      const ox = ((cx - x) / w) * 100;
      const oy = ((cy - y) / h) * 100;
      menu.style.setProperty('--ctx-origin', `${ox}% ${oy}%`);
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.style.display = 'block';
      // Restart animation
      menu.classList.remove('closing');
      menu.style.animation = 'none';
      void menu.offsetWidth;
      menu.style.animation = '';
    },

    showChatMenu(e, chatId) {
      const c = (QWAS.Chats?.list || []).find(x => x.chatId === chatId);
      if (!c) return;
      this.show(e, [
        { id: 'open', label: 'Открыть', icon: QWAS.Util.icon('messageCircle', { size: 18 }), onclick: () => QWAS.Chat.open(chatId) },
        { id: 'pin', label: c.isPinned ? 'Открепить' : 'Закрепить', icon: QWAS.Util.icon('pin', { size: 18 }), onclick: () => QWAS.Chats.setPinned(chatId, !c.isPinned) },
        { id: 'mute', label: c.isMuted ? 'Включить звук' : 'Отключить звук', icon: c.isMuted ? QWAS.Util.icon('volume2', { size: 18 }) : QWAS.Util.icon('bellOff', { size: 18 }), onclick: () => QWAS.Chats.setMuted(chatId, !c.isMuted) },
        { id: 'archive', label: c.isArchived ? 'Разархивировать' : 'В архив', icon: QWAS.Util.icon(c.isArchived ? 'archive' : 'archive', { size: 18 }), onclick: () => QWAS.Chats.setArchived(chatId, !c.isArchived) },
        { id: 'read', label: c.unreadCount > 0 ? 'Прочитано' : 'Пометить непрочитанным', icon: QWAS.Util.icon('check', { size: 18 }), onclick: () => QWAS.Chats.markRead(chatId) },
        { divider: true },
        { id: 'clear', label: 'Очистить историю', icon: QWAS.Util.icon('trash', { size: 18 }), danger: true, onclick: () => QWAS.Chats.confirmClearHistory(chatId) }
      ]);
    },

    showMessageMenu(e, messageId) {
      const me = QWAS.State.me;
      const list = QWAS.State.messagesByChat?.get(QWAS.State.current) || [];
      const m = list.find(x => x.id === messageId);
      if (!m) return;
      const isMine = m.fromId === me?.id;
      const items = [
        { id: 'react', label: 'Реакция', icon: QWAS.Util.icon('smile', { size: 18 }), onclick: () => QWAS.Messages?.showReactionPicker?.(e.target, messageId) },
        { id: 'reply', label: 'Ответить', icon: QWAS.Util.icon('reply', { size: 18 }), onclick: () => QWAS.Messages?.replyTo?.(messageId) },
        { id: 'copy', label: 'Копировать', icon: QWAS.Util.icon('copy', { size: 18 }), onclick: () => QWAS.Messages?.copyMessage?.(messageId), disabled: !m.text },
        { id: 'forward', label: 'Переслать', icon: QWAS.Util.icon('forward', { size: 18 }), onclick: () => QWAS.Messages?.forwardMessage?.(messageId) },
        { id: 'pin', label: m.isPinned ? 'Открепить' : 'Закрепить', icon: QWAS.Util.icon('pin', { size: 18 }), onclick: () => m.isPinned ? QWAS.Messages?.unpinMessage?.() : QWAS.Messages?.pinMessage?.(messageId) },
        { id: 'select', label: 'Выбрать', icon: QWAS.Util.icon('checkCircle', { size: 18 }), onclick: () => QWAS.Messages?.enterSelectMode?.(messageId) }
      ];
      if (isMine) {
        items.push({ divider: true });
        items.push({ id: 'edit', label: 'Редактировать', icon: QWAS.Util.icon('edit', { size: 18 }), onclick: () => QWAS.Messages?.editMessage?.(messageId), disabled: m.type !== 'text' });
        items.push({ id: 'delete', label: 'Удалить', icon: QWAS.Util.icon('trash', { size: 18 }), danger: true, onclick: () => QWAS.Messages?.confirmDelete?.(messageId) });
      }
      this.show(e, items);
    },

    showEmptyAreaMenu(e, chatId) {
      this.show(e, [
        { id: 'select', label: 'Выбрать сообщения', icon: QWAS.Util.icon('checkCircle', { size: 18 }), onclick: () => QWAS.Messages?.enterSelectMode?.() }
      ]);
    },

    hide(skipAnimation) {
      const menu = document.getElementById('contextMenu');
      if (!menu || menu.style.display === 'none') return;
      if (skipAnimation) {
        menu.style.display = 'none';
        menu.classList.remove('closing');
        return;
      }
      menu.classList.add('closing');
      setTimeout(() => {
        menu.style.display = 'none';
        menu.classList.remove('closing');
      }, 150);
    }
  };

  window.QWAS.ContextMenu = ContextMenu;
})();
