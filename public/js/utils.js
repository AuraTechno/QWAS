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
      if (!date) return '';
      try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return '';
      }
    },
    
    validateUsername: function(username) {
      return /^[a-zA-Z0-9_]+$/.test(username);
    },
    
    cleanUsername: function(username) {
      return username.replace(/^@/, '');
    },
    
    truncate: function(text, maxLength) {
      if (!text) return '';
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '...';
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
    },

    formatSize: function(bytes) {
      if (!bytes) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    }
  };
  
  window.addEventListener('resize', QWAS.Utils.updateMobileState);
})();