(function() {
  'use strict';
  
  QWAS.Utils = {
    escapeHtml: function(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    getAvatarLetter: function(username) {
      return username ? username.charAt(0).toUpperCase() : '?';
    },
    
    formatTime: function(date) {
      return new Date(date).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    },
    
    validateUsername: function(username) {
      return /^[a-zA-Z0-9_]+$/.test(username);
    },
    
    cleanUsername: function(username) {
      return username.replace(/^@/, '');
    },
    
    renderAvatar: function(element, user) {
      if (!element || !user) return;
      
      element.innerHTML = '';
      
      if (user.avatar) {
        const img = document.createElement('img');
        img.src = user.avatar;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.style.objectFit = 'cover';
        element.appendChild(img);
        element.style.background = 'transparent';
      } else {
        element.style.background = user.avatarColor || '#6366f1';
        element.textContent = QWAS.Utils.getAvatarLetter(user.username);
      }
    },
    
    updateMobileState: function() {
      QWAS.State.isMobile = window.innerWidth <= 768;
    }
  };
  
  window.addEventListener('resize', QWAS.Utils.updateMobileState);
})();