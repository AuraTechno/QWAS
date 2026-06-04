(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const AVATAR_GRADIENTS = [
    'avatar-gradient-1', 'avatar-gradient-2', 'avatar-gradient-3',
    'avatar-gradient-4', 'avatar-gradient-5', 'avatar-gradient-6',
    'avatar-gradient-7', 'avatar-gradient-8'
  ];

  const Util = {
    escapeHtml(text) {
      if (text == null) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    escapeAttr(text) {
      if (text == null) return '';
      return String(text).replace(/"/g, '&quot;');
    },

    getInitials(name) {
      if (!name) return '?';
      const parts = String(name).trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return String(name).substring(0, 2).toUpperCase();
    },

    gradientFor(name) {
      if (!name) return AVATAR_GRADIENTS[0];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
    },

    avatarColor(name) {
      const palette = ['#5e8ee7', '#b78eff', '#ff7eb6', '#4dd599', '#ffd54f', '#5fc7d7', '#ff6b6b', '#6ab2f2'];
      if (!name) return palette[0];
      let h = 0;
      for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
      return palette[Math.abs(h) % palette.length];
    },

    formatTime(date) {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    },

    formatDate(date) {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diffDays = Math.round((today - msgDay) / 86400000);

      if (diffDays === 0) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      if (diffDays === 1) return 'вчера';
      if (diffDays < 7) return d.toLocaleDateString('ru-RU', { weekday: 'long' });
      if (d.getFullYear() === now.getFullYear()) {
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      }
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    fullDate(date) {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    },

    isSameDay(a, b) {
      const da = new Date(a), db = new Date(b);
      return da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate();
    },

    formatSize(bytes) {
      if (!bytes || bytes < 0) return '';
      if (bytes < 1024) return bytes + ' Б';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
      if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' МБ';
      return (bytes / 1073741824).toFixed(2) + ' ГБ';
    },

    formatDuration(seconds) {
      if (!seconds) return '0:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    },

    relativeTime(date) {
      if (!date) return '';
      const d = new Date(date);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60) return 'только что';
      if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
      if (diff < 604800) return `${Math.floor(diff / 86400)} д назад`;
      if (d.getFullYear() === now.getFullYear()) {
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      }
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    lastSeenText(date, online) {
      if (online) return 'в сети';
      if (!date) return 'был(а) недавно';
      const d = new Date(date);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60) return 'был(а) только что';
      if (diff < 3600) return `был(а) ${Math.floor(diff / 60)} мин назад`;
      if (diff < 86400) return `был(а) ${Math.floor(diff / 3600)} ч назад`;
      if (diff < 604800) return `был(а) ${this.formatDate(date)}`;
      return `был(а) ${this.fullDate(date)}`;
    },

    validateUsername(s) {
      return /^[a-zA-Z0-9_]{3,32}$/.test(s);
    },

    cleanUsername(s) { return (s || '').replace(/^@/, ''); },

    truncate(s, n) {
      if (!s) return '';
      return s.length > n ? s.substring(0, n) + '…' : s;
    },

    detectLinks(text) {
      const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+|@[a-zA-Z0-9_]{3,32})/g;
      return text.replace(urlRegex, (match) => {
        if (match.startsWith('@')) {
          return `<span class="mention" data-username="${Util.escapeAttr(match.slice(1))}">${Util.escapeHtml(match)}</span>`;
        }
        let url = match;
        if (!url.match(/^https?:\/\//)) url = 'https://' + url;
        return `<a href="${Util.escapeAttr(url)}" target="_blank" rel="noopener">${Util.escapeHtml(match)}</a>`;
      });
    },

    renderAvatar(el, user, size = 'size-48') {
      if (!el) return;
      el.className = 'avatar ' + size;
      if (!user) { el.textContent = '?'; return; }
      if (user.avatar) {
        el.style.background = 'transparent';
        el.innerHTML = `<img src="${Util.escapeAttr(user.avatar)}" alt="">`;
      } else {
        el.style.background = '';
        el.className = 'avatar ' + size + ' ' + Util.gradientFor(user.username || user.firstName || '?');
        el.textContent = Util.getInitials(user.firstName || user.username || user.name || '?');
        el.innerHTML = Util.escapeHtml(Util.getInitials(user.firstName || user.username || '?'));
      }
    },

    debounce(fn, ms) {
      let t;
      return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    },

    throttle(fn, ms) {
      let last = 0;
      return function(...args) {
        const now = Date.now();
        if (now - last >= ms) {
          last = now;
          fn.apply(this, args);
        }
      };
    },

    copyToClipboard(text) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(() => {
          this.fallbackCopy(text);
        });
      } else {
        this.fallbackCopy(text);
      }
    },

    fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    },

    hlsColor(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
      const h2 = Math.abs(h) % 360;
      return `hsl(${h2}, 65%, 55%)`;
    },

    haptic(kind) {
      if (!navigator.vibrate) return;
      if (kind === 'light') navigator.vibrate(10);
      else if (kind === 'medium') navigator.vibrate(20);
      else if (kind === 'heavy') navigator.vibrate(30);
    },

    getUserDisplayName(user) {
      if (!user) return '';
      const f = (user.firstName || '').trim();
      const l = (user.lastName || '').trim();
      if (f || l) return `${f} ${l}`.trim();
      return user.username || '';
    },

    pluralize(n, forms) {
      n = Math.abs(n) % 100;
      const n1 = n % 10;
      if (n > 10 && n < 20) return forms[2];
      if (n1 > 1 && n1 < 5) return forms[1];
      if (n1 === 1) return forms[0];
      return forms[2];
    }
  };

  QWAS.Util = Util;
})();
