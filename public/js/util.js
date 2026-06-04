// Утилиты: форматирование, DOM-хелперы, throttle/debounce
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function getInitials(first, last) {
    const f = (first || '').trim()[0] || '';
    const l = (last || '').trim()[0] || '';
    return (f + l).toUpperCase() || '?';
  }

  function getUserDisplayName(u) {
    if (!u) return '';
    if (u.firstName && u.lastName) return `${u.firstName} ${u.lastName}`;
    if (u.firstName) return u.firstName;
    if (u.username) return '@' + u.username;
    return 'Без имени';
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatTime(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toTimeString().slice(0, 5);
    }
    const diff = (now - date) / 1000;
    if (diff < 7 * 86400) {
      const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      return days[date.getDay()];
    }
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

  function formatFullTime(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' ГБ';
  }

  function timeAgo(d) {
    if (!d) return '';
    const sec = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
    if (sec < 60) return 'только что';
    if (sec < 3600) return Math.floor(sec / 60) + ' мин назад';
    if (sec < 86400) return Math.floor(sec / 3600) + ' ч назад';
    if (sec < 7 * 86400) return Math.floor(sec / 86400) + ' дн назад';
    return new Date(d).toLocaleDateString('ru-RU');
  }

  function throttle(fn, ms) {
    let last = 0;
    let timer = null;
    return function(...args) {
      const now = Date.now();
      const remain = ms - (now - last);
      if (remain <= 0) {
        if (timer) { clearTimeout(timer); timer = null; }
        last = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn.apply(this, args);
        }, remain);
      }
    };
  }

  function debounce(fn, ms) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function avatarColor(seed) {
    const colors = [
      '#e17076', '#7bc862', '#ee7aae', '#faa774', '#6ec9cb',
      '#65aadd', '#a695e7', '#ee7aae', '#1686e1', '#b5839b'
    ];
    let s = 0;
    for (let i = 0; i < (seed || '').length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    return colors[s % colors.length];
  }

  function avatarHtml(u, size = 40) {
    if (!u) return `<div class="avatar" style="width:${size}px;height:${size}px;background:#888"></div>`;
    if (u.avatarUrl) {
      return `<div class="avatar" style="width:${size}px;height:${size}px"><img src="${escapeAttr(u.avatarUrl)}" alt=""></div>`;
    }
    const initials = getInitials(u.firstName, u.lastName);
    const color = avatarColor(u.username || u.firstName);
    return `<div class="avatar avatar-letters" style="width:${size}px;height:${size}px;background:${color}">${escapeHtml(initials)}</div>`;
  }

  window.QWAS.Util = {
    escapeHtml, escapeAttr, getInitials, getUserDisplayName,
    formatDuration, formatTime, formatFullTime, formatBytes, timeAgo,
    throttle, debounce, $, $$, onReady, avatarColor, avatarHtml
  };
})();
