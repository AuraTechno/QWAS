// Рендер сообщений, отправка, лоадмор, реакции, удаление, редактирование
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Messages = {
    init() {
      this.bindScroll();
      this.bindScrollButton();
      this.bindGlobalClick();
    },

    bindScroll() {
      const wrap = document.getElementById('messagesWrapper');
      if (!wrap) return;
      wrap.addEventListener('scroll', QWAS.Util.throttle(() => this.onScroll(), 120));
    },

    bindScrollButton() {
      const btn = document.getElementById('scrollToBottom');
      if (btn) btn.addEventListener('click', () => this.scrollToBottom(true));
    },

    bindGlobalClick() {
      // Клики внутри сообщений
      const list = document.getElementById('messages');
      if (!list) return;
      list.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (action) {
          const a = action.dataset.action;
          const id = action.dataset.id;
          if (a === 'edit' && id) this.editMessage(parseInt(id));
          else if (a === 'delete' && id) this.confirmDelete(parseInt(id));
          else if (a === 'reply' && id) this.replyTo(parseInt(id));
          else if (a === 'forward' && id) this.forwardMessage(parseInt(id));
          else if (a === 'copy' && id) this.copyMessage(parseInt(id));
          else if (a === 'select' && id) this.selectMessage(parseInt(id));
          else if (a === 'pin' && id) this.pinMessage(parseInt(id));
          else if (a === 'react' && id) {
            const emoji = action.dataset.emoji || '👍';
            this.toggleReaction(parseInt(id), emoji);
          }
          return;
        }
        // Клик по картинке — lightbox
        const img = e.target.closest('img.msg-image');
        if (img) {
          if (QWAS.Lightbox) QWAS.Lightbox.open(img.src, img.alt);
          return;
        }
        // Клик по голосовому — play
        const playBtn = e.target.closest('[data-play-voice]');
        if (playBtn) {
          this.playVoice(playBtn);
          return;
        }
        // Клик по reply
        const reply = e.target.closest('[data-scroll-to]');
        if (reply) {
          this.scrollToMessage(parseInt(reply.dataset.scrollTo));
          return;
        }
        // Клик по attachment для скачивания
        const att = e.target.closest('[data-download]');
        if (att) {
          this.downloadAttachment(att.dataset.download, att.dataset.name);
        }
      });
    },

    // === Загрузка истории ===
    async loadInitial(chatId) {
      const r = await QWAS.API.chatMessages(chatId, { limit: 30 });
      if (!r || !r.ok) {
        QWAS.Toast.error(r && r.error ? r.error : 'Не удалось загрузить сообщения');
        return;
      }
      QWAS.State.messagesByChat.set(chatId, r.messages || []);
      QWAS.State.hasMoreByChat.set(chatId, r.hasMore !== false);
      this.renderAll(chatId);
    },

    async loadMore(chatId) {
      if (QWAS.State.loadingMore) return;
      const list = QWAS.State.messagesByChat.get(chatId) || [];
      if (!list.length) return;
      if (!QWAS.State.hasMoreByChat.get(chatId)) return;
      QWAS.State.loadingMore = true;
      this.saveScrollPosition(chatId);
      try {
        const first = list[0];
        const r = await QWAS.API.chatMessages(chatId, { beforeId: first.id, limit: 30 });
        if (r && r.ok) {
          const newMsgs = r.messages || [];
          QWAS.State.messagesByChat.set(chatId, [...newMsgs, ...list]);
          QWAS.State.hasMoreByChat.set(chatId, r.hasMore !== false);
          this.renderAll(chatId);
          this.restoreScrollPosition();
        }
      } finally {
        QWAS.State.loadingMore = false;
      }
    },

    saveScrollPosition(chatId) {
      const wrap = document.getElementById('messagesWrapper');
      if (!wrap) return;
      const list = QWAS.State.messagesByChat.get(chatId) || [];
      const firstId = list[0] && list[0].id;
      this._savedScroll = {
        scrollHeight: wrap.scrollHeight,
        scrollTop: wrap.scrollTop,
        firstId
      };
    },

    restoreScrollPosition() {
      const wrap = document.getElementById('messagesWrapper');
      if (!wrap || !this._savedScroll) return;
      const delta = wrap.scrollHeight - this._savedScroll.scrollHeight;
      wrap.scrollTop = this._savedScroll.scrollTop + delta;
    },

    onScroll() {
      const wrap = document.getElementById('messagesWrapper');
      if (!wrap) return;
      if (wrap.scrollTop < 80 && QWAS.State.current) {
        this.loadMore(QWAS.State.current);
      }
      const isNearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 150;
      const btn = document.getElementById('scrollToBottom');
      if (btn) btn.style.display = isNearBottom ? 'none' : 'flex';
    },

    // === Рендер ===
    renderAll(chatId) {
      const list = document.getElementById('messages');
      if (!list) return;
      const arr = QWAS.State.messagesByChat.get(chatId) || [];
      list.innerHTML = this.renderGrouped(arr, chatId);
    },

    renderGrouped(messages, chatId) {
      if (!messages.length) {
        return '<div class="messages-empty">Нет сообщений — начните беседу</div>';
      }
      // Группируем по дате
      const out = [];
      let lastDate = '';
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const dateLabel = this.formatDateLabel(m.createdAt);
        if (dateLabel !== lastDate) {
          out.push(`<div class="messages-date-sep"><span>${QWAS.Util.escapeHtml(dateLabel)}</span></div>`);
          lastDate = dateLabel;
        }
        out.push(this.renderOne(m, messages[i - 1], messages[i + 1]));
      }
      return out.join('');
    },

    formatDateLabel(d) {
      if (!d) return '';
      const date = new Date(d);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const diff = (today - msgDay) / (1000 * 60 * 60 * 24);
      if (diff < 1 && msgDay.getTime() === today.getTime()) return 'Сегодня';
      if (diff < 2 && msgDay.getTime() === today.getTime() - 86400000) return 'Вчера';
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    },

    renderOne(m, prev, next) {
      if (m.isDeleted) return this.renderDeleted(m);
      const me = QWAS.State.me;
      const isMine = me && (m.fromId === me.id || m.fromUsername === me.username);
      const from = m.fromUsername || m.fromId;
      const fromName = isMine ? 'Вы' : (m.fromFirstName || m.fromUsername || '...');
      // Группировка: показываем аватарку только у первого подряд
      const prevIsSame = prev && !prev.isDeleted && prev.fromId === m.fromId && (new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000);
      const nextIsSame = next && !next.isDeleted && next.fromId === m.fromId && (new Date(next.createdAt) - new Date(m.createdAt) < 5 * 60 * 1000);
      const showAvatar = !isMine && !prevIsSame;
      const showName = !isMine && !prevIsSame;
      const compact = !isMine && prevIsSame;

      const avatar = compact ? '<div class="msg-avatar-spacer"></div>'
        : (isMine ? '<div class="msg-avatar-spacer"></div>'
        : QWAS.Util.avatarHtml({ firstName: m.fromFirstName, lastName: m.fromLastName, username: m.fromUsername }, 32));

      const time = new Date(m.createdAt).toTimeString().slice(0, 5);
      const editedMark = m.isEdited ? '<span class="msg-edited">ред.</span>' : '';
      const status = isMine ? this._renderStatus(m) : '';

      const body = this.renderBody(m);
      const reply = m.replySnapshot ? this.renderReply(m.replySnapshot) : (m.replyToId ? this.renderReplyStub(m.replyToId) : '');
      const fwd = m.forwardedFromName ? `<div class="msg-forwarded">Переслано от <b>${QWAS.Util.escapeHtml(m.forwardedFromName)}</b></div>` : '';

      const reactionsHtml = this.renderReactions(m);

      const attachmentsHtml = this.renderAttachments(m);

      const contextActions = `
        <div class="msg-actions">
          <button class="msg-action" data-action="react" data-id="${m.id}" data-emoji="👍" title="Реакция">👍</button>
          <button class="msg-action" data-action="reply" data-id="${m.id}" title="Ответить">↩</button>
          <button class="msg-action" data-action="copy" data-id="${m.id}" title="Копировать">📋</button>
          ${isMine ? `<button class="msg-action" data-action="edit" data-id="${m.id}" title="Редактировать">✎</button>
                      <button class="msg-action" data-action="delete" data-id="${m.id}" title="Удалить">🗑</button>` : ''}
          <button class="msg-action" data-action="forward" data-id="${m.id}" title="Переслать">↗</button>
          <button class="msg-action" data-action="pin" data-id="${m.id}" title="Закрепить">📌</button>
        </div>`;

      const cls = [
        'msg',
        isMine ? 'msg-out' : 'msg-in',
        compact ? 'msg-compact' : '',
        nextIsSame ? 'msg-last-in-group' : ''
      ].filter(Boolean).join(' ');

      return `<div class="${cls}" data-msg-id="${m.id}">
        <div class="msg-avatar">${avatar}</div>
        <div class="msg-bubble-wrap">
          ${showName ? `<div class="msg-author">${QWAS.Util.escapeHtml(fromName)}</div>` : ''}
          <div class="msg-bubble">
            ${fwd}
            ${reply}
            ${attachmentsHtml}
            ${body}
            <div class="msg-meta">
              <span class="msg-time">${time}</span>
              ${editedMark}
              ${status}
            </div>
            ${contextActions}
          </div>
          ${reactionsHtml}
        </div>
      </div>`;
    },

    renderDeleted(m) {
      const me = QWAS.State.me;
      const isMine = me && (m.fromId === me.id || m.fromUsername === me.username);
      return `<div class="msg msg-deleted ${isMine ? 'msg-out' : 'msg-in'}" data-msg-id="${m.id}">
        <div class="msg-avatar-spacer"></div>
        <div class="msg-bubble msg-bubble-deleted">
          <i>Сообщение удалено</i>
        </div>
      </div>`;
    },

    renderReply(snap) {
      if (!snap) return '';
      const name = snap.fromUsername === QWAS.State.me?.username ? 'Вы' : (snap.fromFirstName || snap.fromUsername);
      const text = snap.text || (snap.attachments ? '📎 Вложение' : '...');
      return `<div class="msg-reply">
        <div class="msg-reply-author">${QWAS.Util.escapeHtml(name)}</div>
        <div class="msg-reply-text">${QWAS.Util.escapeHtml(text)}</div>
      </div>`;
    },

    renderReplyStub(replyToId) {
      return `<div class="msg-reply msg-reply-stub" data-scroll-to="${replyToId}">
        <div class="msg-reply-author">↩ Ответ</div>
      </div>`;
    },

    renderBody(m) {
      if (!m.text) return '';
      // Просто экранируем и сохраняем переносы строк
      return `<div class="msg-text">${this.formatText(m.text)}</div>`;
    },

    formatText(text) {
      if (!text) return '';
      let safe = QWAS.Util.escapeHtml(text);
      // URL → ссылки
      safe = safe.replace(/(https?:\/\/[^\s<]+)/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);
      // @username → упоминание
      safe = safe.replace(/(^|\s)@([a-z0-9_]{3,32})/gi, '$1<span class="msg-mention">@$2</span>');
      // Переносы строк
      safe = safe.replace(/\n/g, '<br>');
      return safe;
    },

    renderAttachments(m) {
      if (!m.attachments || !m.attachments.length) return '';
      const out = [];
      for (const a of m.attachments) {
        if (m.type === 'image' || a.type === 'image') {
          out.push(`<img class="msg-image" src="${QWAS.Util.escapeAttr(a.url)}" alt="${QWAS.Util.escapeAttr(a.name || '')}" loading="lazy">`);
        } else if (m.type === 'round' || a.type === 'round') {
          out.push(`<div class="msg-round" data-play-voice>
            <video src="${QWAS.Util.escapeAttr(a.url)}" playsinline></video>
            <button class="msg-round-play">▶</button>
            <span class="msg-round-label">⭕ Видеосообщение</span>
          </div>`);
        } else if (m.type === 'voice' || a.type === 'voice') {
          const dur = a.duration ? QWAS.Util.formatDuration(a.duration) : '';
          out.push(`<div class="msg-voice" data-play-voice>
            <button class="msg-voice-play">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            </button>
            <div class="msg-voice-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
            <div class="msg-voice-time">${dur}</div>
          </div>`);
        } else if (m.type === 'video' || a.type === 'video') {
          out.push(`<video class="msg-video" src="${QWAS.Util.escapeAttr(a.url)}" controls playsinline></video>`);
        } else if (m.type === 'location' || a.type === 'location') {
          const lat = (a.lat || m.locationData?.lat);
          const lng = (a.lng || m.locationData?.lng);
          if (lat != null && lng != null) {
            const mapUrl = `https://yandex.ru/maps/?text=${lat},${lng}`;
            out.push(`<a class="msg-location" href="${mapUrl}" target="_blank" rel="noopener">
              <div class="msg-location-icon">📍</div>
              <div class="msg-location-text">${QWAS.Util.escapeHtml(a.name || 'Местоположение')}</div>
              <div class="msg-location-coords">${lat.toFixed ? lat.toFixed(5) : lat}, ${lng.toFixed ? lng.toFixed(5) : lng}</div>
            </a>`);
          }
        } else if (m.type === 'contact' || a.type === 'contact') {
          const c = m.contactData || {};
          out.push(`<div class="msg-contact">
            <div class="msg-contact-avatar">${QWAS.Util.getInitials(c.firstName, c.lastName)}</div>
            <div>
              <div class="msg-contact-name">${QWAS.Util.escapeHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</div>
              ${c.phone ? `<div class="msg-contact-phone">${QWAS.Util.escapeHtml(c.phone)}</div>` : ''}
            </div>
          </div>`);
        } else if (m.type === 'poll' || a.type === 'poll') {
          const p = m.pollData || a.pollData || {};
          out.push(this.renderPoll(m.id, p, !!m.pollVoted));
        } else {
          // file
          out.push(`<a class="msg-file" href="${QWAS.Util.escapeAttr(a.url)}" target="_blank" rel="noopener" data-download="${QWAS.Util.escapeAttr(a.url)}" data-name="${QWAS.Util.escapeAttr(a.name || 'файл')}">
            <div class="msg-file-icon">📎</div>
            <div class="msg-file-info">
              <div class="msg-file-name">${QWAS.Util.escapeHtml(a.name || 'файл')}</div>
              <div class="msg-file-size">${QWAS.Util.formatBytes(a.size)}</div>
            </div>
            <button class="msg-file-download">⬇</button>
          </a>`);
        }
      }
      return `<div class="msg-attachments">${out.join('')}</div>`;
    },

    renderPoll(messageId, poll, voted) {
      const opts = poll.options || [];
      const total = opts.reduce((s, o) => s + (o.votes || 0), 0);
      return `<div class="msg-poll">
        <div class="msg-poll-q">${QWAS.Util.escapeHtml(poll.question || 'Опрос')}</div>
        ${opts.map((o, i) => {
          const pct = total > 0 ? Math.round((o.votes || 0) / total * 100) : 0;
          const isVoted = voted && voted === i;
          return `<div class="msg-poll-opt ${isVoted ? 'voted' : ''}" data-poll-vote="${i}">
            <div class="msg-poll-bar" style="width:${pct}%"></div>
            <div class="msg-poll-label">${QWAS.Util.escapeHtml(o.text)} <span class="msg-poll-pct">${pct}%</span></div>
          </div>`;
        }).join('')}
        <div class="msg-poll-total">${total} голос${total === 1 ? '' : (total >= 2 && total <= 4 ? 'а' : 'ов')}</div>
      </div>`;
    },

    renderReactions(m) {
      if (!m.reactions) return '';
      const emojis = Object.keys(m.reactions);
      if (!emojis.length) return '';
      return `<div class="msg-reactions">
        ${emojis.map(e => {
          const users = m.reactions[e] || [];
          return `<button class="msg-reaction" data-action="react" data-id="${m.id}" data-emoji="${e}">${e} <span>${users.length}</span></button>`;
        }).join('')}
      </div>`;
    },

    _renderStatus(m) {
      // status: sending / sent / read
      let cls = 'msg-status-pending';
      if (m._status === 'sent') cls = 'msg-status-sent';
      if (m._status === 'read') cls = 'msg-status-read';
      if (m._status === 'failed') cls = 'msg-status-failed';
      return `<span class="msg-status ${cls}">${m._status === 'failed' ? '✕' : (m._status === 'read' ? '✓✓' : '✓')}</span>`;
    },

    // === События сокета ===
    onIncoming(msg) {
      if (!msg || !msg.chatId) return;
      const chatId = msg.chatId;
      const me = QWAS.State.me;
      const isMine = me && (msg.fromId === me.id || msg.fromUsername === me.username);

      const list = QWAS.State.messagesByChat.get(chatId) || [];
      // Дедупликация по id (если уже есть)
      if (list.find(m => m.id === msg.id)) {
        return;
      }
      // Если это наше собственное — заменяем временный (по text + createdAt близко)
      if (isMine) {
        const tmpIdx = list.findIndex(m => m._tmp && m.text === msg.text && Math.abs(new Date(m.createdAt) - new Date(msg.createdAt)) < 30000);
        if (tmpIdx >= 0) {
          list[tmpIdx] = msg;
          QWAS.State.messagesByChat.set(chatId, list);
          if (QWAS.State.current === chatId) this.renderAll(chatId);
          return;
        }
      }
      list.push(msg);
      QWAS.State.messagesByChat.set(chatId, list);

      // Если чат открыт — рендерим и скроллим
      if (QWAS.State.current === chatId) {
        // Удалим заглушку "Нет сообщений"
        this.renderAll(chatId);
        // Скроллим только если юзер был внизу или сообщение от собеседника
        if (!isMine) this.scrollToBottom(true);
        else {
          const wrap = document.getElementById('messagesWrapper');
          const nearBottom = wrap && (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 200);
          if (nearBottom) this.scrollToBottom(true);
        }
        // Mark as read
        QWAS.Chats.markRead(chatId);
      } else {
        // Обновим список чатов (счётчик непрочитанных)
        QWAS.Chats.reload();
      }
    },

    onEdited(msg) {
      if (!msg || !msg.chatId) return;
      const list = QWAS.State.messagesByChat.get(msg.chatId) || [];
      const idx = list.findIndex(m => m.id === msg.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...msg };
        QWAS.State.messagesByChat.set(msg.chatId, list);
        if (QWAS.State.current === msg.chatId) this.renderAll(msg.chatId);
      }
    },

    onDeleted(data) {
      if (!data) return;
      const list = QWAS.State.messagesByChat.get(data.chatId) || [];
      const idx = list.findIndex(m => m.id === data.messageId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], isDeleted: true, text: null, attachments: [] };
        QWAS.State.messagesByChat.set(data.chatId, list);
        if (QWAS.State.current === data.chatId) this.renderAll(data.chatId);
      }
    },

    onReadReceipt(data) {
      if (!data) return;
      const list = QWAS.State.messagesByChat.get(data.chatId) || [];
      let changed = false;
      for (const m of list) {
        if (m.fromUsername === QWAS.State.me?.username && m.id <= data.messageId) {
          m._status = 'read';
          changed = true;
        }
      }
      if (changed && QWAS.State.current === data.chatId) this.renderAll(data.chatId);
    },

    onReaction(data) {
      if (!data) return;
      const list = QWAS.State.messagesByChat.get(data.chatId) || [];
      const m = list.find(x => x.id === data.messageId);
      if (m) {
        m.reactions = data.reactions || {};
        if (QWAS.State.current === data.chatId) this.renderAll(data.chatId);
      }
    },

    updateOnline() {
      // обновим индикатор "в сети" в шапке и в списке
      QWAS.Chat && QWAS.Chat.renderHeader && QWAS.State.currentChatInfo && QWAS.Chat.renderHeader(QWAS.State.currentChatInfo);
      QWAS.Chats && QWAS.Chats.render();
    },

    // === Действия ===
    scrollToBottom(force) {
      const wrap = document.getElementById('messagesWrapper');
      if (!wrap) return;
      if (force) {
        wrap.scrollTop = wrap.scrollHeight;
      } else {
        QWAS.Util.throttle(() => { wrap.scrollTop = wrap.scrollHeight; }, 50)();
      }
      const btn = document.getElementById('scrollToBottom');
      if (btn) btn.style.display = 'none';
    },

    scrollToMessage(id) {
      const el = document.querySelector(`[data-msg-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    async send() {
      if (!QWAS.State.current) return;
      const chatId = QWAS.State.current;
      const me = QWAS.State.me;
      if (!me) return;

      const ta = document.getElementById('msgInput');
      const text = (ta?.value || '').trim();
      const files = QWAS.State.pendingFiles.slice();
      if (!text && !files.length && !QWAS.State.editingId) return;

      // === Редактирование ===
      if (QWAS.State.editingId) {
        if (!text) return;
        const r = await new Promise((resolve) => {
          if (QWAS.State.socket) {
            QWAS.State.socket.emit('edit_message', { messageId: QWAS.State.editingId, text }, resolve);
          } else {
            QWAS.API.patch(`/messages/${QWAS.State.editingId}`, { text }).then(resolve);
          }
        });
        if (r && r.ok) {
          ta.value = '';
          QWAS.State.editingId = null;
          document.getElementById('composer')?.classList.remove('editing');
        } else {
          QWAS.Toast.error(r && r.error ? r.error : 'Не удалось отредактировать');
        }
        QWAS.Composer.updateSendButton();
        return;
      }

      // === Отправка ===
      // Соберём attachments
      const attachments = [];
      for (const f of files) {
        if (f.uploading) {
          QWAS.Toast.warn('Дождитесь загрузки файлов');
          return;
        }
        attachments.push({
          url: f.url, name: f.name, size: f.size, mime: f.mime, type: f.type, duration: f.duration
        });
      }

      const type = QWAS.Composer.detectMessageType(text, files);

      // Создаём временное сообщение
      const tmpMsg = {
        id: 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        _tmp: true,
        _status: 'pending',
        chatId,
        fromId: me.id,
        fromUsername: me.username,
        fromFirstName: me.firstName,
        fromLastName: me.lastName,
        text,
        type,
        attachments: attachments.slice(),
        replyToId: QWAS.State.replyingTo?.id || null,
        replySnapshot: QWAS.State.replyingTo ? {
          fromUsername: QWAS.State.replyingTo.fromUsername,
          fromFirstName: QWAS.State.replyingTo.fromFirstName,
          text: QWAS.State.replyingTo.text,
          attachments: QWAS.State.replyingTo.attachments
        } : null,
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString()
      };
      const list = QWAS.State.messagesByChat.get(chatId) || [];
      list.push(tmpMsg);
      QWAS.State.messagesByChat.set(chatId, list);
      this.renderAll(chatId);
      this.scrollToBottom(true);

      // Очистим инпут
      if (ta) ta.value = '';
      QWAS.Composer.autoresize();
      QWAS.State.pendingFiles = [];
      QWAS.State.replyingTo = null;
      QWAS.Composer.renderAttachments();
      QWAS.Composer.updateSendButton();
      QWAS.Composer.hideReplyPreview();

      // Отправляем через сокет
      const payload = {
        chatId,
        text,
        type,
        attachments,
        replyToId: tmpMsg.replyToId,
        replySnapshot: tmpMsg.replySnapshot
      };
      if (type === 'location' && files[0]?.lat != null) {
        payload.locationData = { lat: files[0].lat, lng: files[0].lng, name: files[0].name };
      }
      if (type === 'contact' && files[0]?.contactData) {
        payload.contactData = files[0].contactData;
      }
      if (type === 'poll' && files[0]?.pollData) {
        payload.pollData = files[0].pollData;
      }

      const r = await new Promise((resolve) => {
        if (QWAS.State.socket) {
          QWAS.State.socket.emit('send_message', payload, resolve);
        } else {
          QWAS.Toast.error('Нет соединения с сервером');
          tmpMsg._status = 'failed';
          this.renderAll(chatId);
          resolve({ ok: false });
        }
      });
      if (r && r.ok) {
        tmpMsg._status = 'sent';
        tmpMsg.id = r.messageId;
        tmpMsg.createdAt = r.createdAt;
        // перерендерим для отображения статуса
        const list2 = QWAS.State.messagesByChat.get(chatId) || [];
        const idx = list2.findIndex(m => m.id === tmpMsg.id);
        if (idx >= 0) list2[idx] = { ...list2[idx], ...tmpMsg };
        QWAS.State.messagesByChat.set(chatId, list2);
        this.renderAll(chatId);
      } else {
        tmpMsg._status = 'failed';
        QWAS.Toast.error(r && r.error ? r.error : 'Не удалось отправить');
        this.renderAll(chatId);
      }
    },

    editMessage(id) {
      const chatId = QWAS.State.current;
      if (!chatId) return;
      const m = (QWAS.State.messagesByChat.get(chatId) || []).find(x => x.id === id);
      if (!m) return;
      QWAS.Composer.enterEditMode(m);
    },

    confirmDelete(id) {
      if (!confirm('Удалить сообщение?')) return;
      this.deleteMessage(id);
    },

    async deleteMessage(id) {
      if (QWAS.State.socket) {
        QWAS.State.socket.emit('delete_message', { messageId: id });
      }
    },

    replyTo(id) {
      const chatId = QWAS.State.current;
      if (!chatId) return;
      const m = (QWAS.State.messagesByChat.get(chatId) || []).find(x => x.id === id);
      if (!m) return;
      QWAS.State.replyingTo = m;
      QWAS.Composer.showReplyPreview(m);
    },

    async forwardMessage(id) {
      const chatId = QWAS.State.current;
      const m = (QWAS.State.messagesByChat.get(chatId) || []).find(x => x.id === id);
      if (!m) return;
      // Открываем модалку выбора чата
      if (QWAS.Modals) QWAS.Modals.openForward(m);
    },

    async copyMessage(id) {
      const chatId = QWAS.State.current;
      const m = (QWAS.State.messagesByChat.get(chatId) || []).find(x => x.id === id);
      if (!m || !m.text) return;
      try {
        await navigator.clipboard.writeText(m.text);
        QWAS.Toast.success('Скопировано');
      } catch {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = m.text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); QWAS.Toast.success('Скопировано'); } catch {}
        ta.remove();
      }
    },

    selectMessage(id) {
      // TODO: режим выделения
    },

    async pinMessage(id) {
      const chatId = QWAS.State.current;
      if (!chatId) return;
      // Закреп на уровне чата (через socket/API)
      if (QWAS.Modals) QWAS.Modals.openPinMessage(chatId, id);
    },

    async toggleReaction(messageId, emoji) {
      if (QWAS.State.socket) {
        // Проверим, есть ли уже такая реакция
        const chatId = QWAS.State.current;
        const m = (QWAS.State.messagesByChat.get(chatId) || []).find(x => x.id === messageId);
        const has = m && m.reactions && m.reactions[emoji] && m.reactions[emoji].includes(QWAS.State.me?.id);
        QWAS.State.socket.emit(has ? 'remove_reaction' : 'add_reaction', { messageId, emoji });
      } else {
        QWAS.Toast.warn('Нет соединения');
      }
    },

    playVoice(btn) {
      const wrap = btn.closest('.msg-voice, .msg-round');
      if (!wrap) return;
      const video = wrap.querySelector('video');
      const audio = video || wrap.querySelector('audio') || new Audio();
      if (video && video.src) {
        if (video.paused) { video.play().catch(() => {}); btn.classList.add('playing'); }
        else { video.pause(); video.currentTime = 0; btn.classList.remove('playing'); }
        return;
      }
      const src = wrap.dataset.src;
      if (!audio.src && src) audio.src = src;
    },

    downloadAttachment(url, name) {
      const a = document.createElement('a');
      a.href = url;
      a.download = name || 'file';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },

    // Открыть панель быстрых реакций
    showReactionPicker(btn, messageId) {
      const panel = document.getElementById('reactionPopup');
      if (!panel) return;
      const rect = btn.getBoundingClientRect();
      panel.style.left = (rect.left - 100) + 'px';
      panel.style.top = (rect.top - 50) + 'px';
      panel.style.display = 'flex';
      panel.innerHTML = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏'].map(e =>
        `<button data-emoji="${e}">${e}</button>`
      ).join('');
      panel.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          this.toggleReaction(messageId, b.dataset.emoji);
          panel.style.display = 'none';
        });
      });
      setTimeout(() => {
        const onClick = (e) => {
          if (!panel.contains(e.target) && e.target !== btn) {
            panel.style.display = 'none';
            document.removeEventListener('click', onClick);
          }
        };
        document.addEventListener('click', onClick);
      }, 50);
    }
  };

  window.QWAS.Messages = Messages;
})();
