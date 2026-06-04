(function() {
  'use strict';

  QWAS.Groups = {
    myGroups: [],

    openCreateModal: function() {
      const modal = document.getElementById('createGroupModal');
      if (!modal) return;
      modal.classList.add('show');

      document.getElementById('groupNameInput').value = '';
      document.getElementById('groupDescInput').value = '';
      document.getElementById('groupTypeSelect').value = 'group';

      const list = document.getElementById('groupMemberSelect');
      if (!list) return;
      list.innerHTML = (QWAS.State.allUsers || []).map(u => `
        <label class="member-checkbox">
          <input type="checkbox" value="${u.username}">
          <div class="user-avatar small" id="gm-avatar-${u.username}" style="background:${u.avatarColor || '#6366f1'}">${QWAS.Utils.getAvatarLetter(u.username)}</div>
          <span>@${u.username}</span>
        </label>
      `).join('');
    },

    closeCreateModal: function() {
      const modal = document.getElementById('createGroupModal');
      if (modal) modal.classList.remove('show');
    },

    handleCreate: async function() {
      const name = document.getElementById('groupNameInput').value.trim();
      if (!name) {
        QWAS.Notifications.warning('Введите название группы');
        return;
      }

      const checkboxes = document.querySelectorAll('#groupMemberSelect input[type="checkbox"]:checked');
      const members = Array.from(checkboxes).map(cb => cb.value);

      if (members.length === 0) {
        QWAS.Notifications.warning('Добавьте участников');
        return;
      }

      const type = document.getElementById('groupTypeSelect').value;
      const description = document.getElementById('groupDescInput').value.trim();

      try {
        const res = await fetch('/groups/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${QWAS.State.userToken}`
          },
          body: JSON.stringify({ name, members, type, description })
        });
        const data = await res.json();

        if (data.ok) {
          QWAS.Notifications.success(type === 'channel' ? 'Канал создан!' : 'Группа создана!');
          this.closeCreateModal();
          if (QWAS.State.socket) {
            QWAS.State.socket.emit('profile_updated');
          }
        } else {
          QWAS.Notifications.error(data.error || 'Ошибка создания');
        }
      } catch (err) {
        console.error('Create group error:', err);
        QWAS.Notifications.error('Ошибка соединения');
      }
    },

    renderGroups: function() {
      const container = document.getElementById('groupsList');
      if (!container) return;

      if (!QWAS.Groups.myGroups || QWAS.Groups.myGroups.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        const title = document.getElementById('groupsSectionTitle');
        if (title) title.style.display = 'none';
        return;
      }

      container.style.display = 'block';
      const title = document.getElementById('groupsSectionTitle');
      if (title) title.style.display = 'block';

      container.innerHTML = QWAS.Groups.myGroups.map(g => {
        const selected = QWAS.State.current === `group:${g._id}` ? 'selected' : '';
        const typeIcon = g.type === 'channel' ? '📢' : '👥';
        const unreadBadge = g.unreadCount > 0 ? `<span class="unread-badge">${g.unreadCount}</span>` : '';
        return `
          <div class="user ${selected}" onclick="QWAS.Groups.select('${g._id}')">
            <div class="user-avatar small" id="group-avatar-${g._id}" style="background:${g.avatarColor}; font-size:14px;">${typeIcon}</div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:500;">${QWAS.Utils.escapeHtml(g.name)}</span>
                ${unreadBadge}
              </div>
              <div style="font-size:12px; color:var(--text-tertiary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${QWAS.Utils.escapeHtml(g.lastMessage || '')}
              </div>
            </div>
            <span style="font-size:11px; color:var(--text-tertiary); margin-left:4px;">${g.memberCount}</span>
          </div>
        `;
      }).join('');
    },

    select: function(groupId) {
      const chatId = `group:${groupId}`;

      if (QWAS.State.socket) {
        QWAS.State.socket.emit('reset_pagination');
      }

      QWAS.State.current = chatId;
      QWAS.State.hasMoreMessages = true;
      QWAS.State.isLoadingMessages = false;
      QWAS.State.currentPage = 1;
      QWAS.State.unreadCount = 0;

      QWAS.Chat.renderList();
      QWAS.Groups.renderGroups();
      QWAS.Messages.updateScrollButton();

      const group = (QWAS.Groups.myGroups || []).find(g => g._id === groupId) || {};

      const chatHeader = document.getElementById('chatHeader');
      if (chatHeader) chatHeader.style.display = 'flex';

      const avatarEl = document.getElementById('chatAvatar');
      if (avatarEl) {
        avatarEl.textContent = group.type === 'channel' ? '📢' : '👥';
        avatarEl.style.background = group.avatarColor || '#6366f1';
      }

      const chatUsername = document.getElementById('chatUsername');
      if (chatUsername) chatUsername.textContent = group.name || 'Группа';

      const chatStatus = document.getElementById('chatStatus');
      if (chatStatus) chatStatus.textContent = `${group.memberCount || 0} участников`;

      const msgInput = document.getElementById('msg');
      const sendBtn = document.getElementById('sendBtn');
      if (msgInput) msgInput.disabled = false;
      if (sendBtn) sendBtn.disabled = false;

      const messagesContainer = document.getElementById('messages');
      if (messagesContainer) messagesContainer.innerHTML = '';

      const typingIndicator = document.getElementById('typingIndicator');
      if (typingIndicator) typingIndicator.textContent = '';

      QWAS.Messages.hideScrollButton();

      if (QWAS.State.isMobile) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('hidden');
      }

      if (QWAS.State.socket) {
        QWAS.State.socket.emit('get_history', chatId, 1);
      }
    },

    showMembers: function() {
      const groupId = QWAS.State.current.replace('group:', '');
      const group = (QWAS.Groups.myGroups || []).find(g => g._id === groupId);
      if (!group) return;

      const list = document.getElementById('groupMembersList');
      if (!list) return;

      fetch(`/groups/${groupId}`, {
        headers: { 'Authorization': `Bearer ${QWAS.State.userToken}` }
      })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return;
        const g = data.group;
        list.innerHTML = (g.members || []).map(m => {
          const roleLabel = m.role === 'creator' ? ' 👑' : m.role === 'admin' ? ' ⭐' : '';
          return `<div class="member-item">@${m.username}${roleLabel}</div>`;
        }).join('');
        document.getElementById('groupMembersModal').classList.add('show');
      })
      .catch(() => {});
    },

    closeMembersModal: function() {
      document.getElementById('groupMembersModal').classList.remove('show');
    },

    leaveGroup: async function() {
      if (!confirm('Выйти из группы?')) return;
      const groupId = QWAS.State.current.replace('group:', '');

      try {
        const res = await fetch('/groups/leave', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${QWAS.State.userToken}`
          },
          body: JSON.stringify({ groupId })
        });
        const data = await res.json();
        if (data.ok) {
          QWAS.Notifications.success('Вы вышли из группы');
          QWAS.State.current = '';
          if (QWAS.State.socket) {
            QWAS.State.socket.emit('profile_updated');
          }
          const chatHeader = document.getElementById('chatHeader');
          if (chatHeader) chatHeader.style.display = 'none';
          const messagesContainer = document.getElementById('messages');
          if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><h3>QWAS Messenger</h3><p>Выберите чат</p></div>';
          }
        } else {
          QWAS.Notifications.error(data.error || 'Ошибка');
        }
      } catch (err) {
        console.error('Leave group error:', err);
      }
    }
  };

  window.openGroupCreate = () => QWAS.Groups.openCreateModal();
  window.closeGroupCreate = () => QWAS.Groups.closeCreateModal();
  window.createGroup = () => QWAS.Groups.handleCreate();
  window.showGroupMembers = () => QWAS.Groups.showMembers();
  window.closeGroupMembers = () => QWAS.Groups.closeMembersModal();
  window.leaveGroup = () => QWAS.Groups.leaveGroup();
})();
