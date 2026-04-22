(function() {
  'use strict';
  
  QWAS.Profile = {
    open: function() {
      document.getElementById('profileModal').classList.add('show');
      document.getElementById('profileUsername').value = '@' + QWAS.State.me;
      QWAS.State.uploadedAvatar = QWAS.State.currentUser.avatar || null;
      
      const avatarImg = document.getElementById('profileAvatarImg');
      const avatarText = document.getElementById('profileAvatarText');
      const avatarLarge = document.getElementById('profileAvatarLarge');
      
      if (QWAS.State.uploadedAvatar) {
        avatarImg.src = QWAS.State.uploadedAvatar;
        avatarImg.style.display = 'block';
        avatarText.style.display = 'none';
      } else {
        avatarImg.style.display = 'none';
        avatarText.style.display = 'block';
        avatarText.textContent = QWAS.Utils.getAvatarLetter(QWAS.State.me);
        avatarLarge.style.background = QWAS.State.currentUser.avatarColor || '#6366f1';
      }
    },
    
    close: function() {
      document.getElementById('profileModal').classList.remove('show');
    },
    
    handleAvatarUpload: function(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        QWAS.State.uploadedAvatar = e.target.result;
        document.getElementById('profileAvatarImg').src = QWAS.State.uploadedAvatar;
        document.getElementById('profileAvatarImg').style.display = 'block';
        document.getElementById('profileAvatarText').style.display = 'none';
      };
      reader.readAsDataURL(file);
    },
    
    save: async function() {
      try {
        await fetch(QWAS.Config.API.PROFILE_UPDATE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${QWAS.State.userToken}`
          },
          body: JSON.stringify({ avatar: QWAS.State.uploadedAvatar })
        });
        
        QWAS.State.currentUser.avatar = QWAS.State.uploadedAvatar;
        this.updateMyAvatar();
        this.close();
        QWAS.Notifications.success('Профиль обновлён');
      } catch (err) {
        QWAS.Notifications.error('Ошибка сохранения');
      }
    },
    
    updateMyAvatar: function() {
      const el = document.getElementById('myAvatar');
      QWAS.Utils.renderAvatar(el, QWAS.State.currentUser);
    },
    
    copyUsername: function() {
      const input = document.getElementById('profileUsername');
      input.select();
      navigator.clipboard?.writeText(input.value);
      
      const feedback = document.getElementById('copyFeedback');
      feedback.classList.add('show');
      setTimeout(() => feedback.classList.remove('show'), 1500);
      
      QWAS.Notifications.success('Скопировано!');
    }
  };
  
  document.getElementById('avatarInput').addEventListener('change', 
    QWAS.Profile.handleAvatarUpload.bind(QWAS.Profile)
  );
})();