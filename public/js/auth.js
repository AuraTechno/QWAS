(function() {
  'use strict';
  
  QWAS.Auth = {
    openRegisterModal: function() {
      const modal = document.getElementById('registerModal');
      if (modal) modal.classList.add('show');
    },
    
    closeRegisterModal: function() {
      const modal = document.getElementById('registerModal');
      if (modal) modal.classList.remove('show');
      const regUsername = document.getElementById('regUsername');
      const regPassword = document.getElementById('regPassword');
      const regConfirm = document.getElementById('regConfirmPassword');
      if (regUsername) regUsername.value = '';
      if (regPassword) regPassword.value = '';
      if (regConfirm) regConfirm.value = '';
    },
    
    handleRegister: async function() {
      const usernameInput = document.getElementById('regUsername');
      const passwordInput = document.getElementById('regPassword');
      const confirmInput = document.getElementById('regConfirmPassword');
      
      if (!usernameInput || !passwordInput || !confirmInput) return;
      
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const confirm = confirmInput.value;
      
      if (!username || !password) {
        QWAS.Notifications.warning('Введите логин и пароль');
        return;
      }
      
      if (!QWAS.Utils.validateUsername(username)) {
        QWAS.Notifications.error('Только буквы, цифры и _');
        return;
      }
      
      if (password.length < 6) {
        QWAS.Notifications.warning('Пароль от 6 символов');
        return;
      }
      
      if (password !== confirm) {
        QWAS.Notifications.error('Пароли не совпадают');
        return;
      }
      
      try {
        const res = await fetch(QWAS.Config.API.REGISTER, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (data.ok) {
          QWAS.Notifications.success('Аккаунт создан!');
          this.closeRegisterModal();
          const loginUsername = document.getElementById('loginUsername');
          if (loginUsername) loginUsername.value = username;
        } else {
          QWAS.Notifications.error(data.error || 'Ошибка регистрации');
        }
      } catch (err) {
        console.error('Register error:', err);
        QWAS.Notifications.error('Ошибка соединения');
      }
    },
    
    handleLogin: function() {
      const usernameInput = document.getElementById('loginUsername');
      const passwordInput = document.getElementById('loginPassword');
      
      if (!usernameInput || !passwordInput) return;
      
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      
      if (!username || !password) {
        QWAS.Notifications.warning('Введите логин и пароль');
        return;
      }
      
      this.login(username, password);
    },
    
    login: async function(username, password) {
      const cleanUsername = QWAS.Utils.cleanUsername(username);
      
      try {
        const res = await fetch(QWAS.Config.API.LOGIN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUsername, password })
        });
        
        const data = await res.json();
        
        if (!data.ok) {
          QWAS.Notifications.error(data.error || 'Ошибка входа');
          return;
        }
        
        // Сохраняем данные
        QWAS.State.me = data.user.username;
        QWAS.State.userToken = data.token;
        QWAS.State.currentUser = data.user;
        
        localStorage.setItem(QWAS.Config.STORAGE.TOKEN, data.token);
        localStorage.setItem(QWAS.Config.STORAGE.USER, JSON.stringify(data.user));
        
        QWAS.Notifications.success(`Добро пожаловать, @${data.user.username}!`);
        
        // Скрываем авторизацию, показываем чат
        const authEl = document.getElementById('auth');
        const chatEl = document.getElementById('chat');
        if (authEl) authEl.style.display = 'none';
        if (chatEl) chatEl.style.display = QWAS.State.isMobile ? 'block' : 'flex';
        
        const myUsername = document.getElementById('myUsername');
        if (myUsername) myUsername.textContent = '@' + data.user.username;
        
        // Обновляем аватар
        if (QWAS.Profile && QWAS.Profile.updateMyAvatar) {
          QWAS.Profile.updateMyAvatar();
        }
        
        // Загружаем данные
        await this.loadInitialData();
        
        // Подключаем сокет
        if (QWAS.Socket && QWAS.Socket.connect) {
          QWAS.Socket.connect(data.token);
        }
        
        await this.loadGroups();
        
      } catch (err) {
        console.error('Login error:', err);
        QWAS.Notifications.error('Ошибка соединения');
      }
    },
    
    loadInitialData: async function() {
      try {
        if (QWAS.Chat && QWAS.Chat.loadAllUsers) {
          await QWAS.Chat.loadAllUsers();
        }
        if (QWAS.Chat && QWAS.Chat.loadChatList) {
          await QWAS.Chat.loadChatList();
        }
      } catch (err) {
        console.error('Load initial data error:', err);
      }
    },

    loadGroups: async function() {
      try {
        const res = await fetch('/groups/my', {
          headers: { 'Authorization': `Bearer ${QWAS.State.userToken}` }
        });
        const data = await res.json();
        QWAS.Groups.myGroups = data.groups || [];
        QWAS.Groups.renderGroups();
      } catch (err) {
        console.error('Load groups error:', err);
      }
    },
    
    checkAutoLogin: async function() {
      const token = localStorage.getItem(QWAS.Config.STORAGE.TOKEN);
      const savedUser = localStorage.getItem(QWAS.Config.STORAGE.USER);
      
      if (!token || !savedUser) return;
      
      try {
        const res = await fetch(QWAS.Config.API.AUTO_LOGIN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        
        const data = await res.json();
        
        if (data.ok) {
          // Восстанавливаем сессию
          QWAS.State.me = data.user.username;
          QWAS.State.userToken = token;
          QWAS.State.currentUser = data.user;
          
          // Скрываем авторизацию
          const authEl = document.getElementById('auth');
          const chatEl = document.getElementById('chat');
          if (authEl) authEl.style.display = 'none';
          if (chatEl) chatEl.style.display = QWAS.State.isMobile ? 'block' : 'flex';
          
          const myUsername = document.getElementById('myUsername');
          if (myUsername) myUsername.textContent = '@' + data.user.username;
          
          // Обновляем аватар
          if (QWAS.Profile && QWAS.Profile.updateMyAvatar) {
            QWAS.Profile.updateMyAvatar();
          }
          
          // Загружаем данные
          await this.loadInitialData();
          
          // Подключаем сокет
          if (QWAS.Socket && QWAS.Socket.connect) {
            QWAS.Socket.connect(token);
          }
          
          await this.loadGroups();
          
          console.log('✅ Авто-вход выполнен');
        } else {
          // Токен недействителен
          localStorage.removeItem(QWAS.Config.STORAGE.TOKEN);
          localStorage.removeItem(QWAS.Config.STORAGE.USER);
          console.log('❌ Токен недействителен');
        }
      } catch (err) {
        console.error('Auto-login error:', err);
      }
    },
    
    logout: async function() {
      // Закрываем профиль если открыт
      if (QWAS.Profile && QWAS.Profile.close) {
        QWAS.Profile.close();
      }
      
      // Отправляем запрос на выход
      if (QWAS.State.userToken) {
        try {
          await fetch(QWAS.Config.API.LOGOUT, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${QWAS.State.userToken}` }
          });
        } catch (err) {
          console.error('Logout error:', err);
        }
      }
      
      // Отключаем сокет
      if (QWAS.State.socket) {
        QWAS.State.socket.disconnect();
        QWAS.State.socket = null;
      }
      
      // Очищаем localStorage
      localStorage.removeItem(QWAS.Config.STORAGE.TOKEN);
      localStorage.removeItem(QWAS.Config.STORAGE.USER);
      
      // Сбрасываем состояние
      QWAS.State.me = '';
      QWAS.State.current = '';
      QWAS.State.userToken = '';
      QWAS.State.currentUser = { avatar: '', username: '', avatarColor: '#6366f1' };
      QWAS.State.chatList = [];
      QWAS.State.allUsers = [];
      
      // Показываем страницу входа
      const authEl = document.getElementById('auth');
      const chatEl = document.getElementById('chat');
      if (authEl) authEl.style.display = 'flex';
      if (chatEl) chatEl.style.display = 'none';
      
      // Очищаем поля
      const loginUsername = document.getElementById('loginUsername');
      const loginPassword = document.getElementById('loginPassword');
      if (loginUsername) loginUsername.value = '';
      if (loginPassword) loginPassword.value = '';
      
      // Показываем сайдбар если скрыт
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('hidden');
      
      QWAS.Notifications.info('Вы вышли из аккаунта');
    }
  };
})();