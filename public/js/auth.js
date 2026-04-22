(function() {
  'use strict';
  
  QWAS.Auth = {
    openRegisterModal: function() {
      document.getElementById('registerModal').classList.add('show');
    },
    
    closeRegisterModal: function() {
      document.getElementById('registerModal').classList.remove('show');
    },
    
    handleRegister: async function() {
      const username = document.getElementById('regUsername').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirm = document.getElementById('regConfirmPassword').value;
      
      if (!username || !password) {
        return QWAS.Notifications.warning('Введите логин и пароль');
      }
      
      if (!QWAS.Utils.validateUsername(username)) {
        return QWAS.Notifications.error('Только буквы, цифры и _');
      }
      
      if (password.length < 6) {
        return QWAS.Notifications.warning('Пароль от 6 символов');
      }
      
      if (password !== confirm) {
        return QWAS.Notifications.error('Пароли не совпадают');
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
          document.getElementById('loginUsername').value = username;
        } else {
          QWAS.Notifications.error(data.error || 'Ошибка');
        }
      } catch (err) {
        QWAS.Notifications.error('Ошибка соединения');
      }
    },
    
    handleLogin: function() {
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      
      if (!username || !password) {
        return QWAS.Notifications.warning('Введите логин и пароль');
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
          return QWAS.Notifications.error(data.error || 'Ошибка входа');
        }
        
        QWAS.State.me = data.user.username;
        QWAS.State.userToken = data.token;
        QWAS.State.currentUser = data.user;
        
        localStorage.setItem(QWAS.Config.STORAGE.TOKEN, data.token);
        localStorage.setItem(QWAS.Config.STORAGE.USER, JSON.stringify(data.user));
        
        QWAS.Notifications.success(`Добро пожаловать, @${data.user.username}!`);
        
        document.getElementById('auth').style.display = 'none';
        document.getElementById('chat').style.display = QWAS.State.isMobile ? 'block' : 'flex';
        document.getElementById('myUsername').textContent = '@' + data.user.username;
        
        QWAS.Profile.updateMyAvatar();
        
        await QWAS.Chat.loadAllUsers();
        await QWAS.Chat.loadChatList();
        QWAS.Socket.connect(data.token);
      } catch (err) {
        QWAS.Notifications.error('Ошибка соединения');
      }
    },
    
    checkAutoLogin: async function() {
      const token = localStorage.getItem(QWAS.Config.STORAGE.TOKEN);
      if (!token) return;
      
      try {
        const res = await fetch(QWAS.Config.API.AUTO_LOGIN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        
        const data = await res.json();
        
        if (data.ok) {
          QWAS.State.me = data.user.username;
          QWAS.State.userToken = token;
          QWAS.State.currentUser = data.user;
          
          document.getElementById('auth').style.display = 'none';
          document.getElementById('chat').style.display = QWAS.State.isMobile ? 'block' : 'flex';
          document.getElementById('myUsername').textContent = '@' + data.user.username;
          
          QWAS.Profile.updateMyAvatar();
          
          await QWAS.Chat.loadAllUsers();
          await QWAS.Chat.loadChatList();
          QWAS.Socket.connect(token);
        } else {
          localStorage.clear();
        }
      } catch (err) {
        console.error('Auto-login error:', err);
      }
    },
    
    logout: async function() {
      QWAS.Profile.close();
      
      if (QWAS.State.userToken) {
        try {
          await fetch(QWAS.Config.API.LOGOUT, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${QWAS.State.userToken}` }
          });
        } catch (err) {}
      }
      
      if (QWAS.State.socket) {
        QWAS.State.socket.disconnect();
      }
      
      localStorage.clear();
      location.reload();
    }
  };
})();