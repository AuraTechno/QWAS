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
      const typeMap = { primary: 'btn-primary', secondary: 'btn-secondary', danger: 'btn-danger', ghost: 'btn-ghost' };
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">${title}</div>
            <button class="modal-close" aria-label="Закрыть">✕</button>
          </div>
          <div class="modal-body">${content}</div>
          <div class="modal-footer">
            ${actions.map((a, i) => `<button class="${typeMap[a.type] || 'btn-primary'}" data-action="${i}">${QWAS.Util.escapeHtml(a.label)}</button>`).join('')}
          </div>
        </div>`;
      const modalEl = overlay.querySelector('.modal');
      modalEl.addEventListener('click', (e) => e.stopPropagation());
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
          <div class="settings-tabs">
            <button class="settings-tab active" data-tab="appearance">${QWAS.Util.icon('sun', { size: 18 })}<span>Внешний вид</span></button>
            <button class="settings-tab" data-tab="chat">${QWAS.Util.icon('messageCircle', { size: 18 })}<span>Чаты</span></button>
            <button class="settings-tab" data-tab="media">${QWAS.Util.icon('video', { size: 18 })}<span>Медиа</span></button>
            <button class="settings-tab" data-tab="notifications">${QWAS.Util.icon('bell', { size: 18 })}<span>Уведомления</span></button>
            <button class="settings-tab" data-tab="privacy">${QWAS.Util.icon('shield', { size: 18 })}<span>Приватность</span></button>
            <button class="settings-tab" data-tab="devices">${QWAS.Util.icon('smartphone', { size: 18 })}<span>Устройства</span></button>
            <button class="settings-tab" data-tab="account">${QWAS.Util.icon('user', { size: 18 })}<span>Аккаунт</span></button>
          </div>

          <div class="settings-pane active" data-pane="appearance">
            <div class="settings-section">
              <h3>Тема оформления</h3>
              <div class="settings-row">
                <label>Тема</label>
                <select class="input" id="setTheme">
                  <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Тёмная</option>
                  <option value="midnight" ${s.theme === 'midnight' ? 'selected' : ''}>Полночь</option>
                  <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Светлая</option>
                </select>
              </div>
              <div class="settings-row">
                <label>Акцентный цвет</label>
                <div class="color-picker">
                  <input type="color" id="setAccent" value="${s.accentColor || '#5e8ee7'}">
                  <div class="color-presets">
                    ${['#5e8ee7','#34c759','#ff9500','#ff3b30','#af52de','#ff2d92','#1ebea5','#ffb800'].map(c => `<button type="button" class="color-preset" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
                  </div>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <h3>Размер шрифта</h3>
              <div class="font-size-grid">
                <label class="font-size-opt ${s.fontSize === 'small' ? 'active' : ''}" data-fs="small">
                  <span class="fs-sample fs-s">Aa</span>
                  <span>Маленький</span>
                </label>
                <label class="font-size-opt ${(!s.fontSize || s.fontSize === 'medium') ? 'active' : ''}" data-fs="medium">
                  <span class="fs-sample fs-m">Aa</span>
                  <span>Средний</span>
                </label>
                <label class="font-size-opt ${s.fontSize === 'large' ? 'active' : ''}" data-fs="large">
                  <span class="fs-sample fs-l">Aa</span>
                  <span>Большой</span>
                </label>
                <label class="font-size-opt ${s.fontSize === 'xlarge' ? 'active' : ''}" data-fs="xlarge">
                  <span class="fs-sample fs-xl">Aa</span>
                  <span>Огромный</span>
                </label>
              </div>
            </div>
            <div class="settings-section">
              <h3>Обои чата</h3>
              <div class="wallpaper-grid">
                ${[
                  { id: 'none', name: 'Без обоев', color: 'transparent' },
                  { id: 'gradient1', name: 'Закат', color: 'linear-gradient(135deg,#ff6b6b,#ffa500)' },
                  { id: 'gradient2', name: 'Океан', color: 'linear-gradient(135deg,#667eea,#764ba2)' },
                  { id: 'gradient3', name: 'Лес', color: 'linear-gradient(135deg,#134e5e,#71b280)' },
                  { id: 'gradient4', name: 'Космос', color: 'linear-gradient(135deg,#0f0c29,#302b63)' },
                  { id: 'gradient5', name: 'Розовый', color: 'linear-gradient(135deg,#f093fb,#f5576c)' },
                  { id: 'gradient6', name: 'Лёд', color: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
                  { id: 'custom', name: 'Свои', color: '...' }
                ].map(w => `<button type="button" class="wallpaper-opt ${(s.wallpaper || 'gradient1') === w.id ? 'active' : ''}" data-wp="${w.id}" style="background:${w.color}" title="${w.name}"></button>`).join('')}
              </div>
              <label class="settings-row" style="margin-top:12px;">
                <span>Своя картинка</span>
                <input type="file" accept="image/*" id="setWallpaperFile" style="display:none">
                <button type="button" class="btn btn-ghost" id="setWallpaperBtn">${QWAS.Util.icon('upload', { size: 16 })}<span>Загрузить</span></button>
              </label>
            </div>
          </div>

          <div class="settings-pane" data-pane="chat">
            <div class="settings-section">
              <h3>Поведение</h3>
              <label class="settings-row">
                <span>Enter — отправка</span>
                <input type="checkbox" id="setEnter" ${s.enterToSend !== false ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Показывать превью ссылок</span>
                <input type="checkbox" id="setLinkPreview" ${s.linkPreview !== false ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Анимации в чате</span>
                <input type="checkbox" id="setAnimations" ${s.animations !== false ? 'checked' : ''}>
              </label>
            </div>
            <div class="settings-section">
              <h3>Язык</h3>
              <div class="settings-row">
                <label>Язык интерфейса</label>
                <select class="input" id="setLang">
                  <option value="ru" ${s.language === 'ru' ? 'selected' : ''}>Русский</option>
                  <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
                  <option value="uk" ${s.language === 'uk' ? 'selected' : ''}>Українська</option>
                  <option value="de" ${s.language === 'de' ? 'selected' : ''}>Deutsch</option>
                </select>
              </div>
            </div>
          </div>

          <div class="settings-pane" data-pane="media">
            <div class="settings-section">
              <h3>Качество</h3>
              <div class="settings-row">
                <label>Голосовые</label>
                <select class="input" id="setVoiceQ">
                  <option value="ld" ${s.voiceQuality === 'ld' ? 'selected' : ''}>Низкое (32 kbps)</option>
                  <option value="sd" ${s.voiceQuality === 'sd' ? 'selected' : ''}>Среднее (64 kbps)</option>
                  <option value="hd" ${s.voiceQuality === 'hd' ? 'selected' : ''}>Высокое (128 kbps)</option>
                </select>
              </div>
              <div class="settings-row">
                <label>Видео</label>
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
            <div class="settings-section">
              <h3>Автозагрузка</h3>
              <label class="settings-row">
                <span>Фото</span>
                <input type="checkbox" id="setAutoPhoto" ${s.autoDownload?.photo !== false ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Видео</span>
                <input type="checkbox" id="setAutoVideo" ${s.autoDownload?.video !== false ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Файлы</span>
                <input type="checkbox" id="setAutoFile" ${s.autoDownload?.file === true ? 'checked' : ''}>
              </label>
            </div>
          </div>

          <div class="settings-pane" data-pane="notifications">
            <div class="settings-section">
              <h3>Уведомления</h3>
              <label class="settings-row">
                <span>Звук</span>
                <input type="checkbox" id="setSound" ${s.soundEnabled !== false ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Браузерные</span>
                <input type="checkbox" id="setDesktop" ${s.desktopNotifications !== false ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Вибрация</span>
                <input type="checkbox" id="setVibrate" ${s.vibrate !== false ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Превью текста</span>
                <input type="checkbox" id="setNotifPreview" ${s.notificationPreview !== false ? 'checked' : ''}>
              </label>
            </div>
          </div>

          <div class="settings-pane" data-pane="privacy">
            <div class="settings-section">
              <h3>Безопасность</h3>
              <label class="settings-row">
                <span>PIN-код при входе</span>
                <input type="checkbox" id="setPinEnabled" ${s.pinEnabled === true ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Двухфакторная аутентификация</span>
                <input type="checkbox" id="set2FA" ${s.twoFactorEnabled === true ? 'checked' : ''}>
              </label>
              <label class="settings-row">
                <span>Автоблокировка</span>
                <select class="input" id="setAutoLock">
                  <option value="0" ${s.autoLock === 0 ? 'selected' : ''}>Выкл</option>
                  <option value="60" ${s.autoLock == 60 ? 'selected' : ''}>1 мин</option>
                  <option value="300" ${s.autoLock == 300 ? 'selected' : ''}>5 мин</option>
                  <option value="1800" ${s.autoLock == 1800 ? 'selected' : ''}>30 мин</option>
                  <option value="3600" ${s.autoLock == 3600 ? 'selected' : ''}>1 час</option>
                </select>
              </label>
            </div>
            <div class="settings-section">
              <h3>Приватность</h3>
              <label class="settings-row">
                <span>Кто видит аватар</span>
                <select class="input" id="setAvatarVis">
                  <option value="all" ${s.avatarVisibility === 'all' ? 'selected' : ''}>Все</option>
                  <option value="contacts" ${s.avatarVisibility === 'contacts' ? 'selected' : ''}>Контакты</option>
                  <option value="nobody" ${s.avatarVisibility === 'nobody' ? 'selected' : ''}>Никто</option>
                </select>
              </label>
              <label class="settings-row">
                <span>Кто звонит мне</span>
                <select class="input" id="setCalls">
                  <option value="all" ${s.whoCanCall === 'all' ? 'selected' : ''}>Все</option>
                  <option value="contacts" ${s.whoCanCall === 'contacts' ? 'selected' : ''}>Контакты</option>
                </select>
              </label>
            </div>
          </div>

          <div class="settings-pane" data-pane="devices">
            <div class="settings-section">
              <h3>Активные сессии</h3>
              <div class="device-list" id="deviceList"><div class="settings-loading">Загрузка…</div></div>
            </div>
            <div class="settings-section">
              <h3>Сессионные ключи</h3>
              <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
                <button type="button" class="btn btn-ghost" id="terminateAllBtn">${QWAS.Util.icon('logOut', { size: 16 })}<span>Завершить все другие сессии</span></button>
              </div>
            </div>
          </div>

          <div class="settings-pane" data-pane="account">
            <div class="settings-section">
              <h3>Профиль</h3>
              <div class="settings-row">
                <span>Имя</span>
                <span class="muted">${QWAS.Util.escapeHtml(me?.firstName || '')} ${QWAS.Util.escapeHtml(me?.lastName || '')}</span>
              </div>
              <div class="settings-row">
                <span>Username</span>
                <span class="muted">@${QWAS.Util.escapeHtml(me?.username || '')}</span>
              </div>
              <div class="settings-row">
                <span>Email</span>
                <span class="muted">${QWAS.Util.escapeHtml(me?.email || '—')}</span>
              </div>
              <div class="settings-row">
                <span>Телефон</span>
                <span class="muted">${QWAS.Util.escapeHtml(me?.phone || '—')}</span>
              </div>
            </div>
            <div class="settings-section danger-section">
              <h3>Опасная зона</h3>
              <button type="button" class="btn btn-danger" id="logoutBtn">${QWAS.Util.icon('logOut', { size: 16 })}<span>Выйти</span></button>
            </div>
          </div>
        </div>
      `;
      const overlay = this._build('Настройки', content, [
        { label: 'Закрыть', type: 'primary', onclick: 'QWAS.Modals.close()' }
      ]);
      this.show(overlay);

      // === Wire up tab switching ===
      overlay.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          overlay.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
          overlay.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          const pane = overlay.querySelector(`.settings-pane[data-pane="${tab.dataset.tab}"]`);
          if (pane) pane.classList.add('active');
        });
      });

      // === Wire up color presets ===
      overlay.querySelectorAll('.color-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          const c = btn.dataset.color;
          const input = document.getElementById('setAccent');
          if (input) {
            input.value = c;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      });

      // === Wire up font-size grid ===
      overlay.querySelectorAll('.font-size-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          overlay.querySelectorAll('.font-size-opt').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          const fs = opt.dataset.fs;
          document.documentElement.dataset.fontSize = fs;
          QWAS.State.settings.fontSize = fs;
          QWAS.State.saveSettings();
          this._saveSettings();
        });
      });

      // === Wire up wallpaper grid ===
      overlay.querySelectorAll('.wallpaper-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          const id = opt.dataset.wp;
          if (id === 'custom') {
            document.getElementById('setWallpaperFile')?.click();
            return;
          }
          overlay.querySelectorAll('.wallpaper-opt').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          QWAS.State.settings.wallpaper = id;
          this._applyWallpaper(id);
          QWAS.State.saveSettings();
          this._saveSettings();
        });
      });

      // === Wire up wallpaper file upload ===
      const wpBtn = overlay.querySelector('#setWallpaperBtn');
      const wpFile = overlay.querySelector('#setWallpaperFile');
      if (wpBtn && wpFile) {
        wpBtn.addEventListener('click', () => wpFile.click());
        wpFile.addEventListener('change', (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 8 * 1024 * 1024) { QWAS.Toast?.error?.('Файл больше 8 МБ'); return; }
          const reader = new FileReader();
          reader.onload = () => {
            QWAS.State.settings.wallpaperCustom = reader.result;
            QWAS.State.settings.wallpaper = 'custom';
            this._applyWallpaper('custom', reader.result);
            QWAS.State.saveSettings();
            this._saveSettings();
            QWAS.Toast?.success?.('Обои установлены');
          };
          reader.readAsDataURL(f);
        });
      }

      // === Wire up logout ===
      const logoutBtn = overlay.querySelector('#logoutBtn');
      if (logoutBtn) logoutBtn.addEventListener('click', () => QWAS.Auth?.logout?.());

      // === Wire up terminate all sessions ===
      const termAll = overlay.querySelector('#terminateAllBtn');
      if (termAll) {
        termAll.addEventListener('click', async () => {
          if (!confirm('Завершить все сессии кроме текущей?')) return;
          try {
            const r = await QWAS.API.terminateAllSessions();
            if (r?.ok) { QWAS.Toast?.success?.('Сессии завершены'); this.loadDevicesList(overlay); }
          } catch (e) { QWAS.Toast?.error?.('Ошибка'); }
        });
      }

      // === Load devices list ===
      this.loadDevicesList(overlay);

      // Авто-сохранение с дебаунсом
      let timer;
      const save = () => {
        clearTimeout(timer);
        timer = setTimeout(() => this._saveSettings(), 600);
      };
      overlay.querySelectorAll('input, select').forEach(el => el.addEventListener('change', save));
    },

    async loadDevicesList(overlay) {
      const list = overlay.querySelector('#deviceList');
      if (!list) return;
      list.innerHTML = '<div class="settings-loading">Загрузка…</div>';
      try {
        const r = await QWAS.API.sessions();
        if (!r?.ok) { list.innerHTML = '<div class="muted">Не удалось загрузить</div>'; return; }
        const sessions = r.sessions || [];
        if (sessions.length === 0) { list.innerHTML = '<div class="muted">Нет активных сессий</div>'; return; }
        list.innerHTML = sessions.map(s => `
          <div class="device-item ${s.isCurrent ? 'current' : ''}" data-sid="${s.id}">
            <div class="device-icon">${QWAS.Util.icon(s.isCurrent ? 'smartphone' : 'monitor', { size: 22 })}</div>
            <div class="device-info">
              <div class="device-name">${QWAS.Util.escapeHtml(s.deviceName || 'Устройство')}</div>
              <div class="device-meta">${QWAS.Util.escapeHtml(s.ip || '')} · ${s.lastActive ? new Date(s.lastActive).toLocaleString() : ''}</div>
            </div>
            ${s.isCurrent ? '<span class="device-badge">Это устройство</span>' : `<button class="icon-btn device-terminate" data-sid="${s.id}">${QWAS.Util.icon('x', { size: 16 })}</button>`}
          </div>
        `).join('');
        list.querySelectorAll('.device-terminate').forEach(btn => {
          btn.addEventListener('click', async () => {
            const sid = btn.dataset.sid;
            if (!confirm('Завершить сессию?')) return;
            try {
              const r = await QWAS.API.terminateSession(sid);
              if (r?.ok) { QWAS.Toast?.success?.('Сессия завершена'); this.loadDevicesList(overlay); }
            } catch (e) { QWAS.Toast?.error?.('Ошибка'); }
          });
        });
      } catch (e) {
        list.innerHTML = '<div class="muted">Ошибка загрузки</div>';
      }
    },

    _applyWallpaper(id, customData) {
      const bg = document.getElementById('chatBg');
      if (!bg) return;
      const gradients = {
        gradient1: 'linear-gradient(135deg,#ff6b6b 0%,#ffa500 100%)',
        gradient2: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
        gradient3: 'linear-gradient(135deg,#134e5e 0%,#71b280 100%)',
        gradient4: 'linear-gradient(135deg,#0f0c29 0%,#302b63 100%)',
        gradient5: 'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)',
        gradient6: 'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)',
        none: 'transparent'
      };
      if (id === 'custom' && customData) {
        bg.style.background = `url("${customData}") center/cover no-repeat`;
        bg.style.opacity = '0.18';
      } else if (id === 'none') {
        bg.style.background = 'transparent';
        bg.style.opacity = '0';
      } else {
        const g = gradients[id] || '';
        if (g) { bg.style.background = g; bg.style.opacity = '0.1'; }
        else { bg.style.background = ''; bg.style.opacity = ''; }
      }
    },

    async _saveSettings() {
      const auto = {
        photo: document.getElementById('setAutoPhoto')?.checked,
        video: document.getElementById('setAutoVideo')?.checked,
        file: document.getElementById('setAutoFile')?.checked
      };
      const patch = {
        theme: document.getElementById('setTheme')?.value,
        accentColor: document.getElementById('setAccent')?.value,
        fontSize: QWAS.State.settings.fontSize || 'medium',
        wallpaper: QWAS.State.settings.wallpaper || 'gradient1',
        wallpaperCustom: QWAS.State.settings.wallpaperCustom || null,
        language: document.getElementById('setLang')?.value,
        enterToSend: document.getElementById('setEnter')?.checked,
        linkPreview: document.getElementById('setLinkPreview')?.checked,
        animations: document.getElementById('setAnimations')?.checked,
        soundEnabled: document.getElementById('setSound')?.checked,
        desktopNotifications: document.getElementById('setDesktop')?.checked,
        vibrate: document.getElementById('setVibrate')?.checked,
        notificationPreview: document.getElementById('setNotifPreview')?.checked,
        pinEnabled: document.getElementById('setPinEnabled')?.checked,
        twoFactorEnabled: document.getElementById('set2FA')?.checked,
        autoLock: parseInt(document.getElementById('setAutoLock')?.value) || 0,
        avatarVisibility: document.getElementById('setAvatarVis')?.value,
        whoCanCall: document.getElementById('setCalls')?.value,
        voiceQuality: document.getElementById('setVoiceQ')?.value,
        videoQuality: document.getElementById('setVideoQ')?.value,
        videoFps: parseInt(document.getElementById('setFps')?.value),
        autoDownload: auto
      };
      Object.assign(QWAS.State.settings, patch);
      QWAS.State.saveSettings();
      // Применим тему и шрифт
      this._applyTheme();
      this._applyFontSize(patch.fontSize);
      // Сохраним на сервере
      try {
        await QWAS.API.saveSettings(patch);
        if (QWAS.State.me) QWAS.State.me.settings = { ...QWAS.State.me.settings, ...patch };
      } catch (e) { /* ignore */ }
    },

    _applyFontSize(size) {
      const root = document.documentElement;
      if (!size) size = 'medium';
      root.dataset.fontSize = size;
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
            <button class="btn-secondary" data-info-action="pin">${c.isPinned ? 'Открепить' : 'Закрепить'}</button>
            <button class="btn-secondary" data-info-action="mute">${c.isMuted ? 'Вкл. звук' : 'Откл. звук'}</button>
            <button class="btn-secondary" data-info-action="archive">${c.isArchived ? 'Разархивировать' : 'В архив'}</button>
            <button class="btn-secondary" data-info-action="media">Медиа</button>
            <button class="btn-danger" data-info-action="delete">Удалить чат</button>
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
          <button class="btn-secondary" id="pollAddOpt">+ вариант</button>
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
