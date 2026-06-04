// Главное меню (гамбургер)
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const MainMenu = {
    init() {
      this._build();
    },

    _build() {
      const existing = document.getElementById('mainMenu');
      if (existing) return;
      const menu = document.createElement('div');
      menu.id = 'mainMenu';
      menu.className = 'main-menu';
      menu.style.display = 'none';
      menu.innerHTML = `
        <div class="main-menu-header">
          ${QWAS.State.me ? QWAS.Util.avatarHtml(QWAS.State.me, 48) : ''}
          <div>
            <div class="main-menu-name">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(QWAS.State.me || {}))}</div>
            <div class="main-menu-username">@${QWAS.Util.escapeHtml((QWAS.State.me || {}).username || '')}</div>
          </div>
        </div>
        <button class="main-menu-item" id="menuProfile">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m0 2c-3.34 0-10 1.67-10 5v3h20v-3c0-3.33-6.66-5-10-5"/></svg>
          <span>Мой профиль</span>
        </button>
        <button class="main-menu-item" id="menuSettings">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.14.24.42.32.65.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.05.24.25.42.49.42h4a.5.5 0 0 0 .49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.1.51.02.65-.22l2-3.46a.5.5 0 0 0-.12-.64z"/></svg>
          <span>Настройки</span>
        </button>
        <button class="main-menu-item" id="menuNewChat" data-action="newchat">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>
          <span>Новый чат</span>
        </button>
        <button class="main-menu-item" id="menuFolders">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M10 4H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8z"/></svg>
          <span>Папки</span>
        </button>
        <button class="main-menu-item" id="menuLogout">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16 17v-3H9v-4h7V7l5 5zM14 2a2 2 0 0 1 2 2v2h-2V4H5v16h9v-2h2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg>
          <span>Выйти</span>
        </button>
      `;
      // Стили
      if (!document.getElementById('mainMenuStyles')) {
        const s = document.createElement('style');
        s.id = 'mainMenuStyles';
        s.textContent = `
          .main-menu { position: absolute; top: 56px; left: 12px; background: var(--bg-elev, #1f2a37); border: 1px solid var(--border, #2a3543); border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.4); z-index: 1000; min-width: 240px; padding: 8px; }
          .main-menu-header { display: flex; gap: 12px; align-items: center; padding: 12px; border-bottom: 1px solid var(--border, #2a3543); margin-bottom: 8px; }
          .main-menu-name { font-weight: 600; }
          .main-menu-username { font-size: 12px; color: var(--text-secondary, #7d8e9b); }
          .main-menu-item { display: flex; gap: 12px; align-items: center; width: 100%; padding: 10px 12px; background: none; border: none; color: inherit; text-align: left; cursor: pointer; border-radius: 8px; }
          .main-menu-item:hover { background: var(--hover, #2a3543); }
        `;
        document.head.appendChild(s);
      }
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.appendChild(menu);

      // Привязка
      menu.querySelector('#menuProfile')?.addEventListener('click', () => {
        menu.style.display = 'none';
        if (QWAS.Modals) QWAS.Modals.openProfile();
      });
      menu.querySelector('#menuSettings')?.addEventListener('click', () => {
        menu.style.display = 'none';
        if (QWAS.Modals) QWAS.Modals.openSettings();
      });
      menu.querySelector('#menuNewChat')?.addEventListener('click', () => {
        menu.style.display = 'none';
        if (QWAS.Modals) QWAS.Modals.openNewChat();
      });
      menu.querySelector('#menuFolders')?.addEventListener('click', () => {
        menu.style.display = 'none';
        if (QWAS.Folders) QWAS.Folders._createPrompt();
      });
      menu.querySelector('#menuLogout')?.addEventListener('click', () => {
        menu.style.display = 'none';
        if (confirm('Выйти?')) QWAS.Auth && QWAS.Auth.logout();
      });
    }
  };
  window.QWAS.MainMenu = MainMenu;
})();
