// Boot — точка входа. Навешивает все обработчики после загрузки DOM.
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  function start() {
    // Глобальные обработчики
    const authScreen = document.getElementById('authScreen');
    const mainScreen = document.getElementById('mainScreen');

    // Инициализируем утилиты, состояние
    QWAS.State.isReady = false;

    // Запускаем Auth
    QWAS.Auth.init().then(() => {
      // Применяем сохранённую тему / шрифт / обои
      if (QWAS.State.applyLocalSettings) QWAS.State.applyLocalSettings();
      if (QWAS.Modals && QWAS.Modals._applyTheme) QWAS.Modals._applyTheme();
      if (QWAS.Modals && QWAS.Modals._applyWallpaper) {
        const wp = QWAS.State.settings.wallpaper || 'gradient1';
        const custom = QWAS.State.settings.wallpaperCustom;
        QWAS.Modals._applyWallpaper(wp, custom);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
