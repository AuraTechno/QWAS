// Аутентификация: вход / регистрация / подключение сокета
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Auth = {
    async init() {
      this.bindLogin();
      this.bindRegister();
      this.bindEyeToggle();
      this.bindAuthBackground();
      this.bindVersion();

      const token = QWAS.State.getToken();
      if (token) {
        const r = await QWAS.API.me();
        if (r && r.ok) {
          QWAS.State.setMe(r.user, token);
          this.showMain();
          return;
        }
        QWAS.State.logout();
      }
      this.showAuth();
    },

    bindLogin() {
      const loginBtn = document.getElementById('authLoginBtn');
      if (loginBtn) {
        loginBtn.addEventListener('click', (e) => { e.preventDefault(); this.handleLogin(); });
      }
      const openReg = document.getElementById('authOpenRegister');
      if (openReg) {
        openReg.addEventListener('click', (e) => { e.preventDefault(); this.openRegister(); });
      }
      const usernameInput = document.getElementById('loginUsername');
      const passwordInput = document.getElementById('loginPassword');
      const submitOnEnter = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.handleLogin(); }
      };
      if (usernameInput) usernameInput.addEventListener('keydown', submitOnEnter);
      if (passwordInput) passwordInput.addEventListener('keydown', submitOnEnter);
    },

    bindRegister() {
      const submitBtn = document.getElementById('authRegisterBtn');
      if (submitBtn) {
        submitBtn.addEventListener('click', (e) => { e.preventDefault(); this.handleRegister(); });
      }
      const closeBtn = document.getElementById('authCloseRegister');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => { e.preventDefault(); this.closeRegister(); });
      }
      ['regUsername', 'regFirstName', 'regLastName', 'regPassword', 'regConfirmPassword'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); this.handleRegister(); }
        });
      });
    },

    bindEyeToggle() {
      const eye = document.getElementById('loginEye');
      if (!eye) return;
      eye.addEventListener('click', () => {
        const pwd = document.getElementById('loginPassword');
        if (!pwd) return;
        if (pwd.type === 'password') { pwd.type = 'text'; eye.textContent = '🙈'; }
        else { pwd.type = 'password'; eye.textContent = '👁'; }
      });
    },

    bindAuthBackground() {
      // Анимированный фон
      const bg = document.querySelector('.auth-bg');
      if (!bg) return;
      let mx = 50, my = 50;
      document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        mx += (x - mx) * 0.05;
        my += (y - my) * 0.05;
        bg.style.background = `radial-gradient(circle at ${mx}% ${my}%, #2a7ae0 0%, #17212b 60%)`;
      });
    },

    bindVersion() {
      const v = document.getElementById('authVersion');
      if (v) v.textContent = 'QWAS Messenger v2.0';
    },

    async handleLogin() {
      const username = (document.getElementById('loginUsername')?.value || '').trim();
      const password = document.getElementById('loginPassword')?.value || '';
      if (!username || !password) {
        QWAS.Toast.error('Введите логин и пароль');
        return;
      }
      const btn = document.getElementById('authLoginBtn');
      this._setLoading(btn, true);
      try {
        const r = await QWAS.API.login(username, password);
        if (!r.ok) { QWAS.Toast.error(r.error || 'Ошибка входа'); return; }
        QWAS.State.setMe(r.user, r.token);
        QWAS.Toast.success(`Добро пожаловать, ${r.user.firstName}!`);
        this.showMain();
      } catch (err) {
        QWAS.Toast.error('Ошибка сети');
      } finally {
        this._setLoading(btn, false);
      }
    },

    async handleRegister() {
      const username = (document.getElementById('regUsername')?.value || '').trim();
      const firstName = (document.getElementById('regFirstName')?.value || '').trim();
      const lastName = (document.getElementById('regLastName')?.value || '').trim();
      const password = document.getElementById('regPassword')?.value || '';
      const confirm = document.getElementById('regConfirmPassword')?.value || '';

      if (!username || !firstName || !password) {
        QWAS.Toast.error('Заполните обязательные поля');
        return;
      }
      if (password.length < 6) { QWAS.Toast.error('Пароль минимум 6 символов'); return; }
      if (password !== confirm) { QWAS.Toast.error('Пароли не совпадают'); return; }

      const btn = document.getElementById('authRegisterBtn');
      this._setLoading(btn, true);
      try {
        const r = await QWAS.API.register({ username, firstName, lastName, password });
        if (!r.ok) { QWAS.Toast.error(r.error || 'Ошибка регистрации'); return; }
        QWAS.State.setMe(r.user, r.token);
        QWAS.Toast.success('Аккаунт создан!');
        this.showMain();
      } catch (err) {
        QWAS.Toast.error('Ошибка сети');
      } finally {
        this._setLoading(btn, false);
      }
    },

    _setLoading(btn, loading) {
      if (!btn) return;
      btn.disabled = loading;
      btn.classList.toggle('loading', loading);
    },

    openRegister() {
      const f = document.getElementById('authLogin');
      const r = document.getElementById('authRegister');
      if (f) f.style.display = 'none';
      if (r) r.style.display = 'block';
    },

    closeRegister() {
      const f = document.getElementById('authLogin');
      const r = document.getElementById('authRegister');
      if (f) f.style.display = 'block';
      if (r) r.style.display = 'none';
    },

    showAuth() {
      const auth = document.getElementById('authScreen');
      const main = document.getElementById('mainScreen');
      if (auth) auth.style.display = 'flex';
      if (main) main.style.display = 'none';
    },

    showMain() {
      const auth = document.getElementById('authScreen');
      const main = document.getElementById('mainScreen');
      if (auth) auth.style.display = 'none';
      if (main) main.style.display = 'flex';
      // Запускаем приложение
      QWAS.App && QWAS.App.start();
    },

    async logout() {
      try { await QWAS.API.logout(); } catch {}
      QWAS.State.logout();
      QWAS.Toast.info('Вы вышли из аккаунта');
      this.showAuth();
    }
  };

  window.QWAS.Auth = Auth;
})();
