// Композер: ввод, send, кнопка записи, режим записи, вложения, превью ответа
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Composer = {
    mode: 'voice', // 'voice' | 'video'
    _resizeObs: null,

    init() {
      this.bindTextarea();
      this.bindSendButton();
      this.bindAttachButton();
      this.bindEmojiButton();
      this.bindRecordButton();
      this.bindModeButton();
      this.bindGlobalClick();
      this.bindReplyCancel();
      this.loadMode();
    },

    bindTextarea() {
      const ta = document.getElementById('msgInput');
      if (!ta) return;
      ta.addEventListener('input', () => {
        this.autoresize();
        this.updateSendButton();
        this.onTyping();
      });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && QWAS.State.settings.enterToSend) {
          e.preventDefault();
          QWAS.Messages.send();
        }
      });
      ta.addEventListener('focus', () => {
        this.hideEmojiPanel();
        this.hideAttachMenu();
      });
    },

    bindSendButton() {
      const send = document.getElementById('sendBtn');
      if (send) send.addEventListener('click', () => QWAS.Messages.send());
    },

    bindAttachButton() {
      const btn = document.getElementById('attachBtn');
      if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleAttach(); });
    },

    bindEmojiButton() {
      const btn = document.getElementById('emojiBtn');
      if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleEmoji(); });
    },

    bindRecordButton() {
      const btn = document.getElementById('recordBtn');
      if (!btn) return;
      const start = (e) => { e.preventDefault(); if (!QWAS.Voice) return; QWAS.Voice.start(e); };
      const end = (e) => {
        if (!QWAS.Voice || !QWAS.State.recording) return;
        if (QWAS.Voice.locked) return;
        e.preventDefault();
        QWAS.Voice.stop();
      };
      const move = (e) => { if (QWAS.Voice) QWAS.Voice.move(e); };
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', end);
      btn.addEventListener('mousemove', move);
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end, { passive: false });
      btn.addEventListener('touchmove', move, { passive: false });
      btn.addEventListener('touchcancel', () => QWAS.Voice && QWAS.Voice.cancel());
    },

    bindModeButton() {
      const btn = document.getElementById('recordModeBtn');
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const next = this.mode === 'voice' ? 'video' : 'voice';
        this.setMode(next);
      });
    },

    bindGlobalClick() {
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.emoji-panel') && !e.target.closest('#emojiBtn')) {
          this.hideEmojiPanel();
        }
        if (!e.target.closest('.attach-menu') && !e.target.closest('#attachBtn')) {
          this.hideAttachMenu();
        }
      });
    },

    bindReplyCancel() {
      const btn = document.getElementById('replyCancel');
      if (btn) btn.addEventListener('click', () => this.hideReplyPreview());
    },

    loadMode() {
      try {
        const m = localStorage.getItem('qwas_record_mode');
        if (m === 'video') this.setMode('video');
        else this.setMode('voice');
      } catch { this.setMode('voice'); }
    },

    setMode(mode) {
      this.mode = mode;
      const btn = document.getElementById('recordModeBtn');
      if (btn) {
        btn.classList.toggle('video-mode', mode === 'video');
        btn.title = mode === 'video' ? 'Режим: видео (нажмите для голоса)' : 'Режим: голос (нажмите для видео)';
      }
      const rec = document.getElementById('recordBtn');
      if (rec) rec.dataset.mode = mode;
      try { localStorage.setItem('qwas_record_mode', mode); } catch {}
    },

    autoresize() {
      const ta = document.getElementById('msgInput');
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    },

    updateSendButton() {
      const ta = document.getElementById('msgInput');
      const send = document.getElementById('sendBtn');
      const record = document.getElementById('recordBtn');
      if (!ta || !send || !record) return;
      const hasText = ta.value.trim().length > 0;
      const hasFiles = QWAS.State.pendingFiles.length > 0;
      const editing = !!QWAS.State.editingId;
      if (hasText || hasFiles || editing) {
        send.style.display = 'flex';
        record.style.display = 'none';
      } else {
        send.style.display = 'none';
        record.style.display = 'flex';
      }
    },

    onTyping() {
      if (!QWAS.State.current || !QWAS.State.socket) return;
      QWAS.State.socket.emit('typing', { chatId: QWAS.State.current });
      clearTimeout(QWAS.State._typingT);
      QWAS.State._typingT = setTimeout(() => {
        QWAS.State.socket && QWAS.State.socket.emit('stop_typing', { chatId: QWAS.State.current });
      }, 4000);
    },

    toggleAttach() {
      const m = document.getElementById('attachMenu');
      if (!m) return;
      const show = m.style.display === 'none' || !m.style.display;
      this.hideEmojiPanel();
      m.style.display = show ? 'grid' : 'none';
    },

    hideAttachMenu() {
      const m = document.getElementById('attachMenu');
      if (m) m.style.display = 'none';
    },

    toggleEmoji() {
      const p = document.getElementById('emojiPanel');
      if (!p) return;
      const show = p.style.display === 'none' || !p.style.display;
      this.hideAttachMenu();
      p.style.display = show ? 'flex' : 'none';
      if (show && QWAS.Emoji) {
        QWAS.Emoji.populate();
        setTimeout(() => document.getElementById('emojiSearch')?.focus(), 30);
      }
    },

    hideEmojiPanel() {
      const p = document.getElementById('emojiPanel');
      if (p) p.style.display = 'none';
    },

    showReplyPreview(m) {
      const pr = document.getElementById('replyPreview');
      if (!pr) return;
      const isMine = m.fromUsername === QWAS.State.me?.username;
      const name = isMine ? 'Вы' : (m.fromFirstName || m.fromUsername);
      const text = m.text || (m.attachments && m.attachments.length ? '📎 Вложение' : '...');
      const a = document.getElementById('replyAuthor');
      const t = document.getElementById('replyText');
      if (a) a.textContent = name;
      if (t) t.textContent = text;
      pr.style.display = 'flex';
      setTimeout(() => document.getElementById('msgInput')?.focus(), 30);
    },

    hideReplyPreview() {
      const pr = document.getElementById('replyPreview');
      if (pr) pr.style.display = 'none';
      QWAS.State.replyingTo = null;
    },

    renderAttachments() {
      let container = document.getElementById('composerAttachments');
      if (!container) {
        const composer = document.querySelector('.composer');
        if (!composer) return;
        container = document.createElement('div');
        container.id = 'composerAttachments';
        container.className = 'composer-attachments';
        composer.parentNode.insertBefore(container, composer);
      }
      const atts = QWAS.State.pendingFiles;
      if (!atts.length) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
      }
      container.style.display = 'flex';
      container.innerHTML = atts.map((a, i) => this._renderAttachment(a, i)).join('');

      // Навесим обработчики удаления
      container.querySelectorAll('[data-remove-att]').forEach(b => {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          const i = parseInt(b.dataset.removeAtt);
          QWAS.State.pendingFiles.splice(i, 1);
          this.renderAttachments();
          this.updateSendButton();
        });
      });
    },

    _renderAttachment(a, i) {
      if (a.uploading) {
        return `<div class="composer-att composer-att-uploading">
          <div class="composer-att-progress">
            <div class="composer-att-progress-bar" style="width:${Math.round((a.progress || 0) * 100)}%"></div>
          </div>
          <div class="composer-att-name">${QWAS.Util.escapeHtml(a.name || 'файл')} · ${Math.round((a.progress || 0) * 100)}%</div>
          <button class="composer-att-remove" data-remove-att="${i}">✕</button>
        </div>`;
      }
      if (a.type === 'image') {
        return `<div class="composer-att">
          <img src="${QWAS.Util.escapeAttr(a.url)}" alt="">
          <button class="composer-att-remove" data-remove-att="${i}">✕</button>
        </div>`;
      }
      if (a.type === 'round') {
        return `<div class="composer-att composer-att-round">
          <video src="${QWAS.Util.escapeAttr(a.url)}" muted playsinline></video>
          <span class="composer-att-label">⭕ Кружок</span>
          <button class="composer-att-remove" data-remove-att="${i}">✕</button>
        </div>`;
      }
      if (a.type === 'video') {
        return `<div class="composer-att">
          <video src="${QWAS.Util.escapeAttr(a.url)}" muted></video>
          <span class="composer-att-label">🎥 ${QWAS.Util.escapeHtml(a.name || 'Видео')}</span>
          <button class="composer-att-remove" data-remove-att="${i}">✕</button>
        </div>`;
      }
      if (a.type === 'voice') {
        return `<div class="composer-att">
          <div class="composer-att-icon">🎤</div>
          <span class="composer-att-label">Голосовое ${a.duration ? QWAS.Util.formatDuration(a.duration) : ''}</span>
          <button class="composer-att-remove" data-remove-att="${i}">✕</button>
        </div>`;
      }
      if (a.type === 'location') {
        return `<div class="composer-att">
          <div class="composer-att-icon">📍</div>
          <span class="composer-att-label">${QWAS.Util.escapeHtml(a.name || 'Местоположение')}</span>
          <button class="composer-att-remove" data-remove-att="${i}">✕</button>
        </div>`;
      }
      if (a.type === 'contact') {
        const c = a.contactData || {};
        return `<div class="composer-att">
          <div class="composer-att-icon">👤</div>
          <span class="composer-att-label">${QWAS.Util.escapeHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</span>
          <button class="composer-att-remove" data-remove-att="${i}">✕</button>
        </div>`;
      }
      return `<div class="composer-att">
        <div class="composer-att-icon">📎</div>
        <span class="composer-att-label">${QWAS.Util.escapeHtml(a.name || 'Файл')}</span>
        <button class="composer-att-remove" data-remove-att="${i}">✕</button>
      </div>`;
    },

    enterEditMode(msg) {
      QWAS.State.editingId = msg.id;
      const ta = document.getElementById('msgInput');
      if (ta) {
        ta.value = msg.text || '';
        ta.placeholder = 'Редактирование...';
        this.autoresize();
        ta.focus();
      }
      const composer = document.querySelector('.composer');
      if (composer) composer.classList.add('editing');
      this.updateSendButton();
    },

    exitEditMode() {
      QWAS.State.editingId = null;
      const ta = document.getElementById('msgInput');
      if (ta) { ta.value = ''; ta.placeholder = 'Сообщение'; this.autoresize(); }
      const composer = document.querySelector('.composer');
      if (composer) composer.classList.remove('editing');
      this.updateSendButton();
    },

    detectMessageType(text, files) {
      if (!files || !files.length) return 'text';
      const f = files[0];
      if (f.type === 'image') return 'image';
      if (f.type === 'video') return 'video';
      if (f.type === 'voice') return 'voice';
      if (f.type === 'round') return 'round';
      if (f.type === 'location') return 'location';
      if (f.type === 'contact') return 'contact';
      if (f.type === 'poll') return 'poll';
      return 'file';
    }
  };

  window.QWAS.Composer = Composer;
})();
