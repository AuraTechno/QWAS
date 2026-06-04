(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Groups = {
    openCreate() {
      this.showCreateModal();
    },

    showCreateModal() {
      const users = QWAS.State.allUsers || [];
      const content = `
        <div class="field">
          <label>Название</label>
          <input type="text" id="createGroupName" placeholder="Название группы" maxlength="100">
        </div>
        <div class="field">
          <label>Тип</label>
          <select id="createGroupType" onchange="QWAS.Groups.toggleType()">
            <option value="group">Группа</option>
            <option value="channel">Канал</option>
          </select>
        </div>
        <div class="field">
          <label>Описание (необязательно)</label>
          <textarea id="createGroupDesc" placeholder="Описание" maxlength="500"></textarea>
        </div>
        <div class="field" id="membersField">
          <label>Участники</label>
          <div id="createGroupMembers" style="max-height:300px;overflow-y:auto;border:1px solid var(--border-light);border-radius:8px;padding:4px;">
            ${users.map(u => `
              <label class="checkbox-row">
                <div class="checkbox-box" onclick="QWAS.Groups.toggleCheckbox(this, '${QWAS.Util.escapeAttr(u.username)}')"></div>
                <div class="avatar checkbox-avatar ${QWAS.Util.gradientFor(u.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(u.firstName || u.username))}</div>
                <div class="checkbox-info">
                  <div class="checkbox-name">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u) || u.username)}</div>
                  <div class="checkbox-username">@${QWAS.Util.escapeHtml(u.username)}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>
      `;

      QWAS.Modals.open({
        title: 'Создать группу',
        content,
        actions: [
          { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' },
          { label: 'Создать', type: 'primary', onclick: 'QWAS.Groups.create()' }
        ]
      });
    },

    toggleType() {
      const t = document.getElementById('createGroupType').value;
      const f = document.getElementById('membersField');
      if (f) f.style.display = t === 'channel' ? 'none' : 'block';
    },

    toggleCheckbox(box, username) {
      box.classList.toggle('checked');
    },

    async create() {
      const name = document.getElementById('createGroupName').value.trim();
      const type = document.getElementById('createGroupType').value;
      const description = document.getElementById('createGroupDesc').value.trim();

      if (!name) {
        QWAS.Toast.warning('Введите название');
        return;
      }

      let members = [];
      if (type !== 'channel') {
        const boxes = document.querySelectorAll('#createGroupMembers .checkbox-box.checked');
        members = Array.from(boxes).map((b, i) => {
          return QWAS.State.allUsers[i]?.username;
        }).filter(Boolean);
        if (members.length === 0) {
          QWAS.Toast.warning('Выберите участников');
          return;
        }
      }

      const r = await QWAS.API.post('/groups/create', { name, type, description, members });
      if (r.ok) {
        QWAS.Toast.success(type === 'channel' ? 'Канал создан' : 'Группа создана');
        QWAS.Modals.close();
        QWAS.App.loadGroups();
        if (QWAS.State.socket) QWAS.State.socket.emit('profile_updated');
      } else {
        QWAS.Toast.error(r.error || 'Ошибка создания');
      }
    },

    showInfo(groupId) {
      QWAS.API.get('/groups/' + groupId).then(r => {
        if (!r.ok) return;
        const g = r.group;
        QWAS.Messages.groupMembers = g.members;

        const content = `
          <div style="text-align:center;padding:20px 0;">
            <div class="avatar size-96 ${QWAS.Util.gradientFor(g.name)}" style="margin:0 auto 12px;">${g.type === 'channel' ? '📢' : '👥'}</div>
            <h2 style="margin:0 0 4px;">${QWAS.Util.escapeHtml(g.name)}</h2>
            <p style="color:var(--text-secondary);margin:0;">${g.members.length} ${QWAS.Util.pluralize(g.members.length, ['участник', 'участника', 'участников'])}</p>
            ${g.description ? `<p style="margin:12px 0;color:var(--text-secondary);">${QWAS.Util.escapeHtml(g.description)}</p>` : ''}
          </div>

          <div class="profile-section">
            <div class="profile-section-title">Участники (${g.members.length})</div>
            ${g.members.map(m => `
              <div class="member-item" onclick="QWAS.Modals.openUserProfile('${QWAS.Util.escapeAttr(m.username)}')">
                <div class="avatar size-40 ${QWAS.Util.gradientFor(m.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(m.firstName || m.username))}</div>
                <div class="member-info">
                  <div class="member-name">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(m) || m.username)}</div>
                  <div class="member-status">${m.online ? 'в сети' : (m.lastSeen ? QWAS.Util.lastSeenText(m.lastSeen, false) : '')}</div>
                </div>
                ${m.role !== 'member' ? `<span class="member-role ${m.role}">${m.role === 'creator' ? '👑 Создатель' : '⭐ Админ'}</span>` : ''}
              </div>
            `).join('')}
          </div>

          <div style="margin-top:16px;display:flex;gap:8px;">
            <button class="btn-secondary" style="flex:1;" onclick="QWAS.Groups.addMember('${g._id}')">＋ Добавить</button>
            <button class="btn-danger" style="flex:1;" onclick="QWAS.Groups.leave('${g._id}')">Покинуть</button>
          </div>
        `;

        QWAS.Modals.open({
          title: 'Информация о группе',
          content,
          actions: [
            { label: 'Закрыть', type: 'secondary', onclick: 'QWAS.Modals.close()' }
          ]
        });
      });
    },

    async addMember(groupId) {
      const username = prompt('Имя пользователя:');
      if (!username) return;
      const r = await QWAS.API.post('/groups/add', { groupId, username: QWAS.Util.cleanUsername(username) });
      if (r.ok) {
        QWAS.Toast.success('Участник добавлен');
        QWAS.Modals.close();
        this.showInfo(groupId);
      } else {
        QWAS.Toast.error(r.error || 'Ошибка');
      }
    },

    async leave(groupId) {
      if (!confirm('Покинуть группу?')) return;
      const r = await QWAS.API.post('/groups/leave', { groupId });
      if (r.ok) {
        QWAS.Toast.success('Вы покинули группу');
        QWAS.Modals.close();
        QWAS.Chats.removeChat('group:' + groupId);
        if (QWAS.State.current === 'group:' + groupId) QWAS.Chat.close();
        if (QWAS.State.socket) QWAS.State.socket.emit('profile_updated');
      } else {
        QWAS.Toast.error(r.error || 'Ошибка');
      }
    }
  };

  QWAS.Groups = Groups;
})();
