(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Profile = {
    open() {
      this.show();
    },

    show() {
      const user = QWAS.State.currentUser;
      if (!user) return;
      const content = `
        <div class="profile-header">
          <div class="profile-avatar-wrap">
            <div class="avatar size-120 ${QWAS.Util.gradientFor(user.username)}" id="profileAvatarBig">
              ${QWAS.Util.escapeHtml(QWAS.Util.getInitials(user.firstName || user.username))}
            </div>
            <label class="profile-avatar-edit" for="profileAvatarInput">
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6"/></svg>
            </label>
            <input type="file" id="profileAvatarInput" accept="image/*" style="display:none;">
          </div>
          <div class="profile-name" id="profileName">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(user) || user.username)}</div>
          <div class="profile-username" onclick="QWAS.Util.copyToClipboard('@${user.username}'); QWAS.Toast.success('Скопировано')">@${QWAS.Util.escapeHtml(user.username)}</div>
        </div>

        <div class="field">
          <label>Имя</label>
          <input type="text" id="profileFirstName" value="${QWAS.Util.escapeAttr(user.firstName || '')}" placeholder="Имя">
        </div>
        <div class="field">
          <label>Фамилия</label>
          <input type="text" id="profileLastName" value="${QWAS.Util.escapeAttr(user.lastName || '')}" placeholder="Фамилия">
        </div>
        <div class="field">
          <label>О себе</label>
          <textarea id="profileBio" placeholder="Расскажите о себе" maxlength="200">${QWAS.Util.escapeHtml(user.bio || '')}</textarea>
        </div>
      `;

      QWAS.Modals.open({
        title: 'Мой профиль',
        content,
        actions: [
          { label: 'Сохранить', type: 'primary', onclick: 'QWAS.Profile.save()' },
          { label: 'Выйти', type: 'danger', onclick: 'QWAS.Auth.logout()' }
        ]
      });

      const input = document.getElementById('profileAvatarInput');
      if (input) input.addEventListener('change', (e) => this.uploadAvatar(e));
    },

    async uploadAvatar(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        QWAS.Toast.error('Файл слишком большой (макс 5 МБ)');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        QWAS.State.currentUser.avatar = dataUrl;
        const av = document.getElementById('profileAvatarBig');
        if (av) {
          av.style.backgroundImage = `url(${dataUrl})`;
          av.style.backgroundSize = 'cover';
          av.textContent = '';
        }
        const r = await QWAS.API.post('/profile/update', { avatar: dataUrl });
        if (r.ok) QWAS.Toast.success('Аватар обновлён');
      };
      reader.readAsDataURL(file);
    },

    async save() {
      const firstName = document.getElementById('profileFirstName').value.trim();
      const lastName = document.getElementById('profileLastName').value.trim();
      const bio = document.getElementById('profileBio').value.trim();

      const r = await QWAS.API.post('/profile/update', { firstName, lastName, bio });
      if (r.ok) {
        Object.assign(QWAS.State.currentUser, { firstName, lastName, bio });
        localStorage.setItem(QWAS.STORAGE.USER, JSON.stringify(QWAS.State.currentUser));
        QWAS.Toast.success('Профиль сохранён');
        QWAS.Modals.close();
      } else {
        QWAS.Toast.error('Ошибка сохранения');
      }
    },

    copyUsername() {
      if (!QWAS.State.currentUser) return;
      QWAS.Util.copyToClipboard('@' + QWAS.State.currentUser.username);
      QWAS.Toast.success('Скопировано');
    }
  };

  QWAS.Profile = Profile;
})();
