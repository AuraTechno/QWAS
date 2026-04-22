(function() {
  'use strict';
  
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };
  
  QWAS.Notifications = {
    show: function(message, type = 'info') {
      const container = document.getElementById('notificationContainer');
      if (!container) return;
      
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.innerHTML = `
        <span>${icons[type] || 'ℹ'}</span>
        <span>${QWAS.Utils.escapeHtml(message)}</span>
      `;
      
      container.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, QWAS.Config.NOTIFICATION_DURATION);
    },
    
    success: function(msg) { this.show(msg, 'success'); },
    error: function(msg) { this.show(msg, 'error'); },
    info: function(msg) { this.show(msg, 'info'); },
    warning: function(msg) { this.show(msg, 'warning'); }
  };
})();