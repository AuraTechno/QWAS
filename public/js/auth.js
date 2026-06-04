(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Auth = {
    showLogin() {
      const s = document.getElementById('authScreen');
      if (s) s.style.display = 'flex';
      const m = document.getElementById('mainScreen');
      if (m) m.style.display = 'none';
    },

    showApp() {
      const s = document.getElementById('authScreen');
      if (s) s.style.display = 'none';
      const m = document.getElementById('mainScreen');
      if (m) m.style.display = 'flex';
    },

    showRegister() {
      document.getElementById('authLogin').style.display = 'none';
      document.getElementById('authRegister').style.display = 'flex';
      setTimeout(() => document.getElementById('regUsername')?.focus(), 100);
    },

    showLoginForm() {
      document.getElementById('authRegister').style.display = 'none';
      document.getElementById('authLogin').style.display = 'flex';
      setTimeout(() => document.getElementById('loginUsername')?.focus(), 100);
    },

    openRegister() { this.showRegister(); },
    closeRegister() { this.showLoginForm(); },

    togglePassword(input) {
      if (input.type === 'password') input.type = 'text';
      else input.type = 'password';
    },

    async handleLogin() {
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!username || !password) {
        QWAS.Toast.warning('Введите логин и пароль');
        return;
      }

      const clean = QWAS.Util.cleanUsername(username);
      if (!QWAS.Util.validateUsername(clean)) {
        QWAS.Toast.error('Логин: 3-32 символа, буквы/цифры/_');
        return;
      }

      this.setLoading(true);
      const r = await QWAS.API.post('/login', { username: clean, password });
      this.setLoading(false);

      if (!r.ok) {
        QWAS.Toast.error(r.error || 'Ошибка входа');
        return;
      }

      this.onAuth(r.user, r.token);
    },

    async handleRegister() {
      const username = document.getElementById('regUsername').value.trim();
      const firstName = document.getElementById('regFirstName').value.trim();
      const lastName = document.getElementById('regLastName').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirm = document.getElementById('regConfirmPassword').value;

      const clean = QWAS.Util.cleanUsername(username);

      if (!clean || !password) {
        QWAS.Toast.warning('Заполните все поля');
        return;
      }
      if (!QWAS.Util.validateUsername(clean)) {
        QWAS.Toast.error('Логин: 3-32 символа, буквы/цифры/_');
        return;
      }
      if (password.length < 6) {
        QWAS.Toast.warning('Пароль минимум 6 символов');
        return;
      }
      if (password !== confirm) {
        QWAS.Toast.error('Пароли не совпадают');
        return;
      }

      this.setLoading(true);
      const r = await QWAS.API.post('/register', { username: clean, password, firstName, lastName });
      this.setLoading(false);

      if (!r.ok) {
        QWAS.Toast.error(r.error || 'Ошибка регистрации');
        return;
      }

      QWAS.Toast.success('Аккаунт создан! Войдите.');
      this.showLoginForm();
      document.getElementById('loginUsername').value = clean;
      document.getElementById('loginPassword').focus();
    },

    setLoading(loading) {
      const screen = document.getElementById('authScreen');
      if (screen) screen.dataset.loading = loading ? 'true' : 'false';
    },

    onAuth(user, token) {
      QWAS.State.me = user.username;
      QWAS.State.userToken = token;
      QWAS.State.currentUser = user;
      if (user.settings) Object.assign(QWAS.State.settings, user.settings);
      QWAS.Prefs.applyTheme();
      localStorage.setItem(QWAS.STORAGE.TOKEN, token);
      localStorage.setItem(QWAS.STORAGE.USER, JSON.stringify(user));
      this.showApp();
      QWAS.App && QWAS.App.start();
      QWAS.Toast.success(`Добро пожаловать, ${QWAS.Util.getUserDisplayName(user) || user.username}!`);
    },

    async logout() {
      if (QWAS.State.userToken) {
        await QWAS.API.post('/logout').catch(() => {});
      }
      if (QWAS.State.socket) {
        QWAS.State.socket.disconnect();
        QWAS.State.socket = null;
      }
      localStorage.removeItem(QWAS.STORAGE.TOKEN);
      localStorage.removeItem(QWAS.STORAGE.USER);
      QWAS.State.me = '';
      QWAS.State.currentUser = null;
      QWAS.State.userToken = '';
      QWAS.State.chats = [];
      QWAS.State.contacts = [];
      QWAS.State.folders = [];
      QWAS.State.messagesByChat = new Map();
      QWAS.State.current = '';
      this.showLogin();
      QWAS.Toast.info('Вы вышли');
    },

    async checkAutoLogin() {
      const token = localStorage.getItem(QWAS.STORAGE.TOKEN);
      const saved = localStorage.getItem(QWAS.STORAGE.USER);
      if (!token || !saved) {
        this.showLogin();
        return;
      }
      try {
        const r = await QWAS.API.post('/auto-login', { token });
        if (r.ok) {
          let user;
          try { user = JSON.parse(saved); } catch { user = r.user; }
          this.onAuth(r.user || user, token);
        } else {
          localStorage.removeItem(QWAS.STORAGE.TOKEN);
          localStorage.removeItem(QWAS.STORAGE.USER);
          this.showLogin();
        }
      } catch {
        this.showLogin();
      }
    }
  };

  QWAS.Auth = Auth;
})();
