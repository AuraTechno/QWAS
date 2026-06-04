(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Composer = {
    init() {
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

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.emoji-panel') && !e.target.closest('#emojiBtn')) {
          this.hideEmojiPanel();
        }
        if (!e.target.closest('.attach-menu') && !e.target.closest('#attachBtn')) {
          this.hideAttachMenu();
        }
      });

      const wrapper = document.getElementById('messagesWrapper');
      if (wrapper) {
        wrapper.addEventListener('scroll', QWAS.Util.throttle(() => {
          this.onScroll();
        }, 100));
      }

      this.initVoiceRecord();
    },

    initVoiceRecord() {
      const recordBtn = document.getElementById('recordBtn');
      if (!recordBtn) return;

      const startHandler = (e) => QWAS.Voice.start(e);
      const endHandler = (e) => {
        if (!QWAS.State.recording) return;
        if (QWAS.Voice.locked) return;
        QWAS.Voice.stop();
      };
      const moveHandler = (e) => QWAS.Voice.move(e);

      recordBtn.addEventListener('mousedown', startHandler);
      recordBtn.addEventListener('mouseup', endHandler);
      recordBtn.addEventListener('mouseleave', endHandler);
      recordBtn.addEventListener('mousemove', moveHandler);
      recordBtn.addEventListener('touchstart', startHandler, { passive: false });
      recordBtn.addEventListener('touchend', endHandler, { passive: false });
      recordBtn.addEventListener('touchmove', moveHandler, { passive: false });
      recordBtn.addEventListener('touchcancel', () => QWAS.Voice.cancel());

      const modeBtn = document.getElementById('recordModeBtn');
      if (modeBtn) {
        modeBtn.addEventListener('click', () => {
          const next = QWAS.Voice.mode === 'voice' ? 'video' : 'voice';
          QWAS.Voice.setMode(next);
          modeBtn.classList.toggle('video-mode', next === 'video');
          modeBtn.title = next === 'video' ? 'Режим: видео (нажмите для голоса)' : 'Режим: голос (нажмите для видео)';
          try { localStorage.setItem('qwas_record_mode', next); } catch {}
        });
        const saved = (() => { try { return localStorage.getItem('qwas_record_mode'); } catch { return null; } })();
        if (saved === 'video') QWAS.Voice.setMode('video');
        if (QWAS.Voice.mode === 'video') {
          modeBtn.classList.add('video-mode');
          modeBtn.title = 'Режим: видео (нажмите для голоса)';
        } else {
          modeBtn.title = 'Режим: голос (нажмите для видео)';
        }
      }
    },

    autoresize() {
      const ta = document.getElementById('msgInput');
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    },

    onScroll() {
      const wrap = document.getElementById('messagesWrapper');
      if (!wrap) return;
      if (wrap.scrollTop < 50 && QWAS.State.hasMore && !QWAS.State.loadingMore) {
        this.loadMore();
      }
      const isNearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 120;
      if (isNearBottom) QWAS.ScrollButton.hide();
    },

    loadMore() {
      QWAS.State.loadingMore = true;
      QWAS.Messages.saveScrollPosition();
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('load_more', (resp) => {
          if (resp && resp.messages) {
            QWAS.State.hasMore = resp.hasMore;
            QWAS.State.messagesByChat.set(
              QWAS.State.current,
              [...(resp.messages || []), ...(QWAS.State.messagesByChat.get(QWAS.State.current) || [])]
            );
            QWAS.Messages.renderAll(QWAS.State.messagesByChat.get(QWAS.State.current) || []);
            QWAS.Messages.restoreScrollPosition();
            QWAS.State.loadingMore = false;
          } else {
            QWAS.State.loadingMore = false;
          }
        });
      }
    },

    updateSendButton() {
      const ta = document.getElementById('msgInput');
      const send = document.getElementById('sendBtn');
      const record = document.getElementById('recordBtn');
      if (!ta || !send || !record) return;

      const hasText = ta.value.trim().length > 0;
      const hasFiles = QWAS.State.pendingFiles.length > 0;

      if (hasText || hasFiles) {
        send.style.display = 'flex';
        record.style.display = 'none';
      } else {
        send.style.display = 'none';
        record.style.display = 'flex';
      }
    },

    onTyping() {
      if (!QWAS.State.current || QWAS.State.current === QWAS.Config.FAVORITE_CHAT_ID) return;
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('typing', QWAS.State.current);
        clearTimeout(QWAS.State.typingTimeout);
        QWAS.State.typingTimeout = setTimeout(() => {
          QWAS.State.socket.emit('stop_typing', QWAS.State.current);
        }, QWAS.Config.TYPING_TIMEOUT);
      }
    },

    toggleAttach() {
      const m = document.getElementById('attachMenu');
      if (!m) return;
      const show = m.style.display === 'none';
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
      const show = p.style.display === 'none';
      this.hideAttachMenu();
      p.style.display = show ? 'flex' : 'none';
      if (show) {
        QWAS.Emoji.populate();
        setTimeout(() => {
          const search = document.getElementById('emojiSearch');
          if (search) search.focus();
        }, 50);
      }
    },

    hideEmojiPanel() {
      const p = document.getElementById('emojiPanel');
      if (p) p.style.display = 'none';
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
      container.innerHTML = atts.map((a, i) => {
        if (a.uploading) {
          return `<div class="composer-att composer-att-uploading">
            <div class="composer-att-progress">
              <div class="composer-att-progress-bar" style="width:${Math.round((a.progress || 0) * 100)}%"></div>
            </div>
            <div class="composer-att-name">${QWAS.Util.escapeHtml(a.name || 'файл')} · ${Math.round((a.progress || 0) * 100)}%</div>
            <button class="composer-att-remove" onclick="QWAS.State.pendingFiles.splice(${i},1);QWAS.Composer.renderAttachments()">✕</button>
          </div>`;
        }
        if (a.type === 'image') {
          return `<div class="composer-att">
            <img src="${QWAS.Util.escapeAttr(a.url)}" alt="">
            <button class="composer-att-remove" onclick="QWAS.Composer.removeAttachment(${i})">✕</button>
          </div>`;
        }
        if (a.type === 'round') {
          return `<div class="composer-att composer-att-round">
            <video src="${QWAS.Util.escapeAttr(a.url)}" muted playsinline></video>
            <span class="composer-att-label">⭕ Кружок</span>
            <button class="composer-att-remove" onclick="QWAS.Composer.removeAttachment(${i})">✕</button>
          </div>`;
        }
        if (a.type === 'video') {
          return `<div class="composer-att">
            <video src="${QWAS.Util.escapeAttr(a.url)}" muted></video>
            <span class="composer-att-label">🎥 ${QWAS.Util.escapeHtml(a.name || 'Видео')}</span>
            <button class="composer-att-remove" onclick="QWAS.Composer.removeAttachment(${i})">✕</button>
          </div>`;
        }
        if (a.type === 'voice') {
          return `<div class="composer-att">
            <div class="composer-att-icon">🎤</div>
            <span class="composer-att-label">Голосовое ${a.duration ? QWAS.Util.formatDuration(a.duration) : ''}</span>
            <button class="composer-att-remove" onclick="QWAS.Composer.removeAttachment(${i})">✕</button>
          </div>`;
        }
        if (a.type === 'location') {
          return `<div class="composer-att">
            <div class="composer-att-icon">📍</div>
            <span class="composer-att-label">${QWAS.Util.escapeHtml(a.name || 'Местоположение')}</span>
            <button class="composer-att-remove" onclick="QWAS.Composer.removeAttachment(${i})">✕</button>
          </div>`;
        }
        return `<div class="composer-att">
          <div class="composer-att-icon">📎</div>
          <span class="composer-att-label">${QWAS.Util.escapeHtml(a.name || 'Файл')}</span>
          <button class="composer-att-remove" onclick="QWAS.Composer.removeAttachment(${i})">✕</button>
        </div>`;
      }).join('');
    },

    removeAttachment(i) {
      QWAS.State.pendingFiles.splice(i, 1);
      this.renderAttachments();
      this.updateSendButton();
    },

    enterEditMode(msg) {
      const ta = document.getElementById('msgInput');
      if (!ta) return;
      QWAS.State.editingId = msg._id;
      ta.value = msg.message || '';
      ta.placeholder = 'Редактирование...';
      this.updateSendButton();
      ta.focus();
      const composer = document.querySelector('.composer');
      if (composer) composer.classList.add('editing');
    },

    exitEditMode() {
      const ta = document.getElementById('msgInput');
      if (ta) {
        ta.value = '';
        ta.placeholder = 'Сообщение';
      }
      const composer = document.querySelector('.composer');
      if (composer) composer.classList.remove('editing');
    }
  };

  QWAS.Composer = Composer;
  QWAS.ReplyPreview = {
    show(reply) {
      const pr = document.getElementById('replyPreview');
      if (!pr) return;
      const name = reply.from === QWAS.State.me ? 'Вы' : QWAS.Util.getUserDisplayName({ username: reply.from }) || reply.from;
      const text = reply.message || (reply.attachments?.length ? '📎 Вложение' : '');
      document.getElementById('replyAuthor').textContent = name;
      document.getElementById('replyText').textContent = text;
      pr.style.display = 'flex';
    },
    hide() {
      const pr = document.getElementById('replyPreview');
      if (pr) pr.style.display = 'none';
    }
  };
})();
