// Уведомления
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Notifications = {
    list: [],

    init() {
      this._render();
    },

    setNotifications(list) {
      this.list = Array.isArray(list) ? list : [];
      this._render();
    },

    async reload() {
      const r = await QWAS.API.notifications();
      if (r && r.ok) {
        this.list = r.notifications;
        this._render();
      }
    },

    add(n) {
      this.list.unshift(n);
      this._render();
    },

    _render() {
      // Обновим бейдж в сайдбаре
      const unread = this.list.filter(n => !n.isRead).length;
      const el = document.getElementById('notificationsBadge');
      if (el) {
        el.textContent = unread > 99 ? '99+' : unread;
        el.style.display = unread > 0 ? 'flex' : 'none';
      }
      // Выпадающий список уведомлений
      const list = document.getElementById('notificationsList');
      if (list) {
        if (!this.list.length) {
          list.innerHTML = '<div class="notifications-empty">Нет уведомлений</div>';
        } else {
          list.innerHTML = this.list.slice(0, 20).map(n => this._renderItem(n)).join('');
          list.querySelectorAll('[data-notif-id]').forEach(el => {
            el.addEventListener('click', () => this._onClick(parseInt(el.dataset.notifId), el));
          });
        }
      }
    },

    _renderItem(n) {
      const from = n.fromUsername || 'Система';
      let icon = '🔔';
      let text = 'Уведомление';
      if (n.type === 'message') { icon = '💬'; text = `${from}: ${n.payload?.text || 'Сообщение'}`; }
      else if (n.type === 'mention') { icon = '📢'; text = `${from} упомянул вас`; }
      else if (n.type === 'reaction') { icon = '❤️'; text = `${from} отреагировал`; }
      else if (n.type === 'call') { icon = '📞'; text = `${from} звонит`; }
      else if (n.type === 'group_invite') { icon = '👥'; text = `${from} пригласил вас в группу`; }
      return `<div class="notification-item ${n.isRead ? '' : 'unread'}" data-notif-id="${n.id}">
        <div class="notification-icon">${icon}</div>
        <div class="notification-body">
          <div class="notification-text">${QWAS.Util.escapeHtml(text)}</div>
          <div class="notification-time">${QWAS.Util.timeAgo(n.createdAt)}</div>
        </div>
      </div>`;
    },

    async _onClick(id, el) {
      const n = this.list.find(x => x.id === id);
      if (!n) return;
      // Помечаем прочитанным
      if (!n.isRead) {
        n.isRead = true;
        el.classList.remove('unread');
        QWAS.API.markNotificationsRead([id]);
      }
      // Переходим к чату
      if (n.chatId && QWAS.Chat) QWAS.Chat.open(n.chatId);
    },

    async markAllRead() {
      await QWAS.API.markAllNotificationsRead();
      this.list.forEach(n => n.isRead = true);
      this._render();
    }
  };

  window.QWAS.Notifications = Notifications;
})();
