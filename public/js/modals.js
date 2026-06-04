(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Modals = {
    current: null,
    onClose: null,

    open({ title, content, actions, large, onClose }) {
      this.close();
      this.onClose = onClose;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'modalOverlay';
      overlay.onclick = (e) => { if (e.target === overlay) this.close(); };

      const modal = document.createElement('div');
      modal.className = 'modal' + (large ? ' profile-modal-content' : '');
      modal.id = 'modalContent';

      modal.innerHTML = `
        <div class="modal-header">
          <div class="modal-title">${QWAS.Util.escapeHtml(title || '')}</div>
          <button class="icon-btn" onclick="QWAS.Modals.close()">✕</button>
        </div>
        <div class="modal-body">${content}</div>
        ${actions && actions.length ? `
          <div class="modal-footer">
            ${actions.map(a => `<button class="${a.type === 'primary' ? 'btn-primary' : a.type === 'danger' ? 'btn-danger' : 'btn-secondary'}" onclick="${a.onclick}">${QWAS.Util.escapeHtml(a.label)}</button>`).join('')}
          </div>
        ` : ''}
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      this.current = overlay;

      setTimeout(() => {
        const firstInput = modal.querySelector('input, textarea, select');
        if (firstInput) firstInput.focus();
      }, 100);
    },

    close() {
      const o = document.getElementById('modalOverlay');
      if (o) {
        o.classList.add('closing');
        setTimeout(() => o.remove(), 200);
      }
      this.current = null;
      if (this.onClose) {
        const fn = this.onClose;
        this.onClose = null;
        try { fn(); } catch {}
      }
    },

    openNewChat() {
      const users = QWAS.State.allUsers || [];
      const content = `
        <div class="tab-bar">
          <button class="tab-item active" data-tab="users" onclick="QWAS.Modals.switchNewChatTab('users')">Пользователи</button>
          <button class="tab-item" data-tab="contacts" onclick="QWAS.Modals.switchNewChatTab('contacts')">Контакты</button>
          <button class="tab-item" data-tab="group" onclick="QWAS.Modals.switchNewChatTab('group')">Группа</button>
        </div>
        <div id="newChatContent">
          <div class="field">
            <input type="text" id="newChatSearch" placeholder="Поиск пользователей" oninput="QWAS.Modals.searchNewChat(this.value)">
          </div>
          <div id="newChatList" style="max-height:50vh;overflow-y:auto;">
            ${users.map(u => this.renderNewChatItem(u)).join('')}
          </div>
        </div>
      `;
      QWAS.Modals.open({
        title: 'Новый чат',
        content,
        actions: [
          { label: 'Создать группу', type: 'secondary', onclick: 'QWAS.Modals.close();QWAS.Groups.openCreate()' }
        ]
      });
    },

    switchNewChatTab(tab) {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      if (tab === 'group') {
        QWAS.Modals.close();
        QWAS.Groups.openCreate();
      } else if (tab === 'contacts') {
        const list = QWAS.State.contacts || [];
        const html = list.length
          ? list.map(u => this.renderNewChatItem(u)).join('')
          : '<div class="empty-list"><div class="empty-list-icon">👤</div><div class="empty-list-text">Нет контактов</div></div>';
        document.getElementById('newChatList').innerHTML = html;
      } else {
        const html = (QWAS.State.allUsers || []).map(u => this.renderNewChatItem(u)).join('');
        document.getElementById('newChatList').innerHTML = html;
      }
    },

    searchNewChat(q) {
      q = (q || '').toLowerCase();
      const users = QWAS.State.allUsers || [];
      const filtered = users.filter(u =>
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName || '').toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
      );
      document.getElementById('newChatList').innerHTML = filtered.length
        ? filtered.map(u => this.renderNewChatItem(u)).join('')
        : '<div class="empty-list"><div class="empty-list-text">Не найдено</div></div>';
    },

    renderNewChatItem(u) {
      return `<div class="list-row" onclick="QWAS.Modals.openUserProfile('${QWAS.Util.escapeAttr(u.username)}')">
        <div class="avatar size-44 ${QWAS.Util.gradientFor(u.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(u.firstName || u.username))}</div>
        <div class="list-row-content">
          <div class="list-row-title">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u) || u.username)}</div>
          <div class="list-row-subtitle">@${QWAS.Util.escapeHtml(u.username)} ${u.online ? '· в сети' : ''}</div>
        </div>
        <button class="btn-primary" style="padding:6px 12px;font-size:13px;" onclick="event.stopPropagation();QWAS.Modals.startChat('${QWAS.Util.escapeAttr(u.username)}')">Написать</button>
      </div>`;
    },

    startChat(username) {
      this.close();
      if (!QWAS.State.chats.find(c => c.username === username)) {
        const user = (QWAS.State.allUsers || []).find(u => u.username === username);
        if (user) {
          QWAS.State.chats.unshift({ ...user, type: 'dm', lastMessage: '', lastMessageTime: new Date(), unreadCount: 0 });
          QWAS.Chats.render();
        }
      }
      QWAS.Chat.open(username);
    },

    openUserProfile(username) {
      QWAS.API.get('/profile/' + username).then(r => {
        if (!r.ok) {
          QWAS.Toast.error(r.error || 'Ошибка');
          return;
        }
        const u = r.user;
        const content = `
          <div class="profile-header">
            <div class="profile-avatar-wrap">
              <div class="avatar size-120 ${QWAS.Util.gradientFor(u.username)}">
                ${QWAS.Util.escapeHtml(QWAS.Util.getInitials(QWAS.Util.getUserDisplayName(u) || u.username))}
              </div>
            </div>
            <div class="profile-name">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u) || u.username)}</div>
            <div class="profile-username">@${QWAS.Util.escapeHtml(u.username)}</div>
            ${u.online ? '<div style="color:var(--green);font-size:13px;margin-top:4px;">в сети</div>' :
              (u.lastSeen ? `<div style="color:var(--text-tertiary);font-size:13px;margin-top:4px;">${QWAS.Util.lastSeenText(u.lastSeen, false)}</div>` : '')}
            ${u.bio ? `<div class="profile-bio">${QWAS.Util.escapeHtml(u.bio)}</div>` : ''}
          </div>

          <div class="profile-section">
            <div class="profile-section-title">Действия</div>
            <div class="profile-list-item" onclick="QWAS.Modals.close();QWAS.Modals.startChat('${QWAS.Util.escapeAttr(u.username)}')">
              <div class="profile-list-item-icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2"/></svg></div>
              <div class="profile-list-item-content">
                <div class="profile-list-item-title">Написать сообщение</div>
              </div>
            </div>
            <div class="profile-list-item" onclick="QWAS.Modals.toggleContact('${QWAS.Util.escapeAttr(u.username)}', this)">
              <div class="profile-list-item-icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15 14c-2.67 0-8 1.33-8 4v2h16v-2c0-2.67-5.33-4-8-4m-9-4a4 4 0 1 0 4-4 4 4 0 0 0-4 4"/></svg></div>
              <div class="profile-list-item-content">
                <div class="profile-list-item-title" id="contactActionLabel">${this.isContact(u.username) ? 'Удалить из контактов' : 'Добавить в контакты'}</div>
              </div>
            </div>
            <div class="profile-list-item" onclick="QWAS.Modals.toggleBlock('${QWAS.Util.escapeAttr(u.username)}', this)">
              <div class="profile-list-item-icon" style="background:rgba(255,107,107,0.15);color:var(--red);"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2M4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A8 8 0 0 1 4 12m8 8a8 8 0 0 1-5.7-2.3L18.3 5.7A8 8 0 0 1 12 20"/></svg></div>
              <div class="profile-list-item-content">
                <div class="profile-list-item-title" id="blockActionLabel">${this.isBlocked(u.username) ? 'Разблокировать' : 'Заблокировать'}</div>
              </div>
            </div>
          </div>
        `;
        QWAS.Modals.open({
          title: 'Профиль',
          content,
          actions: [
            { label: 'Закрыть', type: 'secondary', onclick: 'QWAS.Modals.close()' }
          ]
        });
      });
    },

    isContact(username) {
      return (QWAS.State.contacts || []).some(c => c.username === username);
    },

    isBlocked(username) {
      return (QWAS.State.blocked || []).some(c => c.username === username);
    },

    async toggleContact(username, el) {
      const isAdding = !this.isContact(username);
      const r = await QWAS.API.post(isAdding ? '/profile/contact/add' : '/profile/contact/remove', { username });
      if (r.ok) {
        if (isAdding) {
          if (!this.isContact(username)) {
            const u = (QWAS.State.allUsers || []).find(x => x.username === username);
            if (u) QWAS.State.contacts.push(u);
          }
        } else {
          QWAS.State.contacts = QWAS.State.contacts.filter(c => c.username !== username);
        }
        const label = document.getElementById('contactActionLabel');
        if (label) label.textContent = isAdding ? 'Удалить из контактов' : 'Добавить в контакты';
        QWAS.Toast.success(isAdding ? 'Добавлено в контакты' : 'Удалено из контактов');
      }
    },

    async toggleBlock(username, el) {
      const isAdding = !this.isBlocked(username);
      const r = await QWAS.API.post(isAdding ? '/profile/block' : '/profile/unblock', { username });
      if (r.ok) {
        if (isAdding) {
          const u = (QWAS.State.allUsers || []).find(x => x.username === username);
          if (u) QWAS.State.blocked.push(u);
        } else {
          QWAS.State.blocked = QWAS.State.blocked.filter(c => c.username !== username);
        }
        const label = document.getElementById('blockActionLabel');
        if (label) label.textContent = isAdding ? 'Разблокировать' : 'Заблокировать';
        QWAS.Toast.success(isAdding ? 'Заблокирован' : 'Разблокирован');
      }
    },

    openChatInfo(username, info) {
      if (username.startsWith('group:')) {
        return QWAS.Groups.showInfo(username.slice(6));
      }
      this.openUserProfile(username);
    },

    openSavedMessagesInfo() {
      QWAS.Modals.open({
        title: 'Избранное',
        content: `
          <div style="padding:20px;text-align:center;">
            <div class="avatar size-96 avatar-gradient-4" style="margin:0 auto 12px;font-size:36px;">⭐</div>
            <h3>Избранные сообщения</h3>
            <p style="color:var(--text-secondary);">Здесь хранятся ваши личные заметки, файлы и важные сообщения.</p>
          </div>
        `,
        actions: [
          { label: 'Закрыть', type: 'secondary', onclick: 'QWAS.Modals.close()' }
        ]
      });
    },

    openForward(msgs) {
      const chats = [
        { username: QWAS.Config.FAVORITE_CHAT_ID },
        ...(QWAS.State.chats || []).filter(c => c.username !== QWAS.State.current)
      ];
      const content = `
        <div class="field">
          <input type="text" id="forwardSearch" placeholder="Поиск чатов" oninput="QWAS.Modals.searchForward(this.value)">
        </div>
        <div id="forwardList" style="max-height:50vh;overflow-y:auto;">
          ${chats.map(c => `
            <div class="list-row" onclick="QWAS.Modals.confirmForward('${QWAS.Util.escapeAttr(c.username)}', ${msgs.length})">
              ${c.type === 'group'
                ? `<div class="avatar size-44 ${QWAS.Util.gradientFor(c.name)}">${c.groupType === 'channel' ? '📢' : '👥'}</div>`
                : `<div class="avatar size-44 ${QWAS.Util.gradientFor(c.username)}">${c.username === QWAS.Config.FAVORITE_CHAT_ID ? '⭐' : QWAS.Util.escapeHtml(QWAS.Util.getInitials(c.firstName || c.username))}</div>`}
              <div class="list-row-content">
                <div class="list-row-title">${c.username === QWAS.Config.FAVORITE_CHAT_ID ? 'Избранное' : QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(c) || c.name || c.username)}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <input type="hidden" id="forwardMsgs" value='${QWAS.Util.escapeAttr(JSON.stringify(msgs.map(m => ({ message: m.message, attachments: m.attachments }))))}'>
      `;
      QWAS.Modals.open({
        title: `Переслать (${msgs.length})`,
        content,
        actions: [
          { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' }
        ]
      });
    },

    searchForward(q) {
      q = (q || '').toLowerCase();
      const chats = [
        { username: QWAS.Config.FAVORITE_CHAT_ID },
        ...(QWAS.State.chats || []).filter(c => c.username !== QWAS.State.current)
      ];
      const filtered = chats.filter(c => {
        const name = c.name || c.firstName || c.username || '';
        return name.toLowerCase().includes(q);
      });
      document.getElementById('forwardList').innerHTML = filtered.map(c => `
        <div class="list-row" onclick="QWAS.Modals.confirmForward('${QWAS.Util.escapeAttr(c.username)}', ${document.getElementById('forwardMsgs').value ? 'JSON.parse(document.getElementById("forwardMsgs").value).length' : 0})">
          ${c.type === 'group'
            ? `<div class="avatar size-44 ${QWAS.Util.gradientFor(c.name)}">${c.groupType === 'channel' ? '📢' : '👥'}</div>`
            : `<div class="avatar size-44 ${QWAS.Util.gradientFor(c.username)}">${c.username === QWAS.Config.FAVORITE_CHAT_ID ? '⭐' : QWAS.Util.escapeHtml(QWAS.Util.getInitials(c.firstName || c.username))}</div>`}
          <div class="list-row-content">
            <div class="list-row-title">${c.username === QWAS.Config.FAVORITE_CHAT_ID ? 'Избранное' : QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(c) || c.name || c.username)}</div>
          </div>
        </div>
      `).join('');
    },

    async confirmForward(to, count) {
      try {
        const msgsData = JSON.parse(document.getElementById('forwardMsgs').value || '[]');
        for (const m of msgsData) {
          await new Promise(res => {
            QWAS.State.socket.emit('send_message', {
              to,
              message: m.message || '',
              attachments: m.attachments || [],
              isForwarded: true,
              forwardedFrom: QWAS.State.me
            }, res);
          });
        }
        QWAS.Toast.success(`Переслано в ${count > 1 ? count + ' сообщениях' : '1 сообщении'}`);
        QWAS.Modals.close();
      } catch (err) {
        QWAS.Toast.error('Ошибка пересылки');
      }
    },

    openEmojiPicker(emojis, onSelect) {
      const content = `
        <input type="text" id="emojiPickerSearch" placeholder="Поиск эмодзи" oninput="QWAS.Modals.searchEmoji(this.value)" style="width:100%;background:var(--bg-input);border:1.5px solid transparent;border-radius:8px;padding:10px 14px;color:var(--text-primary);outline:none;margin-bottom:12px;font-size:14px;">
        <div id="emojiPickerGrid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-height:50vh;overflow-y:auto;">
          ${emojis.map(e => `<button class="emoji-item" onclick="QWAS.Modals.selectEmoji('${e}')">${e}</button>`).join('')}
        </div>
      `;
      this._emojiCallback = onSelect;
      this._emojiList = emojis;
      QWAS.Modals.open({
        title: 'Реакция',
        content,
        actions: [
          { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' }
        ]
      });
    },

    searchEmoji(q) {
      if (!q) {
        document.getElementById('emojiPickerGrid').innerHTML = this._emojiList.map(e => `<button class="emoji-item" onclick="QWAS.Modals.selectEmoji('${e}')">${e}</button>`).join('');
        return;
      }
      const lower = q.toLowerCase();
      const filtered = this._emojiList.filter(e => e.includes(lower));
      document.getElementById('emojiPickerGrid').innerHTML = filtered.length
        ? filtered.map(e => `<button class="emoji-item" onclick="QWAS.Modals.selectEmoji('${e}')">${e}</button>`).join('')
        : '<div class="empty-list">Не найдено</div>';
    },

    selectEmoji(emoji) {
      if (this._emojiCallback) this._emojiCallback(emoji);
      this.close();
    },

    openCreatePoll() {
      const content = `
        <div class="field">
          <label>Вопрос</label>
          <input type="text" id="pollQuestion" placeholder="Задайте вопрос" maxlength="200">
        </div>
        <div class="field">
          <label>Варианты</label>
          <div id="pollOptions">
            <input type="text" class="poll-option-input" placeholder="Вариант 1" style="width:100%;background:var(--bg-input);border:1.5px solid transparent;border-radius:8px;padding:10px 14px;color:var(--text-primary);outline:none;margin-bottom:8px;">
            <input type="text" class="poll-option-input" placeholder="Вариант 2" style="width:100%;background:var(--bg-input);border:1.5px solid transparent;border-radius:8px;padding:10px 14px;color:var(--text-primary);outline:none;margin-bottom:8px;">
          </div>
          <button class="btn-secondary" onclick="QWAS.Modals.addPollOption()">+ Вариант</button>
        </div>
      `;
      QWAS.Modals.open({
        title: 'Создать опрос',
        content,
        actions: [
          { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' },
          { label: 'Создать', type: 'primary', onclick: 'QWAS.Modals.createPoll()' }
        ]
      });
    },

    addPollOption() {
      const c = document.getElementById('pollOptions');
      if (!c) return;
      const inputs = c.querySelectorAll('input');
      if (inputs.length >= 10) {
        QWAS.Toast.warning('Максимум 10 вариантов');
        return;
      }
      const i = document.createElement('input');
      i.type = 'text';
      i.className = 'poll-option-input';
      i.placeholder = 'Вариант ' + (inputs.length + 1);
      i.style.cssText = 'width:100%;background:var(--bg-input);border:1.5px solid transparent;border-radius:8px;padding:10px 14px;color:var(--text-primary);outline:none;margin-bottom:8px;';
      c.appendChild(i);
    },

    createPoll() {
      const question = document.getElementById('pollQuestion').value.trim();
      const options = Array.from(document.querySelectorAll('.poll-option-input'))
        .map(i => i.value.trim()).filter(Boolean);
      if (!question || options.length < 2) {
        QWAS.Toast.warning('Введите вопрос и минимум 2 варианта');
        return;
      }
      const message = `/poll ${question}\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
      QWAS.State.socket.emit('send_message', {
        to: QWAS.State.current,
        message
      });
      this.close();
    },

    openContactPicker() {
      const content = `
        <div class="field">
          <input type="text" id="contactPickerSearch" placeholder="Поиск" oninput="QWAS.Modals.searchContact(this.value)">
        </div>
        <div id="contactPickerList" style="max-height:50vh;overflow-y:auto;">
          ${(QWAS.State.allUsers || []).map(u => `
            <div class="list-row" onclick="QWAS.Modals.sendContact('${QWAS.Util.escapeAttr(u.username)}')">
              <div class="avatar size-44 ${QWAS.Util.gradientFor(u.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(u.firstName || u.username))}</div>
              <div class="list-row-content">
                <div class="list-row-title">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u) || u.username)}</div>
                <div class="list-row-subtitle">@${QWAS.Util.escapeHtml(u.username)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      QWAS.Modals.open({
        title: 'Отправить контакт',
        content
      });
    },

    searchContact(q) {
      q = (q || '').toLowerCase();
      const filtered = (QWAS.State.allUsers || []).filter(u =>
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName || '').toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
      );
      const list = document.getElementById('contactPickerList');
      if (list) {
        list.innerHTML = filtered.map(u => `
          <div class="list-row" onclick="QWAS.Modals.sendContact('${QWAS.Util.escapeAttr(u.username)}')">
            <div class="avatar size-44 ${QWAS.Util.gradientFor(u.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(u.firstName || u.username))}</div>
            <div class="list-row-content">
              <div class="list-row-title">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u) || u.username)}</div>
              <div class="list-row-subtitle">@${QWAS.Util.escapeHtml(u.username)}</div>
            </div>
          </div>
        `).join('');
      }
    },

    sendContact(username) {
      const user = (QWAS.State.allUsers || []).find(u => u.username === username);
      if (!user) return;
      const message = `/contact ${user.username}|${user.firstName || ''}|${user.lastName || ''}`;
      QWAS.State.socket.emit('send_message', {
        to: QWAS.State.current,
        message
      });
      this.close();
    },

    openCreateFolder() {
      const content = `
        <div class="field">
          <label>Название папки</label>
          <input type="text" id="folderName" placeholder="Например, Работа" maxlength="32">
        </div>
        <div class="field">
          <label>Цвет</label>
          <div class="theme-grid" id="folderColors">
            <div class="theme-swatch active" style="background:#5e8ee7;" data-color="#5e8ee7"></div>
            <div class="theme-swatch" style="background:#b78eff;" data-color="#b78eff"></div>
            <div class="theme-swatch" style="background:#ff7eb6;" data-color="#ff7eb6"></div>
            <div class="theme-swatch" style="background:#4dd599;" data-color="#4dd599"></div>
            <div class="theme-swatch" style="background:#ffd54f;" data-color="#ffd54f"></div>
            <div class="theme-swatch" style="background:#5fc7d7;" data-color="#5fc7d7"></div>
            <div class="theme-swatch" style="background:#ff6b6b;" data-color="#ff6b6b"></div>
            <div class="theme-swatch" style="background:#6ab2f2;" data-color="#6ab2f2"></div>
          </div>
        </div>
      `;
      QWAS.Modals.open({
        title: 'Создать папку',
        content,
        actions: [
          { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' },
          { label: 'Создать', type: 'primary', onclick: 'QWAS.Modals.createFolder()' }
        ]
      });
      document.querySelectorAll('#folderColors .theme-swatch').forEach(s => {
        s.onclick = () => {
          document.querySelectorAll('#folderColors .theme-swatch').forEach(x => x.classList.remove('active'));
          s.classList.add('active');
        };
      });
    },

    async createFolder() {
      const title = document.getElementById('folderName').value.trim();
      const color = document.querySelector('#folderColors .theme-swatch.active')?.dataset.color || '#5e8ee7';
      if (!title) {
        QWAS.Toast.warning('Введите название');
        return;
      }
      const r = await QWAS.API.post('/folders', { title, color });
      if (r.ok) {
        QWAS.State.folders.push(r.folder);
        QWAS.Chats.renderFolders();
        QWAS.Toast.success('Папка создана');
        QWAS.Modals.close();
      } else {
        QWAS.Toast.error(r.error || 'Ошибка');
      }
    },

    openSettings() {
      const user = QWAS.State.currentUser || {};
      const s = QWAS.State.settings;
      const content = `
        <div class="profile-section">
          <div class="profile-section-title">Тема</div>
          <div class="theme-grid" id="settingsThemes">
            <div class="theme-swatch ${s.theme === 'dark' ? 'active' : ''}" style="background:linear-gradient(135deg, #17212b, #0e1621);" data-theme="dark">Тёмная</div>
            <div class="theme-swatch ${s.theme === 'light' ? 'active' : ''}" style="background:linear-gradient(135deg, #f4f4f5, #e6e6e6);color:#000;" data-theme="light">Светлая</div>
            <div class="theme-swatch ${s.theme === 'midnight' ? 'active' : ''}" style="background:linear-gradient(135deg, #000000, #1a1a1a);" data-theme="midnight">Ночь</div>
            <div class="theme-swatch" style="background:linear-gradient(135deg, #5e8ee7, #2a7ae0);" data-theme="blue">Blue</div>
          </div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Цвет акцента</div>
          <div class="accent-grid" id="settingsAccents">
            ${['#5e8ee7', '#3390ec', '#6ab2f2', '#b78eff', '#ff7eb6', '#4dd599', '#ffd54f', '#5fc7d7', '#ff6b6b', '#ff9f43', '#a78bfa', '#14b8a6'].map(c => `
              <div class="accent-swatch ${s.accent === c ? 'active' : ''}" style="background:${c};" data-color="${c}"></div>
            `).join('')}
          </div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Уведомления</div>
          <div class="setting-row" onclick="QWAS.Modals.toggleSetting('notifications', this)">
            <div class="setting-row-info">
              <div class="setting-row-title">Push-уведомления</div>
              <div class="setting-row-subtitle">Уведомлять о новых сообщениях</div>
            </div>
            <label class="switch"><input type="checkbox" ${s.notifications ? 'checked' : ''}><span class="switch-slider"></span></label>
          </div>
          <div class="setting-row" onclick="QWAS.Modals.toggleSetting('soundEnabled', this)">
            <div class="setting-row-info">
              <div class="setting-row-title">Звук</div>
              <div class="setting-row-subtitle">Воспроизводить звуки уведомлений</div>
            </div>
            <label class="switch"><input type="checkbox" ${s.soundEnabled ? 'checked' : ''}><span class="switch-slider"></span></label>
          </div>
          <div class="setting-row" onclick="QWAS.Modals.toggleSetting('enterToSend', this)">
            <div class="setting-row-info">
              <div class="setting-row-title">Отправка по Enter</div>
              <div class="setting-row-subtitle">Enter отправляет сообщение, Shift+Enter — перенос</div>
            </div>
            <label class="switch"><input type="checkbox" ${s.enterToSend ? 'checked' : ''}><span class="switch-slider"></span></label>
          </div>
          <div class="setting-row" onclick="QWAS.Modals.toggleSetting('showLastSeen', this)">
            <div class="setting-row-info">
              <div class="setting-row-title">Показывать время захода</div>
              <div class="setting-row-subtitle">Другие пользователи видят ваш онлайн</div>
            </div>
            <label class="switch"><input type="checkbox" ${s.showLastSeen ? 'checked' : ''}><span class="switch-slider"></span></label>
          </div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">Мой аккаунт</div>
          <div class="profile-list-item" onclick="QWAS.Modals.close();QWAS.Profile.open()">
            <div class="profile-list-item-icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"/></svg></div>
            <div class="profile-list-item-content">
              <div class="profile-list-item-title">Редактировать профиль</div>
              <div class="profile-list-item-subtitle">@${QWAS.Util.escapeHtml(user.username || '')}</div>
            </div>
          </div>
          <div class="profile-list-item" onclick="QWAS.Modals.confirmLogout()">
            <div class="profile-list-item-icon" style="background:rgba(255,107,107,0.15);color:var(--red);"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 17v-3H9v-4h7V7l5 5-5 5M14 2a2 2 0 0 1 2 2v2h-2V4H5v16h9v-2h2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg></div>
            <div class="profile-list-item-content">
              <div class="profile-list-item-title" style="color:var(--red);">Выйти</div>
            </div>
          </div>
        </div>
      `;
      QWAS.Modals.open({
        title: 'Настройки',
        content,
        actions: [
          { label: 'Готово', type: 'primary', onclick: 'QWAS.Modals.saveSettings();QWAS.Modals.close()' }
        ]
      });
      document.querySelectorAll('#settingsThemes .theme-swatch').forEach(s => {
        s.onclick = () => {
          document.querySelectorAll('#settingsThemes .theme-swatch').forEach(x => x.classList.remove('active'));
          s.classList.add('active');
          QWAS.State.settings.theme = s.dataset.theme;
          QWAS.Prefs.applyTheme();
        };
      });
      document.querySelectorAll('#settingsAccents .accent-swatch').forEach(s => {
        s.onclick = () => {
          document.querySelectorAll('#settingsAccents .accent-swatch').forEach(x => x.classList.remove('active'));
          s.classList.add('active');
          QWAS.State.settings.accent = s.dataset.color;
          document.documentElement.style.setProperty('--accent', s.dataset.color);
        };
      });
    },

    toggleSetting(key, row) {
      const cb = row.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      QWAS.State.settings[key] = cb.checked;
    },

    async saveSettings() {
      const s = QWAS.State.settings;
      QWAS.Prefs.save();
      await QWAS.API.post('/profile/settings', s);
      QWAS.Toast.success('Настройки сохранены');
    },

    confirmLogout() {
      if (confirm('Выйти из аккаунта?')) {
        QWAS.Auth.logout();
      }
    },

    toggleMainMenu() {
      const existing = document.querySelector('.main-menu');
      if (existing) { existing.remove(); return; }
      const u = QWAS.State.currentUser || {};
      const menu = document.createElement('div');
      menu.className = 'main-menu';
      menu.innerHTML = `
        <div class="main-menu-header">
          <div class="avatar size-44 ${QWAS.Util.gradientFor(u.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(QWAS.Util.getUserDisplayName(u) || u.username))}</div>
          <div class="main-menu-user">
            <div class="main-menu-user-name">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u) || u.username)}</div>
            <div class="main-menu-user-phone">@${QWAS.Util.escapeHtml(u.username)}</div>
          </div>
        </div>
        <div class="main-menu-item" onclick="QWAS.Modals.close();QWAS.Profile.open()">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"/></svg>
          <span>Мой профиль</span>
        </div>
        <div class="main-menu-item" onclick="QWAS.Modals.close();QWAS.Groups.openCreate()">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 5.5A3.5 3.5 0 0 1 15.5 9 3.5 3.5 0 0 1 12 12.5 3.5 3.5 0 0 1 8.5 9 3.5 3.5 0 0 1 12 5.5M5 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6m14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6M5 17.5c2.5 0 5 1.5 5 3.5v1H0v-1c0-2 2.5-3.5 5-3.5m14 0c2.5 0 5 1.5 5 3.5v1h-10v-1c0-2 2.5-3.5 5-3.5m-7-2a5 5 0 0 1 5 5v1H7v-1a5 5 0 0 1 5-5"/></svg>
          <span>Создать группу</span>
        </div>
        <div class="main-menu-item" onclick="QWAS.Modals.close();QWAS.Modals.openContacts()">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20 0H4v2h16zM4 24h16v-2H4zm5-3h6v-1.5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2zm3-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/></svg>
          <span>Контакты</span>
        </div>
        <div class="main-menu-item" onclick="QWAS.Modals.close();QWAS.Modals.openSettings()">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 14 2h-4a.488.488 0 0 0-.49.42l-.38 2.65c-.63.25-1.17.59-1.69.98l-2.49-1a.566.566 0 0 0-.18-.03c-.17 0-.34.09-.43.25l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.4 1.06.73 1.69.98l.38 2.65c.05.24.26.42.5.42h4c.25 0 .45-.18.49-.42l.38-2.65c.63-.25 1.17-.59 1.69-.98l2.49 1c.06.02.12.03.18.03.17 0 .34-.09.43-.25l2-3.46a.5.5 0 0 0-.12-.64z"/></svg>
          <span>Настройки</span>
        </div>
        <div class="main-menu-item" onclick="QWAS.Modals.close();QWAS.Modals.toggleNightMode()">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2"/></svg>
          <span>${QWAS.State.settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
        </div>
      `;
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.appendChild(menu);
        setTimeout(() => {
          document.addEventListener('click', function handler(e) {
            if (!e.target.closest('.main-menu') && !e.target.closest('.sidebar-menu')) {
              const m = document.querySelector('.main-menu');
              if (m) m.remove();
              document.removeEventListener('click', handler);
            }
          });
        }, 50);
      }
    },

    openContacts() {
      const content = `
        <div class="field">
          <input type="text" id="contactsSearch" placeholder="Поиск" oninput="QWAS.Modals.searchContacts(this.value)">
        </div>
        <div id="contactsList" style="max-height:50vh;overflow-y:auto;">
          ${(QWAS.State.contacts || []).map(u => `
            <div class="list-row" onclick="QWAS.Modals.close();QWAS.Modals.openUserProfile('${QWAS.Util.escapeAttr(u.username)}')">
              <div class="avatar size-44 ${QWAS.Util.gradientFor(u.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(u.firstName || u.username))}</div>
              <div class="list-row-content">
                <div class="list-row-title">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u) || u.username)}</div>
                <div class="list-row-subtitle">@${QWAS.Util.escapeHtml(u.username)}</div>
              </div>
            </div>
          `).join('') || '<div class="empty-list"><div class="empty-list-icon">👤</div><div class="empty-list-text">Нет контактов</div></div>'}
        </div>
      `;
      QWAS.Modals.open({
        title: 'Контакты',
        content
      });
    },

    searchContacts(q) {
      q = (q || '').toLowerCase();
      const filtered = (QWAS.State.contacts || []).filter(u =>
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName || '').toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
      );
      document.getElementById('contactsList').innerHTML = filtered.length
        ? filtered.map(u => `
            <div class="list-row" onclick="QWAS.Modals.close();QWAS.Modals.openUserProfile('${QWAS.Util.escapeAttr(u.username)}')">
              <div class="avatar size-44 ${QWAS.Util.gradientFor(u.username)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(u.firstName || u.username))}</div>
              <div class="list-row-content">
                <div class="list-row-title">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u) || u.username)}</div>
                <div class="list-row-subtitle">@${QWAS.Util.escapeHtml(u.username)}</div>
              </div>
            </div>
          `).join('')
        : '<div class="empty-list"><div class="empty-list-text">Не найдено</div></div>';
    },

    toggleNightMode() {
      QWAS.State.settings.theme = QWAS.State.settings.theme === 'dark' ? 'light' : 'dark';
      QWAS.Prefs.applyTheme();
      QWAS.Prefs.save();
      QWAS.API.post('/profile/settings', { theme: QWAS.State.settings.theme });
    }
  };

  QWAS.UI = QWAS.UI || {};
  QWAS.UI.toggleMainMenu = function() { QWAS.Modals.toggleMainMenu(); };
  QWAS.UI.openNewChat = function() { QWAS.Modals.openNewChat(); };

  QWAS.Modals = Modals;
})();
