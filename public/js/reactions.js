(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Reactions = {
    emojis: ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'],
    activeMessageId: null,

    showQuick(e, messageId) {
      if (QWAS.State.isSelectionMode) return;
      e.preventDefault();
      this.activeMessageId = messageId;
      this.showPopup(e.clientX || 0, e.clientY || 0);
    },

    showAt(x, y, messageId) {
      this.activeMessageId = messageId;
      this.showPopup(x, y);
    },

    showPopup(x, y) {
      const popup = document.getElementById('reactionPopup');
      if (!popup) return;

      popup.innerHTML = this.emojis.map(e => `<button class="reaction-option" onclick="QWAS.Reactions.select('${e}')">${e}</button>`).join('') +
        `<button class="reaction-option" style="background:var(--bg-hover);" onclick="QWAS.Reactions.openFull()">+</button>`;

      const w = (this.emojis.length + 1) * 50;
      let left = x - w / 2;
      const maxLeft = window.innerWidth - w - 8;
      if (left < 8) left = 8;
      if (left > maxLeft) left = maxLeft;

      let top = y - 60;
      if (top < 80) top = y + 30;

      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
      popup.style.display = 'flex';

      setTimeout(() => {
        document.addEventListener('click', this.hide, { once: true });
      }, 50);
    },

    hide() {
      const popup = document.getElementById('reactionPopup');
      if (popup) popup.style.display = 'none';
      Reactions.activeMessageId = null;
    },

    openFull() {
      this.hide();
      const fullEmojis = ['👍', '👎', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️',
        '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✨', '⭐', '🌟', '💫', '⚡', '🔥', '🌈',
        '☀️', '🌤️', '⛈️', '❄️', '💧', '🌊', '🎉', '🎊', '🎁', '🎈', '🎂', '🍰', '🍕', '🍔', '🍟',
        '☕', '🍺', '🍷', '🥂', '🍾', '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊',
        '🥰', '😍', '🤩', '😘', '😜', '🤪', '😎', '🤓', '🧐', '🤔', '😏', '😴', '🤤', '😪', '😵', '🥳',
        '😡', '😠', '🤬', '😱', '😨', '😰', '😥', '😭', '🥺', '😢', '😞', '😔', '👀', '👁️', '👅', '👄',
        '👋', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✊', '👊', '🤛', '🤜', '👏',
        '🙌', '🤝', '🙏', '💪', '🦾', '🫶', '🤲', '✍️', '💅', '🤳', '💯', '💢', '💥', '💫', '💦', '💨'];

      QWAS.Modals.openEmojiPicker(fullEmojis, (emoji) => {
        this.select(emoji);
      });
    },

    select(emoji) {
      if (!this.activeMessageId) return;
      this.toggle(this.activeMessageId, emoji);
      this.hide();
    },

    toggle(messageId, emoji) {
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('react_message', { messageId, emoji });
      }
    }
  };

  QWAS.Reactions = Reactions;
})();
