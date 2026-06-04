(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Toast = {
    container: null,

    ensureContainer() {
      if (!this.container) {
        this.container = document.getElementById('toastContainer');
      }
      return this.container;
    },

    show(message, type = 'info', duration = 3000) {
      const c = this.ensureContainer();
      if (!c) return;
      const t = document.createElement('div');
      t.className = 'toast toast-' + type;
      const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
      t.innerHTML = `<span style="font-size:16px;">${icons[type] || 'ℹ'}</span><span>${QWAS.Util.escapeHtml(message)}</span>`;
      c.appendChild(t);
      setTimeout(() => {
        t.classList.add('removing');
        setTimeout(() => t.remove(), 250);
      }, duration);
    },

    success(m, d) { this.show(m, 'success', d); },
    error(m, d) { this.show(m, 'error', d); },
    info(m, d) { this.show(m, 'info', d); },
    warning(m, d) { this.show(m, 'warning', d); }
  };

  QWAS.Toast = Toast;
})();
