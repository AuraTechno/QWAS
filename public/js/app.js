(function() {
  'use strict';
  
  document.addEventListener('DOMContentLoaded', () => {
    QWAS.Auth.checkAutoLogin();
  });
  
  document.getElementById('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') QWAS.Auth.handleLogin();
  });
  
  document.getElementById('regConfirmPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') QWAS.Auth.handleRegister();
  });
  
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest('.messages-container') || e.target.closest('.users-list')) {
      return;
    }
  }, { passive: false });
  
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  
  window.handleLogin = () => QWAS.Auth.handleLogin();
  window.handleRegister = () => QWAS.Auth.handleRegister();
  window.openRegisterModal = () => QWAS.Auth.openRegisterModal();
  window.closeRegisterModal = () => QWAS.Auth.closeRegisterModal();
  window.logout = () => QWAS.Auth.logout();
  window.openProfile = () => QWAS.Profile.open();
  window.closeProfile = () => QWAS.Profile.close();
  window.saveProfile = () => QWAS.Profile.save();
  window.copyUsername = () => QWAS.Profile.copyUsername();
  window.send = () => QWAS.Messages.send();
  window.showSidebar = () => QWAS.Chat.showSidebar();
  window.forwardMessage = () => QWAS.Messages.forward();
  window.editMessage = () => QWAS.Messages.edit();
  window.deleteMessage = () => QWAS.Messages.delete();
  window.closeForwardModal = () => QWAS.Messages.closeForwardModal();
  window.sendForward = (to) => QWAS.Messages.sendForward(to);
  window.startChatWith = (u) => QWAS.Search.startChat(u);
  
  console.log('✅ QWAS Messenger загружен!');
})();