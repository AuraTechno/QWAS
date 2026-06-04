// Боковая панель: меню, поиск, обновление онлайн
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Sidebar = {
    totalUnread: 0,
    isOpen: true,

    init() {
      this._bindMenu();
      this._bindLogout();
      this._bindProfileButton();
    },

    _bindMenu() {
      const btn = document.getElementById('sidebarMenuBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          const menu = document.getElementById('mainMenu');
          if (menu) {
            const shown = menu.style.display === 'block';
            menu.style.display = shown ? 'none' : 'block';
          }
        });
      }
      // Закрыть меню при клике вне
      document.addEventListener('click', (e) => {
        const menu = document.getElementById('mainMenu');
        const btn = document.getElementById('sidebarMenuBtn');
        if (menu && !menu.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
          menu.style.display = 'none';
        }
      });
    },

    _bindLogout() {
      const btn = document.getElementById('menuLogout');
      if (btn) btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Выйти из аккаунта?')) QWAS.Auth && QWAS.Auth.logout();
      });
    },

    _bindProfileButton() {
      const btn = document.getElementById('menuProfile');
      if (btn) btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (QWAS.Modals) QWAS.Modals.openProfile();
      });
      const set = document.getElementById('menuSettings');
      if (set) set.addEventListener('click', (e) => {
        e.preventDefault();
        if (QWAS.Modals) QWAS.Modals.openSettings();
      });
    },

    setTotalUnread(n) {
      this.totalUnread = n;
      this._renderUnread();
    },

    _renderUnread() {
      const el = document.getElementById('sidebarUnread');
      if (el) {
        if (this.totalUnread > 0) {
          el.textContent = this.totalUnread > 99 ? '99+' : this.totalUnread;
          el.style.display = 'flex';
        } else {
          el.style.display = 'none';
        }
      }
      // Заголовок вкладки
      const orig = 'QWAS Messenger';
      document.title = this.totalUnread > 0 ? `(${this.totalUnread}) ${orig}` : orig;
    },

    updateOnline() {
      QWAS.Chats && QWAS.Chats.render();
      QWAS.Chat && QWAS.Chat.renderHeader && QWAS.State.currentChatInfo && QWAS.Chat.renderHeader(QWAS.State.currentChatInfo);
    },

    render() {
      this._renderUnread();
      if (QWAS.Chats) QWAS.Chats.render();
    }
  };

  window.QWAS.Sidebar = Sidebar;
})();
