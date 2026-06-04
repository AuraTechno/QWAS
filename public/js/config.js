(function() {
  'use strict';
  
  window.QWAS = window.QWAS || {};
  
  QWAS.Config = {
    VERSION: '1.0.0',
    FAVORITE_CHAT_ID: 'favorites',
    
    API: {
      REGISTER: '/register',
      LOGIN: '/login',
      AUTO_LOGIN: '/auto-login',
      LOGOUT: '/logout',
      USERS_ALL: '/profile/all',
      CHATS: '/chats',
      PROFILE: '/profile',
      PROFILE_UPDATE: '/profile/update'
    },
    
    STORAGE: {
      TOKEN: 'qwas_token',
      USER: 'qwas_user'
    },
    
    COLORS: [
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', 
      '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'
    ],
    
    NOTIFICATION_DURATION: 3000,
    TYPING_TIMEOUT: 1000,
    MESSAGES_PER_PAGE: 30
  };
  
  QWAS.State = {
    socket: null,
    me: '',
    current: '',
    userToken: '',
    currentUser: { avatar: '', username: '', avatarColor: '#6366f1' },
    chatList: [],
    allUsers: [],
    isMobile: window.innerWidth <= 768,
    typingTimeout: null,
    selectedMessage: null,
    editingMessageId: null,
    uploadedAvatar: null,
    hasMoreMessages: true,
    isLoadingMessages: false,
    currentPage: 1,
    unreadCount: 0
  };
})();