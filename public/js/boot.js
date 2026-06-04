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
      // Применяем сохранённую тему
      if (QWAS.Modals && QWAS.Modals._applyTheme) QWAS.Modals._applyTheme();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
