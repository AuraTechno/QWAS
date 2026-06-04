(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Messages = {
    selectionMode: false,
    firstMessageBeforeLoad: null,

    ensureContainer() {
      return document.getElementById('messages');
    },

    renderAll(messages) {
      const container = this.ensureContainer();
      if (!container) return;
      container.innerHTML = '';
      if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="system-message"><span>Нет сообщений</span></div>';
        this.scrollToBottom(true);
        return;
      }
      this.appendMany(messages);
      this.scrollToBottom(true);
    },

    appendMany(messages) {
      const container = this.ensureContainer();
      if (!container) return;
      const html = this.renderGroups(messages);
      container.insertAdjacentHTML('beforeend', html);
    },

    renderGroups(messages) {
      if (!messages.length) return '';
      const out = [];
      let group = null;
      let lastTime = 0;

      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const mTime = new Date(m.createdAt).getTime();
        if (i === 0 || !QWAS.Util.isSameDay(lastTime, mTime)) {
          out.push(this.renderDateDivider(m.createdAt));
        }

        const isMine = m.from === QWAS.State.me;
        const sameAuthor = group && group.from === m.from;
        const closeInTime = group && (mTime - new Date(group.lastTime).getTime() < 60000);
        const startNew = !sameAuthor || !closeInTime;

        if (startNew) {
          if (group) out.push(this.renderGroupEnd());
          group = { from: m.from, isMine, firstTime: m.createdAt, lastTime: m.createdAt, items: [m] };
          out.push(this.renderGroupStart(group));
        } else {
          group.lastTime = m.createdAt;
          group.items.push(m);
        }

        out.push(this.renderMessage(m, group, group.items.length - 1, group.items.length));

        lastTime = m.createdAt;
      }

      if (group) out.push(this.renderGroupEnd());
      return out.join('');
    },

    renderDateDivider(date) {
      return `<div class="date-divider"><span>${QWAS.Util.escapeHtml(QWAS.Util.fullDate(date))}</span></div>`;
    },

    renderGroupStart(group) {
      const username = group.isMine ? QWAS.State.me : group.from;
      const cls = group.isMine ? 'out' : 'in';
      let user = {};
      if (group.isMine) {
        user = QWAS.State.currentUser || {};
      } else {
        const chat = (QWAS.State.chats || []).find(c => c.username === QWAS.State.current);
        user = chat || { username: group.from };
        if (chat?.type === 'group') {
          const member = (this.groupMembers || []).find(m => m.username === group.from);
          if (member) user = member;
        }
      }
      const showAvatar = !group.isMine;
      const avatarHtml = showAvatar ? this.renderAvatar(user, 32) : '<div class="message-avatar-slot empty"></div>';
      return `<div class="message-group ${cls}" data-group="${QWAS.Util.escapeAttr(group.from)}" data-time="${group.firstTime}">
        ${avatarHtml}
        <div class="bubble-wrap">`;
    },

    renderGroupEnd() {
      return `</div></div>`;
    },

    renderMessage(m, group, idx, total) {
      const isMine = m.from === QWAS.State.me;
      const isLast = idx === total - 1;
      const showAuthor = !isMine && group.type === 'group' && idx === 0;
      const showMeta = isLast || (m.reactions && m.reactions.length > 0);

      let authorName = '';
      if (showAuthor) {
        let member = (this.groupMembers || []).find(x => x.username === m.from);
        if (!member) member = { username: m.from, firstName: m.from };
        authorName = `<div class="bubble-meta"><span class="author">${QWAS.Util.escapeHtml(QWAS.Util.getUserDisplayName(member) || m.from)}</span></div>`;
      }

      const replyHtml = m.replyTo ? this.renderReply(m.replyTo) : '';
      const forwardedHtml = m.isForwarded ? `<div class="forwarded-label">↪ Переслано от @${QWAS.Util.escapeHtml(m.forwardedFrom || '')}</div>` : '';
      const attachmentsHtml = this.renderAttachments(m.attachments || []);
      const textHtml = m.message ? `<div class="bubble-text">${this.formatText(m.message, m.mentions)}</div>` : '';
      const reactionsHtml = this.renderReactions(m);
      const metaHtml = showMeta ? this.renderMeta(m, isMine) : '';

      const firstClass = idx === 0 ? 'first-in-group' : '';
      const lastClass = isLast ? 'last-in-group' : '';
      const pinnedClass = m.isPinned ? 'pinned' : '';

      const failedClass = m.status === 'failed' ? 'failed' : '';
      return `${authorName}<div class="bubble ${firstClass} ${lastClass} ${pinnedClass} ${failedClass}"
        data-id="${QWAS.Util.escapeAttr(m._id)}"
        oncontextmenu="QWAS.ContextMenu.showMessage(event, '${QWAS.Util.escapeAttr(m._id)}')"
        ondblclick="QWAS.Reactions.showQuick(event, '${QWAS.Util.escapeAttr(m._id)}')"
        ontouchstart="QWAS.Messages.touchStart(event, '${QWAS.Util.escapeAttr(m._id)}')"
        ontouchend="QWAS.Messages.touchEnd()"
        ontouchmove="QWAS.Messages.touchEnd()">
        ${forwardedHtml}
        ${replyHtml}
        ${attachmentsHtml}
        ${textHtml}
        ${metaHtml}
        ${reactionsHtml}
      </div>`;
    },

    renderAvatar(user, size) {
      const sizeClass = `size-${size}`;
      if (user.avatar) {
        return `<div class="avatar ${sizeClass}" style="background-image:url(${QWAS.Util.escapeAttr(user.avatar)})"></div>`;
      }
      return `<div class="avatar ${sizeClass} ${QWAS.Util.gradientFor(user.username || user.firstName)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(user.firstName || user.username || '?'))}</div>`;
    },

    renderReply(replyToId) {
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const reply = list.find(m => m._id === replyToId);
      if (!reply) {
        return `<div class="reply-quote"><div class="reply-author">Удалённое сообщение</div></div>`;
      }
      const name = reply.from === QWAS.State.me ? 'Вы' : QWAS.Util.getUserDisplayName({ username: reply.from }) || reply.from;
      const text = reply.message || (reply.attachments?.length ? '📎 Вложение' : '');
      return `<div class="reply-quote" onclick="QWAS.Chat.scrollToMessage('${QWAS.Util.escapeAttr(replyToId)}')">
        <div class="reply-author">${QWAS.Util.escapeHtml(name)}</div>
        <div class="reply-text">${QWAS.Util.escapeHtml(QWAS.Util.truncate(text, 80))}</div>
      </div>`;
    },

    renderAttachments(att) {
      if (!att || !att.length) return '';
      const groups = this.groupAttachments(att);
      let html = '<div class="attachments">';
      for (const g of groups) {
        if (g.type === 'image' && g.items.length > 1) {
          html += `<div class="att-image att-image-multiple">${g.items.map(i => this.renderImage(i, false)).join('')}</div>`;
        } else {
          for (const item of g.items) {
            html += this.renderSingleAttachment(item, g.type);
          }
        }
      }
      html += '</div>';
      return html;
    },

    groupAttachments(att) {
      const groups = [];
      let cur = null;
      for (const a of att) {
        const t = a.type || 'file';
        if (t !== 'image' && t !== 'video') {
          groups.push({ type: t, items: [a] });
          cur = null;
        } else {
          if (!cur || cur.type !== t) {
            cur = { type: t, items: [a] };
            groups.push(cur);
          } else {
            cur.items.push(a);
          }
        }
      }
      return groups;
    },

    renderSingleAttachment(a, type) {
      switch (type) {
        case 'image': return this.renderImage(a, true);
        case 'video': return this.renderVideo(a);
        case 'audio': return this.renderAudio(a);
        case 'voice': return this.renderVoice(a);
        case 'round': return this.renderRound(a);
        default: return this.renderFile(a);
      }
    },

    renderImage(a, wrap) {
      const w = wrap ? `<div class="att-image" onclick="QWAS.Lightbox.open('${QWAS.Util.escapeAttr(a.url)}', '${QWAS.Util.escapeAttr(a.name || '')}')">` : `<div class="att-image">`;
      return `${w}<img src="${QWAS.Util.escapeAttr(a.url)}" alt="${QWAS.Util.escapeAttr(a.name || '')}" loading="lazy"></div>`;
    },

    renderVideo(a) {
      return `<div class="att-video" onclick="QWAS.Lightbox.openVideo('${QWAS.Util.escapeAttr(a.url)}')">
        <video src="${QWAS.Util.escapeAttr(a.url)}" preload="metadata"></video>
        <div class="att-video-play">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
        </div>
        ${a.duration ? `<div class="att-video-duration">${QWAS.Util.formatDuration(a.duration)}</div>` : ''}
      </div>`;
    },

    renderAudio(a) {
      return `<div class="att-file" onclick="window.open('${QWAS.Util.escapeAttr(a.url)}', '_blank')">
        <div class="att-file-icon">🎵</div>
        <div class="att-file-info">
          <div class="att-file-name">${QWAS.Util.escapeHtml(a.name || 'Аудио')}</div>
          <div class="att-file-size">${QWAS.Util.formatSize(a.size)}</div>
        </div>
      </div>`;
    },

    renderVoice(a) {
      const bars = this.makeWaveform(a.waveform?.length ? a.waveform : null);
      return `<div class="att-voice" data-url="${QWAS.Util.escapeAttr(a.url)}" data-duration="${a.duration || 0}">
        <button class="att-voice-btn" onclick="QWAS.Attach.playVoice(this)">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
        </button>
        <div class="att-voice-wave">${bars}</div>
        <div class="att-voice-duration">${QWAS.Util.formatDuration(a.duration)}</div>
      </div>`;
    },

    renderRound(a) {
      return `<div class="att-round" onclick="QWAS.Lightbox.openVideo('${QWAS.Util.escapeAttr(a.url)}', true)">
        <video src="${QWAS.Util.escapeAttr(a.url)}" muted></video>
        <div class="att-round-overlay">
          <div class="att-round-play">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="att-round-duration">${QWAS.Util.formatDuration(a.duration || 0)}</div>
      </div>`;
    },

    renderFile(a) {
      const ext = (a.name || '').split('.').pop().toUpperCase().slice(0, 4);
      const iconChar = this.getFileIconChar(ext);
      return `<a class="att-file" href="${QWAS.Util.escapeAttr(a.url)}" download="${QWAS.Util.escapeAttr(a.name || '')}" target="_blank">
        <div class="att-file-icon">${iconChar}</div>
        <div class="att-file-info">
          <div class="att-file-name">${QWAS.Util.escapeHtml(a.name || 'Файл')}</div>
          <div class="att-file-size">${QWAS.Util.formatSize(a.size)}</div>
        </div>
      </a>`;
    },

    getFileIconChar(ext) {
      const map = {
        PDF: '📄', DOC: '📝', DOCX: '📝', XLS: '📊', XLSX: '📊',
        ZIP: '🗜', RAR: '🗜', '7Z': '🗜',
        MP3: '🎵', WAV: '🎵', OGG: '🎵',
        MP4: '🎬', MOV: '🎬', AVI: '🎬',
        JPG: '🖼', JPEG: '🖼', PNG: '🖼', GIF: '🖼', WEBP: '🖼'
      };
      return map[ext] || '📎';
    },

    makeWaveform(amplitudes) {
      const count = 40;
      if (!amplitudes || amplitudes.length === 0) {
        amplitudes = Array.from({ length: count }, () => 0.3 + Math.random() * 0.7);
      } else {
        const step = Math.max(1, Math.floor(amplitudes.length / count));
        amplitudes = Array.from({ length: count }, (_, i) => amplitudes[i * step] || 0.3);
      }
      return amplitudes.map(a => `<span style="height:${Math.round(20 + a * 80)}%"></span>`).join('');
    },

    formatText(text, mentions) {
      let formatted = QWAS.Util.detectLinks(QWAS.Util.escapeHtml(text));
      if (mentions && mentions.length) {
        for (const m of mentions) {
          const re = new RegExp(`@${m}\\b`, 'g');
          formatted = formatted.replace(re, `<span class="mention">@${QWAS.Util.escapeHtml(m)}</span>`);
        }
      }
      return formatted;
    },

    renderReactions(m) {
      if (!m.reactions || m.reactions.length === 0) return '';
      return `<div class="reactions-row">${m.reactions.map(r => {
        const own = r.users?.includes(QWAS.State.me);
        return `<div class="reaction ${own ? 'own' : ''}" onclick="QWAS.Reactions.toggle('${QWAS.Util.escapeAttr(m._id)}', '${QWAS.Util.escapeAttr(r.emoji)}')">
          <span class="emoji">${r.emoji}</span>
          <span class="count">${r.users?.length || 1}</span>
        </div>`;
      }).join('')}</div>`;
    },

    renderMeta(m, isMine) {
      const time = QWAS.Util.formatTime(m.createdAt);
      let status = '';
      if (isMine) {
        if (m.status === 'failed') {
          status = `<span class="status failed" title="Нажмите чтобы повторить" onclick="QWAS.Messages.retry('${QWAS.Util.escapeAttr(m._id)}')">⚠</span>`;
        } else if (m.status === 'sending' || m.pending) {
          status = `<span class="status sending"><span class="dot-flashing"></span></span>`;
        } else {
          const cls = m.status === 'read' ? 'read' : '';
          const icon = m.status === 'read' ? '✓✓' : '✓';
          status = `<span class="status ${cls}">${icon}</span>`;
        }
      }
      return `<div class="bubble-meta">
        ${m.edited ? '<span class="edited">ред.</span>' : ''}
        <span class="time">${time}</span>
        ${status}
      </div>`;
    },

    add(msg) {
      const container = this.ensureContainer();
      if (!container) return;
      if (document.getElementById('msg-' + msg._id)) return;

      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      if (list.find(m => m._id === msg._id)) return;
      list.push(msg);
      QWAS.State.messagesByChat.set(QWAS.State.current, list);

      const sysMsg = container.querySelector('.system-message');
      if (sysMsg) sysMsg.remove();

      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;

      const html = this.renderGroups([msg]);
      container.insertAdjacentHTML('beforeend', html);

      if (isNearBottom || msg.from === QWAS.State.me) {
        this.scrollToBottom();
      } else {
        QWAS.ScrollButton.show(1);
      }
    },

    prepend(msgs) {
      const container = this.ensureContainer();
      if (!container || !msgs.length) return;
      const sysMsg = container.querySelector('.system-message');
      if (sysMsg) sysMsg.remove();

      const html = this.renderGroups(msgs);
      container.insertAdjacentHTML('afterbegin', html);
    },

    saveScrollPosition() {
      const container = this.ensureContainer();
      if (!container) return;
      const firstMsg = container.querySelector('.message-group');
      if (!firstMsg) return;
      const containerRect = container.getBoundingClientRect();
      const msgRect = firstMsg.getBoundingClientRect();
      this.firstMessageBeforeLoad = {
        offset: msgRect.top - containerRect.top
      };
    },

    restoreScrollPosition() {
      const container = this.ensureContainer();
      if (!container || this.firstMessageBeforeLoad == null) return;
      const firstMsg = container.querySelector('.message-group');
      if (firstMsg) {
        const containerRect = container.getBoundingClientRect();
        const msgRect = firstMsg.getBoundingClientRect();
        const delta = (msgRect.top - containerRect.top) - this.firstMessageBeforeLoad.offset;
        container.scrollTop = container.scrollTop + delta;
      }
      this.firstMessageBeforeLoad = null;
    },

    scrollToBottom(smooth = true) {
      const container = this.ensureContainer();
      if (!container) return;
      if (smooth) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } else {
        container.scrollTop = container.scrollHeight;
      }
      QWAS.ScrollButton.hide();
    },

    updateStatus(messageId, status) {
      const bubble = document.querySelector(`[data-id="${messageId}"] .status`);
      if (bubble) {
        bubble.classList.toggle('read', status === 'read');
        bubble.textContent = status === 'read' ? '✓✓' : '✓';
      }
    },

    updateReactions(messageId, reactions) {
      const bubble = document.querySelector(`[data-id="${messageId}"]`);
      if (!bubble) return;
      const existing = bubble.querySelector('.reactions-row');
      if (existing) existing.remove();
      const html = this.renderReactions({ _id: messageId, reactions });
      if (html) bubble.insertAdjacentHTML('beforeend', html);
    },

    touchStart(e, id) {
      this.touchTimer = setTimeout(() => {
        QWAS.ContextMenu.showMessage(e, id);
      }, 500);
    },

    touchEnd() {
      clearTimeout(this.touchTimer);
    },

    send() {
      const input = document.getElementById('msgInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text && QWAS.State.pendingFiles.length === 0) return;
      if (!QWAS.State.current) return;
      if (!QWAS.State.socket || !QWAS.State.socket.connected) {
        QWAS.Toast.error('Нет соединения с сервером');
        return;
      }

      if (QWAS.State.editingId) {
        QWAS.State.socket.emit('edit_message', {
          messageId: QWAS.State.editingId,
          newText: text
        });
        QWAS.State.editingId = null;
        input.value = '';
        this.cancelEdit();
        return;
      }

      const payload = {
        to: QWAS.State.current,
        message: text || ''
      };

      if (QWAS.State.replyTo) {
        payload.replyTo = QWAS.State.replyTo;
        QWAS.State.replyTo = null;
        QWAS.ReplyPreview.hide();
      }

      if (QWAS.State.pendingFiles.length > 0) {
        payload.attachments = QWAS.State.pendingFiles.slice();
        QWAS.State.pendingFiles = [];
        QWAS.Composer.renderAttachments();
      }

      const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const optimistic = {
        _id: tempId,
        from: QWAS.State.me,
        to: QWAS.State.current,
        message: text || '',
        attachments: payload.attachments || [],
        replyTo: payload.replyTo || null,
        isForwarded: false,
        createdAt: new Date().toISOString(),
        status: 'sending',
        pending: true,
        reactions: []
      };
      this.add(optimistic);
      QWAS.State.pendingMessages = QWAS.State.pendingMessages || new Map();
      QWAS.State.pendingMessages.set(tempId, { payload, attempts: 0, optimistic });

      const trySend = (tempId) => {
        const entry = QWAS.State.pendingMessages.get(tempId);
        if (!entry) return;
        entry.attempts = (entry.attempts || 0) + 1;
        if (entry.attempts > 3) {
          this.markFailed(tempId);
          return;
        }
        QWAS.State.socket.emit('send_message', entry.payload, (ack) => {
          if (ack && ack.ok) {
            QWAS.State.pendingMessages.delete(tempId);
            this.replaceMessage(tempId, { ...entry.optimistic, _id: ack.messageId, status: 'sent', createdAt: ack.createdAt || entry.optimistic.createdAt, pending: false });
            QWAS.State.socket.emit('read_message', { messageId: ack.messageId });
          } else {
            const err = ack && ack.error;
            if (err === 'blocked' || err === 'not_member') {
              this.markFailed(tempId, err === 'blocked' ? 'Вы заблокированы' : 'Вы не участник');
              QWAS.State.pendingMessages.delete(tempId);
              return;
            }
            if (entry.attempts < 3) {
              setTimeout(() => trySend(tempId), 1500 * entry.attempts);
            } else {
              this.markFailed(tempId);
              QWAS.State.pendingMessages.delete(tempId);
            }
          }
        });
      };
      trySend(tempId);

      input.value = '';
      this.autoresizeInput();
      QWAS.Composer.updateSendButton();
    },

    replaceMessage(oldId, newMsg) {
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const newId = newMsg._id;
      if (newId && newId !== oldId && list.find(m => m._id === newId)) {
        const idx = list.findIndex(m => m._id === oldId);
        if (idx >= 0) list.splice(idx, 1);
        QWAS.State.messagesByChat.set(QWAS.State.current, list);
        const oldEl = document.querySelector(`[data-id="${oldId}"]`);
        if (oldEl) oldEl.remove();
        return;
      }
      const idx = list.findIndex(m => m._id === oldId);
      if (idx >= 0) {
        list[idx] = newMsg;
        QWAS.State.messagesByChat.set(QWAS.State.current, list);
        const oldEl = document.querySelector(`[data-id="${oldId}"]`);
        if (oldEl) {
          const group = oldEl.closest('.message-group');
          if (group) {
            const newHtml = this.renderGroups([newMsg]);
            const tmp = document.createElement('div');
            tmp.innerHTML = newHtml;
            const newGroup = tmp.firstElementChild;
            if (newGroup) group.replaceWith(newGroup);
          }
        } else {
          this.renderAll(list);
        }
      }
    },

    markFailed(tempId, reason) {
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const idx = list.findIndex(m => m._id === tempId);
      if (idx >= 0) {
        list[idx].status = 'failed';
        list[idx].pending = false;
        QWAS.State.messagesByChat.set(QWAS.State.current, list);
      }
      const el = document.querySelector(`[data-id="${tempId}"]`);
      if (el) {
        el.classList.add('failed');
        el.title = reason || 'Не удалось отправить';
      }
      QWAS.Toast.error(reason || 'Не удалось отправить. Проверьте соединение.');
    },

    retry(tempId) {
      let entry = QWAS.State.pendingMessages.get(tempId);
      const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
      const m = list.find(x => x._id === tempId);
      if (!entry && m) {
        entry = { payload: { to: m.to, message: m.message, attachments: m.attachments || [], replyTo: m.replyTo }, attempts: 0, optimistic: m };
        QWAS.State.pendingMessages.set(tempId, entry);
      }
      if (!entry) return;
      if (m) {
        m.status = 'sending';
        m.pending = true;
      }
      const el = document.querySelector(`[data-id="${tempId}"]`);
      if (el) el.classList.remove('failed');
      this._resendEntry(tempId, entry);
    },

    flushPending() {
      QWAS.State.pendingMessages = QWAS.State.pendingMessages || new Map();
      for (const tempId of QWAS.State.pendingMessages.keys()) {
        const entry = QWAS.State.pendingMessages.get(tempId);
        if (entry) this._resendEntry(tempId, entry);
      }
    },

    _resendEntry(tempId, entry) {
      if (!QWAS.State.socket || !QWAS.State.socket.connected) return;
      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts > 3) {
        this.markFailed(tempId);
        QWAS.State.pendingMessages.delete(tempId);
        return;
      }
      QWAS.State.socket.emit('send_message', entry.payload, (ack) => {
        if (ack && ack.ok) {
          QWAS.State.pendingMessages.delete(tempId);
          this.replaceMessage(tempId, { ...entry.optimistic, _id: ack.messageId, status: 'sent', createdAt: ack.createdAt || entry.optimistic.createdAt, pending: false });
          QWAS.State.socket.emit('read_message', { messageId: ack.messageId });
        } else {
          if (entry.attempts < 3) {
            setTimeout(() => this._resendEntry(tempId, entry), 1500 * entry.attempts);
          } else {
            this.markFailed(tempId);
            QWAS.State.pendingMessages.delete(tempId);
          }
        }
      });
    },

    resendPending() {
      QWAS.State.pendingMessages = QWAS.State.pendingMessages || new Map();
      for (const [tempId, entry] of QWAS.State.pendingMessages) {
        this._resendEntry(tempId, entry);
      }
    },

    markAllPending() {
      QWAS.State.pendingMessages = QWAS.State.pendingMessages || new Map();
      for (const [tempId] of QWAS.State.pendingMessages) {
        const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
        const m = list.find(x => x._id === tempId);
        if (m) {
          m.status = 'pending_offline';
          m.pending = true;
        }
      }
      const c = document.getElementById('messages');
      if (c) {
        const list = QWAS.State.messagesByChat.get(QWAS.State.current) || [];
        QWAS.Messages.renderAll(list);
      }
    },

    cancelEdit() {
      QWAS.State.editingId = null;
      QWAS.Composer.exitEditMode();
    },

    autoresizeInput() {
      const ta = document.getElementById('msgInput');
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    }
  };

  QWAS.Messages = Messages;
  QWAS.ScrollButton = {
    show(n) {
      const btn = document.getElementById('scrollToBottom');
      const badge = document.getElementById('scrollBadge');
      if (!btn) return;
      QWAS.State.unreadCount = (QWAS.State.unreadCount || 0) + n;
      btn.classList.add('show');
      if (badge) {
        badge.textContent = QWAS.State.unreadCount > 99 ? '99+' : QWAS.State.unreadCount;
        badge.style.display = 'flex';
      }
    },
    hide() {
      const btn = document.getElementById('scrollToBottom');
      const badge = document.getElementById('scrollBadge');
      if (btn) btn.classList.remove('show');
      QWAS.State.unreadCount = 0;
      if (badge) badge.style.display = 'none';
    }
  };
})();
