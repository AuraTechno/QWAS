(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  QWAS.STORAGE = {
    TOKEN: 'qwas_token',
    USER: 'qwas_user',
    THEME: 'qwas_theme',
    ACCENT: 'qwas_accent',
    FOLDERS: 'qwas_folders',
    DRAFTS: 'qwas_drafts'
  };

  QWAS.Config = {
    VERSION: '2.0.0',
    FAVORITE_CHAT_ID: 'favorites',
    SAVED_MESSAGES_ID: 'favorites',
    MESSAGES_PER_PAGE: 30,
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    TYPING_TIMEOUT: 1500,
    NOTIFICATION_TIMEOUT: 3500
  };

  QWAS.State = {
    me: '',
    currentUser: null,
    userToken: '',

    socket: null,
    online: new Map(),

    chats: [],
    archived: [],
    pinned: [],
    muted: {},
    contacts: [],
    blocked: [],
    folders: [],
    myGroups: [],
    stories: {},
    activeFolder: null,
    currentTab: 'all',

    current: '',
    currentChat: null,
    currentPage: 1,
    hasMore: true,
    loadingMore: false,
    selectedMessages: new Set(),
    isSelectionMode: false,
    unreadCount: 0,

    messagesByChat: new Map(),
    pinnedMessage: null,
    typingUsers: new Map(),
    onlineUsers: new Map(),

    replyTo: null,
    editingId: null,
    pendingFiles: [],

    recording: false,
    recordStartTime: 0,
    recordChunks: [],
    recordStream: null,
    mediaRecorder: null,

    settings: {
      theme: 'dark',
      accent: '#5e8ee7',
      chatBackground: '',
      notifications: true,
      soundEnabled: true,
      enterToSend: true,
      showLastSeen: true
    },

    isMobile: false,
    isOnline: navigator.onLine,

    pagination: {
      currentChat: null,
      page: 1,
      hasMore: true,
      isLoading: false
    }
  };

  QWAS.Prefs = {
    save() {
      try {
        localStorage.setItem(QWAS.STORAGE.THEME, QWAS.State.settings.theme);
        localStorage.setItem(QWAS.STORAGE.ACCENT, QWAS.State.settings.accent);
      } catch {}
    },

    load() {
      try {
        const theme = localStorage.getItem(QWAS.STORAGE.THEME);
        if (theme) QWAS.State.settings.theme = theme;
        const accent = localStorage.getItem(QWAS.STORAGE.ACCENT);
        if (accent) QWAS.State.settings.accent = accent;
      } catch {}
    },

    applyTheme() {
      document.documentElement.setAttribute('data-theme', QWAS.State.settings.theme);
      document.documentElement.style.setProperty('--accent', QWAS.State.settings.accent);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        const colors = { dark: '#17212b', light: '#ffffff', midnight: '#000000' };
        meta.setAttribute('content', colors[QWAS.State.settings.theme] || colors.dark);
      }
    }
  };

  QWAS.UI = QWAS.UI || {
    toggleMainMenu() {
      const retry = () => QWAS.UI && QWAS.Modals && QWAS.Modals.toggleMainMenu();
      if (QWAS.Modals) QWAS.Modals.toggleMainMenu();
      else setTimeout(retry, 50);
    },
    openNewChat() {
      if (QWAS.Modals) QWAS.Modals.openNewChat();
    }
  };

  window.addEventListener('error', (e) => {
    if (e.error) console.error('[QWAS]', e.error.message, '@', e.filename + ':' + e.lineno);
  });
})();
