// Аутентификация: вход / регистрация / подключение сокета
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  // === Username / Email / Password validators ===
  const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Состояние real-time проверок
  const _checkState = {
    username: { value: '', available: false, checking: false, error: null },
    email:    { value: '', available: false, checking: false, error: null }
  };

  function setUsernameHint(state) {
    const field = document.getElementById('regUsernameField');
    const status = document.getElementById('regUsernameStatus');
    const hint = document.getElementById('regUsernameHint');
    const input = document.getElementById('regUsername');
    if (!field || !status || !hint || !input) return;
    field.classList.toggle('has-value', !!state.value);
    input.classList.remove('invalid');
    if (!state.value) {
      status.className = 'field-status';
      hint.className = 'field-hint';
      hint.textContent = 'Только латиница, цифры и подчёркивание';
      return;
    }
    if (state.error) {
      status.className = 'field-status error';
      status.innerHTML = QWAS.Util.icon('xCircle');
      hint.className = 'field-hint error';
      hint.textContent = state.error;
      input.classList.add('invalid');
      return;
    }
    if (state.checking) {
      status.className = 'field-status checking';
      status.innerHTML = QWAS.Util.icon('refresh');
      hint.className = 'field-hint info';
      hint.textContent = 'Проверяем...';
      return;
    }
    if (state.available) {
      status.className = 'field-status free';
      status.innerHTML = QWAS.Util.icon('checkCircle');
      hint.className = 'field-hint success';
      hint.textContent = 'Имя свободно';
      return;
    }
  }

  function setEmailHint(state) {
    const field = document.getElementById('regEmailField');
    const status = document.getElementById('regEmailStatus');
    const hint = document.getElementById('regEmailHint');
    const input = document.getElementById('regEmail');
    if (!field || !status || !hint || !input) return;
    field.classList.toggle('has-value', !!state.value);
    input.classList.remove('invalid');
    if (!state.value) {
      status.className = 'field-status';
      hint.className = 'field-hint';
      hint.textContent = 'Для восстановления доступа';
      return;
    }
    if (state.error) {
      status.className = 'field-status error';
      status.innerHTML = QWAS.Util.icon('xCircle');
      hint.className = 'field-hint error';
      hint.textContent = state.error;
      input.classList.add('invalid');
      return;
    }
    if (state.checking) {
      status.className = 'field-status checking';
      status.innerHTML = QWAS.Util.icon('refresh');
      hint.className = 'field-hint info';
      hint.textContent = 'Проверяем...';
      return;
    }
    if (state.available) {
      status.className = 'field-status free';
      status.innerHTML = QWAS.Util.icon('checkCircle');
      hint.className = 'field-hint success';
      hint.textContent = 'Email свободен';
      return;
    }
  }

  // Debounced real-time check
  const debouncedCheck = QWAS.Util.debounce(async (kind) => {
    if (kind === 'username') {
      const state = _checkState.username;
      if (!state.value || state.error) return;
      state.checking = true;
      setUsernameHint(state);
      try {
        const r = await QWAS.API.checkUsername(state.value);
        state.checking = false;
        state.available = !!(r && r.ok && r.available);
        if (!state.available && r && r.error) state.error = r.error;
      } catch {
        state.checking = false;
        state.available = false;
        state.error = 'Ошибка проверки';
      }
      setUsernameHint(state);
    } else if (kind === 'email') {
      const state = _checkState.email;
      if (!state.value || state.error) return;
      state.checking = true;
      setEmailHint(state);
      try {
        const r = await QWAS.API.checkEmail(state.value);
        state.checking = false;
        state.available = !!(r && r.ok && r.available);
        if (!state.available && r && r.error) state.error = r.error;
      } catch {
        state.checking = false;
        state.available = false;
        state.error = 'Ошибка проверки';
      }
      setEmailHint(state);
    }
    updateRegisterBtn();
  }, 400);

  function updateRegisterBtn() {
    const btn = document.getElementById('authRegisterBtn');
    if (!btn) return;
    const u = _checkState.username;
    const e = _checkState.email;
    const pass1 = document.getElementById('regPassword')?.value || '';
    const pass2 = document.getElementById('regConfirmPassword')?.value || '';
    const fname = document.getElementById('regFirstName')?.value.trim() || '';
    const ok = u.value && !u.error && !u.checking && u.available
      && (!e.value || (!e.error && !e.checking && e.available))
      && fname.length > 0
      && pass1.length >= 6 && pass1 === pass2;
    btn.disabled = !ok;
  }

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
      ['regUsername', 'regFirstName', 'regLastName', 'regPassword', 'regConfirmPassword', 'regEmail'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); this.handleRegister(); }
        });
      });

      // Username live check
      const usernameInput = document.getElementById('regUsername');
      if (usernameInput) {
        usernameInput.addEventListener('input', () => {
          const val = usernameInput.value.trim().toLowerCase();
          _checkState.username = { value: val, available: false, checking: false, error: null };
          if (val && !USERNAME_RE.test(val)) {
            _checkState.username.error = '3-32 символа: латиница, цифры, _';
          }
          setUsernameHint(_checkState.username);
          if (val && !_checkState.username.error) debouncedCheck('username');
          else updateRegisterBtn();
        });
      }

      // Email live check
      const emailInput = document.getElementById('regEmail');
      if (emailInput) {
        emailInput.addEventListener('input', () => {
          const val = emailInput.value.trim();
          _checkState.email = { value: val, available: false, checking: false, error: null };
          if (val && !EMAIL_RE.test(val)) {
            _checkState.email.error = 'Некорректный email';
          } else if (val && val.length > 254) {
            _checkState.email.error = 'Слишком длинный';
          }
          setEmailHint(_checkState.email);
          if (val && !_checkState.email.error) debouncedCheck('email');
          else updateRegisterBtn();
        });
      }

      // Password match live update
      ['regPassword', 'regConfirmPassword', 'regFirstName'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateRegisterBtn);
      });
    },

    bindEyeToggle() {
      const eye = document.getElementById('loginEye');
      if (!eye) return;
      // Создаём SVG-иконку
      QWAS.Util.setIcon(eye, 'eye');
      eye.addEventListener('click', () => {
        const pwd = document.getElementById('loginPassword');
        if (!pwd) return;
        if (pwd.type === 'password') {
          pwd.type = 'text';
          QWAS.Util.setIcon(eye, 'eyeOff');
        } else {
          pwd.type = 'password';
          QWAS.Util.setIcon(eye, 'eye');
        }
      });
    },

    bindAuthBackground() {
      // Анимированный фон
      const bg = document.querySelector('.auth-bg');
      if (!bg) return;
      let mx = 30, my = 20;
      document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        mx += (x - mx) * 0.04;
        my += (y - my) * 0.04;
        bg.style.setProperty('--mx', mx + '%');
        bg.style.setProperty('--my', my + '%');
      });
    },

    bindVersion() {
      const v = document.getElementById('authVersion');
      if (v) v.textContent = 'QWAS Messenger v2.0';
    },

    showRegError(msg) {
      const el = document.getElementById('regError');
      if (!el) return;
      if (!msg) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = 'flex';
      el.innerHTML = QWAS.Util.icon('alertCircle') + '<span>' + QWAS.Util.escapeHtml(msg) + '</span>';
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
        QWAS.Toast.success(`Добро пожаловать, ${r.user.firstName || r.user.username}!`);
        this.showMain();
      } catch (err) {
        QWAS.Toast.error('Ошибка сети');
      } finally {
        this._setLoading(btn, false);
      }
    },

    async handleRegister() {
      const username = (document.getElementById('regUsername')?.value || '').trim().toLowerCase();
      const firstName = (document.getElementById('regFirstName')?.value || '').trim();
      const lastName = (document.getElementById('regLastName')?.value || '').trim();
      const email = (document.getElementById('regEmail')?.value || '').trim();
      const password = document.getElementById('regPassword')?.value || '';
      const confirm = document.getElementById('regConfirmPassword')?.value || '';

      this.showRegError(null);

      if (!username || !firstName || !password) {
        this.showRegError('Заполните обязательные поля');
        return;
      }
      if (!USERNAME_RE.test(username)) {
        this.showRegError('Имя пользователя: 3-32 символа латиницы, цифр или _');
        return;
      }
      if (email && !EMAIL_RE.test(email)) {
        this.showRegError('Некорректный email');
        return;
      }
      if (password.length < 6) {
        this.showRegError('Пароль минимум 6 символов');
        return;
      }
      if (password !== confirm) {
        this.showRegError('Пароли не совпадают');
        return;
      }
      if (!_checkState.username.available) {
        this.showRegError('Имя пользователя занято или не проверено');
        return;
      }
      if (email && !_checkState.email.available) {
        this.showRegError('Email уже используется или не проверен');
        return;
      }

      const btn = document.getElementById('authRegisterBtn');
      this._setLoading(btn, true);
      try {
        const r = await QWAS.API.register({ username, firstName, lastName, email: email || null, password });
        if (!r.ok) {
          this.showRegError(r.error || 'Ошибка регистрации');
          return;
        }
        QWAS.State.setMe(r.user, r.token);
        QWAS.Toast.success('Аккаунт создан!');
        this.showMain();
      } catch (err) {
        this.showRegError('Ошибка сети');
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
      setTimeout(() => {
        const u = document.getElementById('regUsername');
        if (u) u.focus();
      }, 100);
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
