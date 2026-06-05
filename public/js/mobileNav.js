// Mobile bottom nav (Чаты / Контакты / Настройки)
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const MobileNav = {
    init() {
      const nav = document.getElementById('mobileNav');
      if (!nav) return;
      this.nav = nav;
      nav.querySelectorAll('.mobile-nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => this.handle(btn.dataset.nav, btn));
      });
    },

    setActive(target) {
      if (!this.nav) return;
      this.nav.querySelectorAll('.mobile-nav-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.nav === target);
      });
    },

    handle(target, btn) {
      this.setActive(target);

      // Если открыт чат — сначала закрыть его
      const main = document.getElementById('mainScreen');
      if (main && main.classList.contains('chat-open')) {
        this._closeChat();
        // Сделаем активной "Чаты"
        this.setActive('chats');
        return;
      }

      if (target === 'chats') {
        // Уже на чатах
        this.setActive('chats');
        return;
      }
      if (target === 'contacts') {
        if (QWAS.Modals && QWAS.Modals.openContacts) QWAS.Modals.openContacts();
        else if (QWAS.Modals && QWAS.Modals.openNewChat) QWAS.Modals.openNewChat();
        return;
      }
      if (target === 'settings') {
        if (QWAS.Modals && QWAS.Modals.openSettings) QWAS.Modals.openSettings();
        return;
      }
    },

    _closeChat() {
      const main = document.getElementById('mainScreen');
      if (!main) return;
      main.classList.add('chat-opening');
      main.classList.remove('chat-open');
      try { history.back(); } catch {}
      setTimeout(() => {
        main.classList.remove('chat-opening');
        if (QWAS.State) QWAS.State.current = null;
        const list = document.getElementById('messages');
        if (list) list.innerHTML = '';
        const empty = document.getElementById('emptyChat');
        const content = document.getElementById('chatContent');
        if (empty) empty.style.display = '';
        if (content) content.style.display = 'none';
      }, 320);
    }
  };

  window.QWAS.MobileNav = MobileNav;
})();
