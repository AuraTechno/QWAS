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
      showLastSeen: true,

      fontSize: 'medium',
      compactMode: false,
      bubbleStyle: 'modern',
      animationsEnabled: true,

      videoQuality: 'sd',
      videoFps: 30,
      voiceQuality: 'medium',
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,

      autoDownload: {
        photo: true,
        video: true,
        voice: true,
        file: true,
        onWifiOnly: false,
        maxSize: 10
      },

      readReceipts: true,
      typingIndicators: true,
      onlineStatus: true,
      keepOnline: false,

      autoplayVideos: true,
      autoplayGifs: true,
      loopAnimatedStickers: true,

      messageTextSize: 14,
      bubbleCorners: 'rounded'
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
        localStorage.setItem('qwas_settings', JSON.stringify(QWAS.State.settings));
      } catch {}
    },

    load() {
      try {
        const theme = localStorage.getItem(QWAS.STORAGE.THEME);
        if (theme) QWAS.State.settings.theme = theme;
        const accent = localStorage.getItem(QWAS.STORAGE.ACCENT);
        if (accent) QWAS.State.settings.accent = accent;
        const stored = localStorage.getItem('qwas_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          Object.assign(QWAS.State.settings, parsed);
        }
      } catch {}
    },

    applyTheme() {
      document.documentElement.setAttribute('data-theme', QWAS.State.settings.theme);
      document.documentElement.style.setProperty('--accent', QWAS.State.settings.accent);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        const colors = { dark: '#17212b', light: '#ffffff', midnight: '#000000', blue: '#1e88e5' };
        meta.setAttribute('content', colors[QWAS.State.settings.theme] || colors.dark);
      }
      const root = document.documentElement;
      const s = QWAS.State.settings;
      root.style.setProperty('--bubble-radius', s.bubbleCorners === 'square' ? '4px' : s.bubbleCorners === 'round' ? '20px' : '12px');
      root.style.setProperty('--message-text-size', (s.messageTextSize || 14) + 'px');
      root.style.setProperty('--font-size-base', s.fontSize === 'small' ? '13px' : s.fontSize === 'large' ? '15px' : '14px');
      root.setAttribute('data-compact', s.compactMode ? 'true' : 'false');
      root.setAttribute('data-bubbles', s.bubbleStyle || 'modern');
      root.setAttribute('data-animations', s.animationsEnabled === false ? 'off' : 'on');
      if (s.chatBackground) {
        document.body.style.setProperty('--chat-bg-image', `url("${s.chatBackground}")`);
      } else {
        document.body.style.removeProperty('--chat-bg-image');
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
