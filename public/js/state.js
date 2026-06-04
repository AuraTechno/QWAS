// Глобальное состояние приложения
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const State = {
    me: null,
    token: null,
    socket: null,
    online: new Set(),

    // Текущий открытый чат
    current: null,
    currentChatInfo: null,

    // Кэш сообщений по chatId
    messagesByChat: new Map(),
    hasMoreByChat: new Map(),

    pendingFiles: [],
    editingId: null,
    replyingTo: null,
    recording: false,
    loadingMore: false,

    // Настройки
    settings: {
      theme: 'dark',
      accentColor: '#5e8ee7',
      enterToSend: true,
      voiceQuality: 'sd',
      videoQuality: 'sd',
      videoFps: 30,
      notifications: true,
      soundEnabled: true,
      desktopNotifications: true
    },

    isReady: false,
    onReadyCbs: [],

    onReady(cb) {
      if (this.isReady) cb();
      else this.onReadyCbs.push(cb);
    },

    triggerReady() {
      this.isReady = true;
      this.onReadyCbs.forEach(cb => { try { cb(); } catch (e) { console.error('onReady cb error', e); } });
      this.onReadyCbs = [];
    },

    setMe(user, token) {
      this.me = user;
      this.token = token;
      try {
        if (user) localStorage.setItem('qwas_token', token);
      } catch {}
    },

    getToken() {
      if (this.token) return this.token;
      try {
        const t = localStorage.getItem('qwas_token');
        if (t) this.token = t;
        return t;
      } catch { return null; }
    },

    logout() {
      this.me = null;
      this.token = null;
      try { localStorage.removeItem('qwas_token'); } catch {}
      if (this.socket) { try { this.socket.disconnect(); } catch {} this.socket = null; }
    },

    clearCurrent() {
      this.current = null;
      this.currentChatInfo = null;
      this.editingId = null;
      this.replyingTo = null;
      this.pendingFiles = [];
    }
  };

  // Загрузим настройки из localStorage
  try {
    const s = localStorage.getItem('qwas_settings');
    if (s) Object.assign(State.settings, JSON.parse(s));
  } catch {}

  State.saveSettings = function() {
    try { localStorage.setItem('qwas_settings', JSON.stringify(State.settings)); } catch {}
  };

  window.QWAS.State = State;
})();
