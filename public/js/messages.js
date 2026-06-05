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

      // === Двойной тап (custom, работает на mobile + desktop) ===
      const DOUBLE_TAP_DELAY = 280; // ms
      const TAP_MOVE_TOLERANCE = 10; // px
      const _lastTap = { id: null, t: 0, x: 0, y: 0 };
      const _handleTap = (e) => {
        const grp = e.target.closest('.message-group[data-msg-id]');
        if (!grp) return false;
        // Не открывать меню если кликнули по интерактивному элементу
        if (e.target.closest('[data-action], [data-play-voice], [data-scroll-to], [data-download], a, button, video, audio, input, textarea, .att-image, .att-voice, .att-round, .att-video, .att-file, .bubble-reply, .reaction')) {
          return false;
        }
        const id = parseInt(grp.dataset.msgId);
        const now = Date.now();
        const dx = Math.abs((e.clientX || 0) - _lastTap.x);
        const dy = Math.abs((e.clientY || 0) - _lastTap.y);
        const isDouble = _lastTap.id === id && (now - _lastTap.t) < DOUBLE_TAP_DELAY && dx < TAP_MOVE_TOLERANCE && dy < TAP_MOVE_TOLERANCE;
        _lastTap.id = id;
        _lastTap.t = now;
        _lastTap.x = e.clientX || 0;
        _lastTap.y = e.clientY || 0;
        if (isDouble) {
          _lastTap.id = null; // сброс чтобы не сработало 3 раза
          // Haptic feedback (iOS Safari не поддерживает, Android — да)
          if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
          // Визуальный фидбек
          grp.classList.add('msg-double-tapped');
          setTimeout(() => grp.classList.remove('msg-double-tapped'), 220);
          // Открываем контекст-меню
          if (QWAS.ContextMenu) {
            QWAS.ContextMenu.showMessageMenu({ clientX: e.clientX, clientY: e.clientY, target: grp }, id);
          }
          return true;
        }
        return false;
      };

      // Одиночный тап (только если не было двойного)
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
        // Кастомный double-tap (работает на mobile + desktop)
        if (_handleTap(e)) return;
        // Клик по картинке — lightbox
        const img = e.target.closest('.att-image img, img[data-lightbox-img]');
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

      // Правый клик — меню (desktop)
      list.addEventListener('contextmenu', (e) => {
        const grp = e.target.closest('.message-group[data-msg-id]');
        if (!grp) return;
        if (e.target.closest('[data-action], a, button, input, textarea')) return;
        e.preventDefault();
        if (QWAS.ContextMenu) {
          QWAS.ContextMenu.showMessageMenu(e, parseInt(grp.dataset.msgId));
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

    // Инкрементальный апдейт: заменяет один message-group в DOM по id
    updateOne(msg) {
      const list = document.getElementById('messages');
      if (!list) return;
      const arr = QWAS.State.messagesByChat.get(msg.chatId) || [];
      const idx = arr.findIndex(m => m.id === msg.id);
      if (idx < 0) return;
      const prev = arr[idx - 1];
      const next = arr[idx + 1];
      const html = this.renderOne(msg, prev, next);
      const node = list.querySelector(`[data-msg-id="${msg.id}"]`);
      if (node) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const newNode = tmp.firstElementChild;
        if (newNode) node.replaceWith(newNode);
      }
    },

    // Добавить одно сообщение в конец списка (без полного re-render)
    appendOne(msg) {
      const list = document.getElementById('messages');
      if (!list) return;
      const arr = QWAS.State.messagesByChat.get(msg.chatId) || [];
      const idx = arr.findIndex(m => m.id === msg.id);
      if (idx < 0) return;
      const prev = arr[idx - 1];
      const html = this.renderOne(msg, prev, null);
      // Проверим, нужен ли date-sep
      const prevDate = prev ? this.formatDateLabel(prev.createdAt) : '';
      const curDate = this.formatDateLabel(msg.createdAt);
      const dateSep = (curDate !== prevDate) ? `<div class="messages-date-sep"><span>${QWAS.Util.escapeHtml(curDate)}</span></div>` : '';
      const tmp = document.createElement('div');
      tmp.innerHTML = dateSep + html;
      // Удалим "Нет сообщений"
      const empty = list.querySelector('.messages-empty');
      if (empty) empty.remove();
      while (tmp.firstChild) list.appendChild(tmp.firstChild);
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
      const fromName = isMine ? 'Вы' : (m.fromFirstName || m.fromUsername || '...');
      const prevIsSame = prev && !prev.isDeleted && prev.fromId === m.fromId && (new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000);
      const nextIsSame = next && !next.isDeleted && next.fromId === m.fromId && (new Date(next.createdAt) - new Date(m.createdAt) < 5 * 60 * 1000);
      const showAvatar = !isMine && !prevIsSame;
      const showName = !isMine && !prevIsSame;
      const firstInGroup = !prevIsSame;
      const lastInGroup = !nextIsSame;

      const avatarSlot = showAvatar
        ? `<div class="message-avatar-slot">${QWAS.Util.avatarHtml({ firstName: m.fromFirstName, lastName: m.fromLastName, username: m.fromUsername }, 32)}</div>`
        : '<div class="message-avatar-slot"></div>';

      const time = new Date(m.createdAt).toTimeString().slice(0, 5);
      const editedMark = m.isEdited ? '<span class="edited">ред.</span>' : '';
      const status = isMine ? this._renderStatus(m) : '';

      const body = this.renderBody(m);
      const reply = m.replySnapshot ? this.renderReply(m.replySnapshot) : (m.replyToId ? this.renderReplyStub(m.replyToId) : '');
      const fwd = m.forwardedFromName ? `<div class="forwarded-label">Переслано от <b>${QWAS.Util.escapeHtml(m.forwardedFromName)}</b></div>` : '';

      const reactionsHtml = this.renderReactions(m);
      const attachmentsHtml = this.renderAttachments(m);

      const contextActions = `
        <div class="message-actions">
          <button class="message-action" data-action="react" data-id="${m.id}" data-emoji="👍" title="Реакция">👍</button>
          <button class="message-action" data-action="reply" data-id="${m.id}" title="Ответить">↩</button>
          <button class="message-action" data-action="copy" data-id="${m.id}" title="Копировать">📋</button>
          ${isMine ? `<button class="message-action" data-action="edit" data-id="${m.id}" title="Редактировать">✎</button>
                      <button class="message-action" data-action="delete" data-id="${m.id}" title="Удалить">🗑</button>` : ''}
          <button class="message-action" data-action="forward" data-id="${m.id}" title="Переслать">↗</button>
          <button class="message-action" data-action="pin" data-id="${m.id}" title="Закрепить">📌</button>
        </div>`;

      const bubbleCls = [
        'bubble',
        firstInGroup ? 'first-in-group' : '',
        lastInGroup ? 'last-in-group' : '',
        (m.type === 'round' && !m.text) ? 'bubble-round' : '',
        (m.type === 'voice' && !m.text) ? 'bubble-voice' : ''
      ].filter(Boolean).join(' ');

      const isMediaOnly = (m.type === 'round' || m.type === 'voice') && !m.text;

      return `<div class="message-group ${isMine ? 'out' : 'in'}" data-msg-id="${m.id}">
        ${avatarSlot}
        <div class="bubble-wrap">
          ${showName ? `<div class="message-author">${QWAS.Util.escapeHtml(fromName)}</div>` : ''}
          <div class="${bubbleCls}">
            ${fwd}
            ${reply}
            ${attachmentsHtml}
            ${isMediaOnly ? '' : body}
            ${isMediaOnly ? '' : `<div class="bubble-meta">
              <span class="time">${time}</span>
              ${editedMark}
              ${status}
            </div>`}
            ${contextActions}
          </div>
          ${isMediaOnly ? `<div class="bubble-meta bubble-meta-below">
              <span class="time">${time}</span>
              ${editedMark}
              ${status}
            </div>` : ''}
          ${reactionsHtml}
        </div>
      </div>`;
    },

    renderDeleted(m) {
      const me = QWAS.State.me;
      const isMine = me && (m.fromId === me.id || m.fromUsername === me.username);
      return `<div class="message-group message-deleted ${isMine ? 'out' : 'in'}" data-msg-id="${m.id}">
        <div class="message-avatar-slot"></div>
        <div class="bubble-wrap">
          <div class="bubble bubble-deleted">
            <i>Сообщение удалено</i>
          </div>
        </div>
      </div>`;
    },

    renderReply(snap) {
      if (!snap) return '';
      const name = snap.fromUsername === QWAS.State.me?.username ? 'Вы' : (snap.fromFirstName || snap.fromUsername);
      const text = snap.text || (snap.attachments ? '📎 Вложение' : '...');
      return `<div class="reply-quote">
        <div class="reply-author">${QWAS.Util.escapeHtml(name)}</div>
        <div class="reply-text">${QWAS.Util.escapeHtml(text)}</div>
      </div>`;
    },

    renderReplyStub(replyToId) {
      return `<div class="reply-quote reply-stub" data-scroll-to="${replyToId}">
        <div class="reply-author">↩ Ответ</div>
      </div>`;
    },

    renderBody(m) {
      if (!m.text) return '';
      return `<div class="bubble-text">${this.formatText(m.text)}</div>`;
    },

    formatText(text) {
      if (!text) return '';
      let safe = QWAS.Util.escapeHtml(text);
      safe = safe.replace(/(https?:\/\/[^\s<]+)/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);
      safe = safe.replace(/(^|\s)@([a-z0-9_]{3,32})/gi, '$1<span class="mention">@$2</span>');
      safe = safe.replace(/\n/g, '<br>');
      return safe;
    },

    renderAttachments(m) {
      if (!m.attachments || !m.attachments.length) return '';
      const out = [];
      for (const a of m.attachments) {
        if (m.type === 'image' || a.type === 'image') {
          out.push(`<div class="att-image" data-lightbox>
            <img src="${QWAS.Util.escapeAttr(a.url)}" alt="${QWAS.Util.escapeAttr(a.name || '')}" loading="lazy">
          </div>`);
        } else if (m.type === 'round' || a.type === 'round') {
          const dur = a.duration ? QWAS.Util.formatDuration(a.duration) : '';
          out.push(`<div class="att-round" data-play-voice data-round-url="${QWAS.Util.escapeAttr(a.url)}" data-round-dur="${dur}">
            <video src="${QWAS.Util.escapeAttr(a.url)}" loop playsinline preload="metadata"></video>
            <div class="att-round-overlay">
              <button class="att-round-play" type="button" aria-label="Воспроизвести">
                <svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <div class="att-round-time">${dur}</div>
          </div>`);
        } else if (m.type === 'voice' || a.type === 'voice') {
          const dur = a.duration ? QWAS.Util.formatDuration(a.duration) : '';
          out.push(`<div class="att-voice" data-play-voice data-voice-url="${QWAS.Util.escapeAttr(a.url)}" data-dur="${dur}">
            <button class="att-voice-btn" type="button" aria-label="Воспроизвести">
              <svg class="att-voice-icon-play" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
              <svg class="att-voice-icon-pause" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>
            </button>
            <div class="att-voice-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
            <div class="att-voice-duration">${dur}</div>
          </div>`);
        } else if (m.type === 'video' || a.type === 'video') {
          out.push(`<div class="att-video" data-play-video>
            <video src="${QWAS.Util.escapeAttr(a.url)}" controls playsinline preload="metadata"></video>
          </div>`);
        } else if (m.type === 'location' || a.type === 'location') {
          const lat = (a.lat || m.locationData?.lat);
          const lng = (a.lng || m.locationData?.lng);
          if (lat != null && lng != null) {
            const mapUrl = `https://yandex.ru/maps/?text=${lat},${lng}`;
            out.push(`<a class="location-message" href="${mapUrl}" target="_blank" rel="noopener">
              <div class="location-map"><div class="location-pin"></div></div>
              <div class="location-info">
                <div class="location-text">${QWAS.Util.escapeHtml(a.name || 'Местоположение')}</div>
                <div class="location-coords">${typeof lat === 'number' ? lat.toFixed(5) : lat}, ${typeof lng === 'number' ? lng.toFixed(5) : lng}</div>
              </div>
            </a>`);
          }
        } else if (m.type === 'contact' || a.type === 'contact') {
          const c = m.contactData || {};
          out.push(`<div class="contact-message">
            <div class="avatar">${QWAS.Util.getInitials(c.firstName, c.lastName)}</div>
            <div class="contact-info">
              <div class="contact-name">${QWAS.Util.escapeHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</div>
              ${c.phone ? `<div class="contact-username">${QWAS.Util.escapeHtml(c.phone)}</div>` : ''}
            </div>
          </div>`);
        } else if (m.type === 'poll' || a.type === 'poll') {
          const p = m.pollData || a.pollData || {};
          out.push(this.renderPoll(m.id, p, !!m.pollVoted));
        } else {
          out.push(`<a class="att-file" href="${QWAS.Util.escapeAttr(a.url)}" target="_blank" rel="noopener" data-download="${QWAS.Util.escapeAttr(a.url)}" data-name="${QWAS.Util.escapeAttr(a.name || 'файл')}">
            <div class="att-file-icon">📎</div>
            <div class="att-file-info">
              <div class="att-file-name">${QWAS.Util.escapeHtml(a.name || 'файл')}</div>
              <div class="att-file-size">${QWAS.Util.formatBytes(a.size)}</div>
            </div>
          </a>`);
        }
      }
      return `<div class="attachments">${out.join('')}</div>`;
    },

    renderPoll(messageId, poll, voted) {
      const opts = poll.options || [];
      const total = opts.reduce((s, o) => s + (o.votes || 0), 0);
      return `<div class="poll-message">
        <div class="poll-question">${QWAS.Util.escapeHtml(poll.question || 'Опрос')}</div>
        ${opts.map((o, i) => {
          const pct = total > 0 ? Math.round((o.votes || 0) / total * 100) : 0;
          const isVoted = voted && voted === i;
          return `<div class="poll-option ${isVoted ? 'selected' : ''}" data-poll-vote="${i}">
            <div class="poll-option-bar" style="width:${pct}%"></div>
            <div class="poll-option-label">${QWAS.Util.escapeHtml(o.text)} <span class="poll-option-pct">${pct}%</span></div>
          </div>`;
        }).join('')}
        <div class="poll-total">${total} голос${total === 1 ? '' : (total >= 2 && total <= 4 ? 'а' : 'ов')}</div>
      </div>`;
    },

    renderReactions(m) {
      if (!m.reactions) return '';
      const emojis = Object.keys(m.reactions);
      if (!emojis.length) return '';
      return `<div class="reactions-row">
        ${emojis.map(e => {
          const users = m.reactions[e] || [];
          return `<button class="reaction" data-action="react" data-id="${m.id}" data-emoji="${e}">${e} <span>${users.length}</span></button>`;
        }).join('')}
      </div>`;
    },

    _renderStatus(m) {
      let cls = '';
      if (m._status === 'read') cls = 'read';
      const icon = m._status === 'failed' ? '✕' : (m._status === 'read' ? '✓✓' : '✓');
      return `<span class="status ${cls}">${icon}</span>`;
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
          if (QWAS.State.current === chatId) this.updateOne(msg);
          return;
        }
      }
      list.push(msg);
      QWAS.State.messagesByChat.set(chatId, list);

      // Если чат открыт — добавляем только новое сообщение
      if (QWAS.State.current === chatId) {
        this.appendOne(msg);
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
        if (QWAS.State.current === msg.chatId) this.updateOne(list[idx]);
      }
    },

    onDeleted(data) {
      if (!data) return;
      const list = QWAS.State.messagesByChat.get(data.chatId) || [];
      const idx = list.findIndex(m => m.id === data.messageId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], isDeleted: true, text: null, attachments: [] };
        QWAS.State.messagesByChat.set(data.chatId, list);
        if (QWAS.State.current === data.chatId) this.updateOne(list[idx]);
      }
    },

    onReadReceipt(data) {
      if (!data) return;
      const list = QWAS.State.messagesByChat.get(data.chatId) || [];
      let changedIds = [];
      for (const m of list) {
        if (m.fromUsername === QWAS.State.me?.username && m.id <= data.messageId) {
          if (m._status !== 'read') {
            m._status = 'read';
            changedIds.push(m.id);
          }
        }
      }
      if (changedIds.length && QWAS.State.current === data.chatId) {
        // Обновляем только затронутые сообщения
        for (const id of changedIds) {
          const m = list.find(x => x.id === id);
          if (m) this.updateOne(m);
        }
      }
    },

    onReaction(data) {
      if (!data) return;
      const list = QWAS.State.messagesByChat.get(data.chatId) || [];
      const m = list.find(x => x.id === data.messageId);
      if (m) {
        m.reactions = data.reactions || {};
        if (QWAS.State.current === data.chatId) this.updateOne(m);
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
      const target = wrap.scrollHeight;
      if (force) {
        // Прыжок мгновенно (своё сообщение, открытие чата)
        wrap.scrollTop = target;
      } else {
        // Плавный скролл (новые сообщения других)
        const start = wrap.scrollTop;
        const distance = target - start - wrap.clientHeight;
        if (Math.abs(distance) < 4) {
          wrap.scrollTop = target;
        } else if (distance > 0) {
          // native smooth для производительности
          try { wrap.scrollTo({ top: target, behavior: 'smooth' }); } catch { wrap.scrollTop = target; }
        }
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
      // Двойной rAF — гарантирует что DOM обновился и viewport пересчитан
      // (важно для мобильных браузеров с виртуальной клавиатурой)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.scrollToBottom(true));
        // Дополнительный фолбек через 80мс для медленных устройств
        setTimeout(() => this.scrollToBottom(true), 80);
      });

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

    enterSelectMode(id) {
      QWAS.Toast?.info?.('Режим выделения скоро появится');
    },

    async pinMessage(id) {
      const chatId = QWAS.State.current;
      if (!chatId) return;
      try {
        const r = await QWAS.API.pinMessage(chatId, id);
        if (r && r.ok) {
          QWAS.State.pinnedMessage = r.message || null;
          this.renderPinnedBar();
          QWAS.Toast?.success?.('Сообщение закреплено');
        }
      } catch (e) {
        QWAS.Toast?.error?.('Не удалось закрепить');
      }
    },

    async unpinMessage() {
      const chatId = QWAS.State.current;
      if (!chatId) return;
      try {
        const r = await QWAS.API.unpinMessage(chatId);
        if (r && r.ok) {
          QWAS.State.pinnedMessage = null;
          this.renderPinnedBar();
          QWAS.Toast?.info?.('Закреп снят');
        }
      } catch (e) {
        QWAS.Toast?.error?.('Не удалось открепить');
      }
    },

    async loadPinnedMessage() {
      const chatId = QWAS.State.current;
      if (!chatId) {
        QWAS.State.pinnedMessage = null;
        this.renderPinnedBar();
        return;
      }
      try {
        const r = await QWAS.API.getPinnedMessage(chatId);
        QWAS.State.pinnedMessage = (r && r.ok) ? r.pinnedMessage : null;
        this.renderPinnedBar();
      } catch (e) {
        QWAS.State.pinnedMessage = null;
        this.renderPinnedBar();
      }
    },

    renderPinnedBar() {
      const bar = document.getElementById('pinnedBar');
      if (!bar) return;
      const m = QWAS.State.pinnedMessage;
      if (!m) {
        bar.classList.remove('visible');
        setTimeout(() => { if (!bar.classList.contains('visible')) bar.style.display = 'none'; }, 200);
        return;
      }
      bar.style.display = 'flex';
      const me = QWAS.State.me;
      const isMine = m.fromId === me?.id;
      const author = isMine ? 'Вы' : (m.fromName || m.fromUsername || 'Пользователь');
      let preview = m.text || '';
      if (!preview && m.attachments) {
        const a = Array.isArray(m.attachments) ? m.attachments[0] : null;
        if (a) preview = a.type === 'image' ? '📷 Фото' : a.type === 'video' ? '🎬 Видео' : a.type === 'voice' ? '🎤 Голосовое' : a.type === 'round' ? '🔵 Кружок' : a.type === 'file' ? `📎 ${a.name || 'Файл'}` : 'Вложение';
      } else if (!preview) preview = 'Сообщение';
      bar.querySelector('.pinned-author').textContent = author;
      bar.querySelector('.pinned-preview').textContent = preview;
      void bar.offsetWidth;
      bar.classList.add('visible');
    },

    scrollToPinned() {
      const m = QWAS.State.pinnedMessage;
      if (!m) return;
      const el = document.querySelector(`.message[data-id="${m.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('pinned-highlight');
        void el.offsetWidth;
        el.classList.add('pinned-highlight');
        setTimeout(() => el.classList.remove('pinned-highlight'), 2000);
      } else {
        QWAS.Toast?.info?.('Сообщение вне загруженной истории');
      }
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
      const wrap = btn.closest('.att-voice, .att-round, .msg-voice, .msg-round');
      if (!wrap) return;
      const isRound = !!wrap.closest('.att-round') || !!wrap.classList.contains('att-round');

      // Остановим все прочие плееры
      QWAS.Messages._stopAllPlayers(wrap);

      if (isRound) {
        const video = wrap.querySelector('video');
        if (!video) return;
        // Развернём/свернём
        wrap.classList.toggle('expanded');
        if (wrap.classList.contains('expanded')) {
          video.currentTime = 0;
          video.play().catch(() => {});
          const play = wrap.querySelector('.att-round-play');
          if (play) play.style.opacity = '0';
        } else {
          video.pause();
          video.currentTime = 0;
          const play = wrap.querySelector('.att-round-play');
          if (play) play.style.opacity = '1';
        }
        return;
      }

      // Голосовое — кастомный плеер
      const url = wrap.dataset.voiceUrl;
      if (!url) return;
      let player = QWAS.State._voicePlayer;
      if (!player) {
        player = new Audio();
        player.preload = 'metadata';
        QWAS.State._voicePlayer = player;
        player.addEventListener('timeupdate', () => {
          if (!player._wrap) return;
          const wave = player._wrap.querySelector('.att-voice-wave');
          const dur = player._wrap.querySelector('.att-voice-duration');
          if (dur) dur.textContent = QWAS.Util.formatDuration(player.currentTime) + ' / ' + (player._wrap.dataset.dur || QWAS.Util.formatDuration(player.duration || 0));
          if (wave && player.duration) {
            const pct = player.currentTime / player.duration;
            const spans = wave.querySelectorAll('span');
            spans.forEach((sp, i) => {
              const pos = i / spans.length;
              if (pos < pct) sp.classList.add('played');
              else sp.classList.remove('played');
            });
          }
        });
        player.addEventListener('ended', () => {
          if (player._wrap) {
            player._wrap.classList.remove('playing');
            const wave = player._wrap.querySelector('.att-voice-wave');
            const dur = player._wrap.querySelector('.att-voice-duration');
            const d = player._wrap.dataset.dur;
            if (dur && d) dur.textContent = d;
            if (wave) wave.querySelectorAll('span').forEach(s => s.classList.remove('played'));
          }
        });
        player.addEventListener('pause', () => {
          if (player._wrap) player._wrap.classList.remove('playing');
        });
        player.addEventListener('play', () => {
          if (player._wrap) player._wrap.classList.add('playing');
        });
      }
      // Если уже играет этот же wrap — пауза
      if (player._wrap === wrap) {
        player.pause();
        player._wrap = null;
        return;
      }
      // Новый источник
      if (player.src !== url) player.src = url;
      player._wrap = wrap;
      player.play().catch(() => {});
    },

    _stopAllPlayers(exceptWrap) {
      // Voice
      const vp = QWAS.State._voicePlayer;
      if (vp && vp._wrap && vp._wrap !== exceptWrap) {
        try { vp.pause(); } catch {}
        vp._wrap.classList.remove('playing');
        const wave = vp._wrap.querySelector('.att-voice-wave');
        const dur = vp._wrap.querySelector('.att-voice-duration');
        const d = vp._wrap.dataset.dur;
        if (dur && d) dur.textContent = d;
        if (wave) wave.querySelectorAll('span').forEach(s => s.classList.remove('played'));
        vp._wrap = null;
      }
      // Round
      document.querySelectorAll('.att-round.expanded').forEach(el => {
        if (el === exceptWrap) return;
        el.classList.remove('expanded');
        const v = el.querySelector('video');
        if (v) { try { v.pause(); v.currentTime = 0; } catch {} }
        const play = el.querySelector('.att-round-play');
        if (play) play.style.opacity = '1';
      });
      // Скрытые глобальные плееры (если используются)
      const hv = document.getElementById('hiddenVideo');
      if (hv) { try { hv.pause(); } catch {} }
      const ha = document.getElementById('hiddenAudio');
      if (ha) { try { ha.pause(); } catch {} }
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
