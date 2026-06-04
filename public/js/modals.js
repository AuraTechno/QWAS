// Модальные окна: профиль, настройки, создание чата/группы, контакт, опрос и т.д.
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Modals = {
    init() {
      // Закрытие по клику на фон
      document.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal-overlay')) {
          this.close();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    },

    _build(title, content, actions = [{ label: 'Закрыть', type: 'secondary', onclick: 'QWAS.Modals.close()' }]) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title">${title}</div>
            <button class="modal-close" aria-label="Закрыть">✕</button>
          </div>
          <div class="modal-body">${content}</div>
          <div class="modal-actions">
            ${actions.map((a, i) => `<button class="btn ${a.type || 'primary'}" data-action="${i}">${QWAS.Util.escapeHtml(a.label)}</button>`).join('')}
          </div>
        </div>`;
      overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
      overlay.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = actions[parseInt(btn.dataset.action)];
          if (a && a.onclick) {
            if (typeof a.onclick === 'string') eval(a.onclick);
            else a.onclick();
          }
        });
      });
      return overlay;
    },

    show(overlay) {
      this.close();
      const container = document.getElementById('modalContainer');
      if (container) {
        container.appendChild(overlay);
      } else {
        document.body.appendChild(overlay);
      }
    },

    close() {
      const container = document.getElementById('modalContainer');
      if (container) container.innerHTML = '';
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    },

    // === Главное меню ===
    openMainMenu() {
      // вызывается из sidebar
    },

    // === Создание нового чата ===
    openNewChat() {
      const content = `
        <div class="newchat-tabs">
          <button class="newchat-tab active" data-type="user">Пользователь</button>
          <button class="newchat-tab" data-type="group">Группа</button>
          <button class="newchat-tab" data-type="channel">Канал</button>
        </div>
        <div class="newchat-pane" data-pane="user">
          <input class="input" id="ncUserSearch" placeholder="Поиск пользователя...">
          <div class="nc-results" id="ncUserResults"></div>
        </div>
        <div class="newchat-pane" data-pane="group" style="display:none">
          <input class="input" id="ncGroupTitle" placeholder="Название группы">
          <textarea class="input" id="ncGroupDesc" placeholder="Описание (необязательно)"></textarea>
          <input class="input" id="ncGroupMembers" placeholder="Участники (через запятую)">
          <label class="checkbox"><input type="checkbox" id="ncGroupPublic"> Публичная</label>
        </div>
        <div class="newchat-pane" data-pane="channel" style="display:none">
          <input class="input" id="ncChannelTitle" placeholder="Название канала">
          <input class="input" id="ncChannelUsername" placeholder="@username">
          <textarea class="input" id="ncChannelDesc" placeholder="Описание"></textarea>
        </div>
      `;
      const overlay = this._build('Новый чат', content, [
        { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' },
        { label: 'Создать', type: 'primary', onclick: 'QWAS.Modals._submitNewChat()' }
      ]);
      this.show(overlay);
      // tabs
      overlay.querySelectorAll('.newchat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const t = tab.dataset.type;
          overlay.querySelectorAll('.newchat-tab').forEach(x => x.classList.toggle('active', x === tab));
          overlay.querySelectorAll('.newchat-pane').forEach(p => {
            p.style.display = p.dataset.pane === t ? 'block' : 'none';
          });
        });
      });
      // user search
      const search = overlay.querySelector('#ncUserSearch');
      let timer;
      search.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => this._renderUserResults(overlay, e.target.value), 250);
      });
    },

    async _renderUserResults(overlay, q) {
      const box = overlay.querySelector('#ncUserResults');
      if (!q || !q.trim()) { box.innerHTML = '<div class="nc-hint">Введите имя пользователя</div>'; return; }
      const r = await QWAS.API.searchUsers(q);
      const users = (r && r.users) || [];
      if (!users.length) { box.innerHTML = '<div class="nc-hint">Не найдено</div>'; return; }
      box.innerHTML = users.map(u => `
        <div class="nc-user" data-username="${QWAS.Util.escapeAttr(u.username)}">
          ${QWAS.Util.avatarHtml(u, 36)}
          <div>
            <div>${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u))}</div>
            <div class="nc-user-sub">@${QWAS.Util.escapeHtml(u.username)}</div>
          </div>
        </div>
      `).join('');
      box.querySelectorAll('.nc-user').forEach(el => {
        el.addEventListener('click', () => this._startDM(el.dataset.username));
      });
    },

    async _startDM(username) {
      const r = await QWAS.API.openDM(username);
      if (r && r.ok && QWAS.Chat) {
        this.close();
        QWAS.Chat.open(r.chat.id);
        QWAS.Chats.reload();
      } else {
        QWAS.Toast.error((r && r.error) || 'Ошибка');
      }
    },

    async _submitNewChat() {
      const active = document.querySelector('.newchat-tab.active');
      if (!active) return;
      const t = active.dataset.type;
      if (t === 'user') {
        const username = (document.getElementById('ncUserResults')?.querySelector('.nc-user')?.dataset?.username) || '';
        if (!username) { QWAS.Toast.warn('Выберите пользователя'); return; }
        return this._startDM(username);
      }
      if (t === 'group' || t === 'channel') {
        const title = document.getElementById(t === 'group' ? 'ncGroupTitle' : 'ncChannelTitle')?.value.trim();
        if (!title) { QWAS.Toast.warn('Укажите название'); return; }
        const desc = document.getElementById(t === 'group' ? 'ncGroupDesc' : 'ncChannelDesc')?.value.trim();
        const usernames = (document.getElementById('ncGroupMembers')?.value || '').split(/[,\s]+/).filter(Boolean);
        const isPublic = !!document.getElementById('ncGroupPublic')?.checked;
        const data = {
          type: t, title, description: desc, members: usernames, isPublic
        };
        if (t === 'channel') {
          const un = document.getElementById('ncChannelUsername')?.value.trim().replace(/^@/, '');
          if (un) data.username = un;
        }
        const r = await QWAS.API.createGroup(data);
        if (r && r.ok) {
          QWAS.Toast.success('Создано');
          this.close();
          if (QWAS.Chat) QWAS.Chat.open(r.chat.id);
          QWAS.Chats.reload();
        } else {
          QWAS.Toast.error((r && r.error) || 'Ошибка');
        }
      }
    },

    // === Профиль ===
    async openProfile() {
      const me = QWAS.State.me;
      if (!me) return;
      const content = `
        <div class="profile-modal">
          <div class="profile-avatar-big">${QWAS.Util.avatarHtml(me, 96)}</div>
          <div class="profile-name">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(me))}</div>
          <div class="profile-username">@${QWAS.Util.escapeHtml(me.username)}</div>
          <div class="profile-field">
            <label>Имя</label>
            <input class="input" id="profileFirstName" value="${QWAS.Util.escapeAttr(me.firstName || '')}">
          </div>
          <div class="profile-field">
            <label>Фамилия</label>
            <input class="input" id="profileLastName" value="${QWAS.Util.escapeAttr(me.lastName || '')}">
          </div>
          <div class="profile-field">
            <label>О себе</label>
            <textarea class="input" id="profileBio">${QWAS.Util.escapeHtml(me.bio || '')}</textarea>
          </div>
        </div>
      `;
      const overlay = this._build('Мой профиль', content, [
        { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' },
        { label: 'Сохранить', type: 'primary', onclick: 'QWAS.Modals._saveProfile()' }
      ]);
      this.show(overlay);
    },

    async _saveProfile() {
      const patch = {
        firstName: document.getElementById('profileFirstName')?.value.trim(),
        lastName: document.getElementById('profileLastName')?.value.trim(),
        bio: document.getElementById('profileBio')?.value
      };
      const r = await QWAS.API.updateProfile(patch);
      if (r && r.ok) {
        QWAS.State.me = r.user;
        QWAS.Toast.success('Сохранено');
        this.close();
      } else {
        QWAS.Toast.error((r && r.error) || 'Ошибка');
      }
    },

    async openUserProfile(username) {
      const r = await QWAS.API.searchUsers(username);
      const u = (r && r.users || []).find(x => x.username === username);
      if (!u) { QWAS.Toast.error('Не найден'); return; }
      const content = `
        <div class="profile-modal">
          <div class="profile-avatar-big">${QWAS.Util.avatarHtml(u, 96)}</div>
          <div class="profile-name">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(u))}</div>
          <div class="profile-username">@${QWAS.Util.escapeHtml(u.username)}</div>
          ${u.bio ? `<div class="profile-bio">${QWAS.Util.escapeHtml(u.bio)}</div>` : ''}
        </div>
      `;
      const overlay = this._build('Профиль', content, [
        { label: 'Закрыть', type: 'secondary', onclick: 'QWAS.Modals.close()' },
        { label: 'Написать', type: 'primary', onclick: `QWAS.Modals._startDM('${QWAS.Util.escapeAttr(username)}')` }
      ]);
      this.show(overlay);
    },

    // === Настройки ===
    async openSettings() {
      const me = QWAS.State.me;
      const s = (me && me.settings) || QWAS.State.settings;
      const content = `
        <div class="settings">
          <div class="settings-section">
            <h3>Тема</h3>
            <div class="settings-row">
              <label>Тема</label>
              <select class="input" id="setTheme">
                <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Тёмная</option>
                <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Светлая</option>
                <option value="midnight" ${s.theme === 'midnight' ? 'selected' : ''}>Полночь</option>
                <option value="blue" ${s.theme === 'blue' ? 'selected' : ''}>Синяя</option>
              </select>
            </div>
            <div class="settings-row">
              <label>Акцентный цвет</label>
              <input type="color" id="setAccent" value="${s.accentColor || '#5e8ee7'}">
            </div>
          </div>
          <div class="settings-section">
            <h3>Сообщения</h3>
            <label class="settings-row">
              <span>Enter — отправка</span>
              <input type="checkbox" id="setEnter" ${s.enterToSend !== false ? 'checked' : ''}>
            </label>
            <label class="settings-row">
              <span>Звук уведомлений</span>
              <input type="checkbox" id="setSound" ${s.soundEnabled !== false ? 'checked' : ''}>
            </label>
            <label class="settings-row">
              <span>Уведомления в браузере</span>
              <input type="checkbox" id="setDesktop" ${s.desktopNotifications !== false ? 'checked' : ''}>
            </label>
          </div>
          <div class="settings-section">
            <h3>Медиа</h3>
            <div class="settings-row">
              <label>Качество голоса</label>
              <select class="input" id="setVoiceQ">
                <option value="ld" ${s.voiceQuality === 'ld' ? 'selected' : ''}>Низкое (32 kbps)</option>
                <option value="sd" ${s.voiceQuality === 'sd' ? 'selected' : ''}>Среднее (64 kbps)</option>
                <option value="hd" ${s.voiceQuality === 'hd' ? 'selected' : ''}>Высокое (128 kbps)</option>
              </select>
            </div>
            <div class="settings-row">
              <label>Качество видео</label>
              <select class="input" id="setVideoQ">
                <option value="ld" ${s.videoQuality === 'ld' ? 'selected' : ''}>240p</option>
                <option value="sd" ${s.videoQuality === 'sd' ? 'selected' : ''}>480p</option>
                <option value="hd" ${s.videoQuality === 'hd' ? 'selected' : ''}>720p</option>
                <option value="fhd" ${s.videoQuality === 'fhd' ? 'selected' : ''}>1080p</option>
              </select>
            </div>
            <div class="settings-row">
              <label>FPS видео</label>
              <select class="input" id="setFps">
                <option value="30" ${s.videoFps == 30 ? 'selected' : ''}>30</option>
                <option value="60" ${s.videoFps == 60 ? 'selected' : ''}>60</option>
              </select>
            </div>
          </div>
        </div>
      `;
      const overlay = this._build('Настройки', content, [
        { label: 'Закрыть', type: 'primary', onclick: 'QWAS.Modals.close()' }
      ]);
      this.show(overlay);

      // Авто-сохранение с дебаунсом
      let timer;
      const save = () => {
        clearTimeout(timer);
        timer = setTimeout(() => this._saveSettings(), 600);
      };
      overlay.querySelectorAll('input, select').forEach(el => el.addEventListener('change', save));
    },

    async _saveSettings() {
      const patch = {
        theme: document.getElementById('setTheme')?.value,
        accentColor: document.getElementById('setAccent')?.value,
        enterToSend: document.getElementById('setEnter')?.checked,
        soundEnabled: document.getElementById('setSound')?.checked,
        desktopNotifications: document.getElementById('setDesktop')?.checked,
        voiceQuality: document.getElementById('setVoiceQ')?.value,
        videoQuality: document.getElementById('setVideoQ')?.value,
        videoFps: parseInt(document.getElementById('setFps')?.value)
      };
      Object.assign(QWAS.State.settings, patch);
      QWAS.State.saveSettings();
      // Применим тему
      this._applyTheme();
      // Сохраним на сервере
      try {
        await QWAS.API.saveSettings(patch);
        if (QWAS.State.me) QWAS.State.me.settings = { ...QWAS.State.me.settings, ...patch };
      } catch (e) { /* ignore */ }
    },

    _applyTheme() {
      const t = QWAS.State.settings.theme || 'dark';
      document.documentElement.dataset.theme = t;
      const accent = QWAS.State.settings.accentColor || '#5e8ee7';
      document.documentElement.style.setProperty('--accent', accent);
    },

    // === Информация о чате ===
    async openChatInfo(chatId) {
      const r = await QWAS.API.chatInfo(chatId);
      if (!r || !r.ok) return;
      const c = r.chat;
      const members = r.members || [];
      const isGroup = c.type === 'group' || c.type === 'channel';
      const other = c.otherUser;
      const title = c.title || (other && QWAS.Util.getUserDisplayName(other));
      const content = `
        <div class="info-modal">
          <div class="info-avatar">${c.avatarUrl
            ? `<img src="${QWAS.Util.escapeAttr(c.avatarUrl)}" alt="">`
            : QWAS.Util.avatarHtml(other || { firstName: title, username: 'g' + c.id }, 96)}</div>
          <div class="info-name">${QWAS.Util.escapeHtml(title)}</div>
          ${other ? `<div class="info-sub">@${QWAS.Util.escapeHtml(other.username)}</div>` : ''}
          ${c.description ? `<div class="info-desc">${QWAS.Util.escapeHtml(c.description)}</div>` : ''}
          ${isGroup ? `
            <div class="info-section">
              <h4>Участники (${members.length})</h4>
              <div class="info-members">
                ${members.map(m => `
                  <div class="info-member">
                    ${QWAS.Util.avatarHtml(m, 36)}
                    <div>
                      <div>${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(m))}</div>
                      <div class="info-member-sub">@${QWAS.Util.escapeHtml(m.username)}${m.role !== 'member' ? ' · ' + (m.role === 'owner' ? 'владелец' : 'админ') : ''}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          <div class="info-actions">
            <button class="btn" data-info-action="pin">${c.isPinned ? 'Открепить' : 'Закрепить'}</button>
            <button class="btn" data-info-action="mute">${c.isMuted ? 'Вкл. звук' : 'Откл. звук'}</button>
            <button class="btn" data-info-action="archive">${c.isArchived ? 'Разархивировать' : 'В архив'}</button>
            <button class="btn" data-info-action="media">Медиа</button>
            <button class="btn danger" data-info-action="delete">Удалить чат</button>
          </div>
        </div>
      `;
      const overlay = this._build('Информация', content, [
        { label: 'Закрыть', type: 'secondary', onclick: 'QWAS.Modals.close()' }
      ]);
      this.show(overlay);
      overlay.querySelectorAll('[data-info-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = btn.dataset.infoAction;
          if (a === 'pin') QWAS.Chats.setPinned(chatId, !c.isPinned).then(() => this.close());
          else if (a === 'mute') QWAS.Chats.setMuted(chatId, !c.isMuted).then(() => this.close());
          else if (a === 'archive') QWAS.Chats.setArchived(chatId, !c.isArchived).then(() => this.close());
          else if (a === 'media') this.openMediaGallery(chatId);
          else if (a === 'delete') {
            if (confirm('Удалить чат?')) {
              QWAS.Toast.info('TODO: удаление');
              this.close();
            }
          }
        });
      });
    },

    async openMediaGallery(chatId) {
      const r = await QWAS.API.chatMedia(chatId, { limit: 100 });
      if (!r || !r.ok) return;
      const media = r.media || [];
      const images = media.filter(m => m.type === 'image').map(m => m.attachments?.[0]?.url).filter(Boolean);
      if (!images.length) { QWAS.Toast.info('Нет медиа'); return; }
      this.close();
      if (QWAS.Lightbox) QWAS.Lightbox.openGallery(images.map(src => ({ src })), 0);
    },

    // === Поиск в чате ===
    async openChatSearch() {
      if (!QWAS.State.current) return;
      const content = `
        <div class="chat-search">
          <input class="input" id="chatSearchQ" placeholder="Поиск в чате...">
          <div class="chat-search-results" id="chatSearchResults"></div>
        </div>
      `;
      const overlay = this._build('Поиск в чате', content, [
        { label: 'Закрыть', type: 'secondary', onclick: 'QWAS.Modals.close()' }
      ]);
      this.show(overlay);
      const input = overlay.querySelector('#chatSearchQ');
      let timer;
      input.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const q = e.target.value.trim();
          const r = await QWAS.API.searchInChat(QWAS.State.current, q);
          const results = (r && r.messages) || [];
          const box = overlay.querySelector('#chatSearchResults');
          if (!q) { box.innerHTML = ''; return; }
          if (!results.length) { box.innerHTML = '<div class="nc-hint">Не найдено</div>'; return; }
          box.innerHTML = results.map(m => `
            <div class="chat-search-item" data-msg-id="${m.id}">
              <div class="chat-search-text">${this._highlight(m.text || '', q)}</div>
              <div class="chat-search-meta">${QWAS.Util.formatFullTime(m.createdAt)}</div>
            </div>
          `).join('');
          box.querySelectorAll('.chat-search-item').forEach(el => {
            el.addEventListener('click', () => {
              this.close();
              QWAS.Messages.scrollToMessage(parseInt(el.dataset.msgId));
            });
          });
        }, 250);
      });
      input.focus();
    },

    _highlight(text, q) {
      const safe = QWAS.Util.escapeHtml(text);
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return safe.replace(re, '<mark>$1</mark>');
    },

    // === Контакт-пикер ===
    openContactPicker() {
      const content = `
        <div class="contact-picker">
          <input class="input" id="cpFirstName" placeholder="Имя">
          <input class="input" id="cpLastName" placeholder="Фамилия">
          <input class="input" id="cpPhone" placeholder="Телефон">
        </div>
      `;
      const overlay = this._build('Отправить контакт', content, [
        { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' },
        { label: 'Прикрепить', type: 'primary', onclick: 'QWAS.Modals._submitContact()' }
      ]);
      this.show(overlay);
    },

    _submitContact() {
      const firstName = document.getElementById('cpFirstName')?.value.trim();
      const lastName = document.getElementById('cpLastName')?.value.trim();
      const phone = document.getElementById('cpPhone')?.value.trim();
      if (!firstName) { QWAS.Toast.warn('Укажите имя'); return; }
      QWAS.State.pendingFiles.push({
        type: 'contact',
        name: `${firstName} ${lastName}`.trim(),
        contactData: { firstName, lastName, phone }
      });
      if (QWAS.Composer) {
        QWAS.Composer.renderAttachments();
        QWAS.Composer.updateSendButton();
      }
      this.close();
    },

    // === Создание опроса ===
    openCreatePoll() {
      const content = `
        <div class="poll-creator">
          <input class="input" id="pollQ" placeholder="Вопрос">
          <div id="pollOpts">
            <input class="input poll-opt" placeholder="Вариант 1">
            <input class="input poll-opt" placeholder="Вариант 2">
          </div>
          <button class="btn" id="pollAddOpt">+ вариант</button>
        </div>
      `;
      const overlay = this._build('Создать опрос', content, [
        { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' },
        { label: 'Прикрепить', type: 'primary', onclick: 'QWAS.Modals._submitPoll()' }
      ]);
      this.show(overlay);
      overlay.querySelector('#pollAddOpt').addEventListener('click', () => {
        const opts = overlay.querySelector('#pollOpts');
        const i = opts.querySelectorAll('.poll-opt').length + 1;
        const inp = document.createElement('input');
        inp.className = 'input poll-opt';
        inp.placeholder = `Вариант ${i}`;
        opts.appendChild(inp);
      });
    },

    _submitPoll() {
      const q = document.getElementById('pollQ')?.value.trim();
      const opts = Array.from(document.querySelectorAll('.poll-opt'))
        .map(i => i.value.trim())
        .filter(Boolean);
      if (!q || opts.length < 2) { QWAS.Toast.warn('Введите вопрос и минимум 2 варианта'); return; }
      QWAS.State.pendingFiles.push({
        type: 'poll',
        pollData: { question: q, options: opts.map(text => ({ text, votes: 0 })) }
      });
      if (QWAS.Composer) {
        QWAS.Composer.renderAttachments();
        QWAS.Composer.updateSendButton();
      }
      this.close();
    },

    // === Закреп сообщения ===
    openPinMessage(chatId, messageId) {
      QWAS.Toast.info('Закреп сообщений скоро будет доступен');
    },

    // === Пересылка ===
    openForward(msg) {
      // TODO: список чатов
      QWAS.Toast.info('Пересылка скоро будет доступна');
    }
  };

  window.QWAS.Modals = Modals;
})();
