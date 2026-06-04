// Тосты: info / success / error
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Toast = {
    container: null,
    _nextId: 1,

    _ensure() {
      if (!this.container) this.container = document.getElementById('toastContainer');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toastContainer';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    },

    show(message, type = 'info', duration = 3500) {
      this._ensure();
      const id = this._nextId++;
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.dataset.id = id;
      el.innerHTML = `<div class="toast-text">${QWAS.Util.escapeHtml(message)}</div>`;
      this.container.appendChild(el);
      requestAnimationFrame(() => el.classList.add('toast-show'));
      setTimeout(() => {
        el.classList.remove('toast-show');
        el.classList.add('toast-hide');
        setTimeout(() => el.remove(), 250);
      }, duration);
    },

    info(msg, dur) { this.show(msg, 'info', dur); },
    success(msg, dur) { this.show(msg, 'success', dur); },
    error(msg, dur) { this.show(msg, 'error', dur || 5000); },
    warn(msg, dur) { this.show(msg, 'warn', dur); }
  };

  window.QWAS.Toast = Toast;
})();
