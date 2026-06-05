// API клиент: fetch обертка + chunked upload + smart upload
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  async function request(url, options = {}) {
    const token = QWAS.State.getToken();
    const headers = options.headers ? { ...options.headers } : {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { ...options, headers };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      return { ok: false, error: 'Сеть недоступна' };
    }
    let data;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      if (res.status === 401) {
        // token invalid — try to clear
        try { localStorage.removeItem('qwas_token'); } catch {}
        QWAS.State.token = null;
      }
      return data || { ok: false, error: `HTTP ${res.status}` };
    }
    return data;
  }

  const API = {
    request,
    get(url) { return request(url, { method: 'GET' }); },
    post(url, body) { return request(url, { method: 'POST', body }); },
    patch(url, body) { return request(url, { method: 'PATCH', body }); },
    delete(url, body) { return request(url, { method: 'DELETE', body }); },

    // === Auth ===
    login(username, password) { return this.post('/login', { username, password }); },
    register(data) { return this.post('/register', data); },
    me() { return this.get('/me'); },
    logout() { return this.post('/logout', {}); },
    checkUsername(username) { return this.get('/check-username?u=' + encodeURIComponent(username)); },
    checkEmail(email) { return this.get('/check-email?e=' + encodeURIComponent(email)); },

    // === Profile ===
    updateProfile(patch) { return this.patch('/profile', patch); },
    contacts() { return this.get('/profile/contacts'); },
    addContact(username) { return this.post(`/profile/contacts/${encodeURIComponent(username)}`); },
    removeContact(username) { return this.delete(`/profile/contacts/${encodeURIComponent(username)}`); },
    openDM(username) { return this.post(`/profile/dm/${encodeURIComponent(username)}`); },

    // === Auth extended ===
    sessions() { return this.get('/sessions'); },
    terminateSession(id) { return this.delete(`/sessions/${id}`); },
    terminateAllSessions() { return this.post('/sessions/terminate-all', {}); },

    // === Channels ===
    checkChannelUsername(u) { return this.get(`/groups/check-channel-username?u=${encodeURIComponent(u)}`); },
    createChannel(data) { return this.post('/groups/channel', data); },
    subscribeChannel(id) { return this.post(`/groups/${id}/subscribe`); },
    unsubscribeChannel(id) { return this.delete(`/groups/${id}/subscribe`); },
    channelSubscribers(id, params = {}) {
      const q = new URLSearchParams(params).toString();
      return this.get(`/groups/${id}/subscribers${q ? '?' + q : ''}`);
    },
    searchChannels(q) { return this.get(`/groups/search-channels?q=${encodeURIComponent(q)}`); },
    myChannels() { return this.get('/groups/my-channels'); },

    // === Chats ===
    chats(tab = 'all') { return this.get(`/chats?tab=${tab}`); },
    archivedChats() { return this.get('/chats/archived'); },
    pinnedChats() { return this.get('/chats/pinned'); },
    chat(id) { return this.get(`/chats/${id}`); },
    chatInfo(id) { return this.get(`/chats/${id}/info`); },
    chatMessages(id, { beforeId, limit } = {}) {
      const params = new URLSearchParams();
      if (beforeId) params.set('beforeId', beforeId);
      if (limit) params.set('limit', limit);
      const qs = params.toString();
      return this.get(`/chats/${id}/messages${qs ? '?' + qs : ''}`);
    },
    chatMedia(id, { type, beforeId, limit } = {}) {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (beforeId) params.set('beforeId', beforeId);
      if (limit) params.set('limit', limit);
      const qs = params.toString();
      return this.get(`/chats/${id}/media${qs ? '?' + qs : ''}`);
    },
    searchInChat(id, q) { return this.get(`/chats/${id}/search?q=${encodeURIComponent(q)}`); },
    markRead(id) { return this.post(`/chats/${id}/read`, {}); },
    setPinned(id, pinned) { return this.post(`/chats/${id}/pin`, { pinned }); },
    setArchived(id, archived) { return this.post(`/chats/${id}/archive`, { archived }); },
    setMuted(id, muted) { return this.post(`/chats/${id}/mute`, { muted }); },
    pinMessage(id, messageId) { return this.post(`/chats/${id}/pin-message`, { messageId }); },
    unpinMessage(id) { return this.delete(`/chats/${id}/pin-message`); },
    getPinnedMessage(id) { return this.get(`/chats/${id}/pinned`); },

    // === Groups ===
    createGroup(data) { return this.post('/groups', data); },
    groupInfo(id) { return this.get(`/groups/${id}`); },
    addGroupMembers(id, usernames) { return this.post(`/groups/${id}/members`, { usernames }); },
    removeGroupMember(id, username) { return this.delete(`/groups/${id}/members/${encodeURIComponent(username)}`); },

    // === Search ===
    searchUsers(q) { return this.get(`/search/users?q=${encodeURIComponent(q)}`); },
    searchMessages(q) { return this.get(`/search/messages?q=${encodeURIComponent(q)}`); },
    searchChats(q) { return this.get(`/search/chats?q=${encodeURIComponent(q)}`); },

    // === Stories ===
    storiesFeed() { return this.get('/stories/feed'); },
    createStory(data) { return this.post('/stories', data); },
    viewStory(id) { return this.post(`/stories/${id}/view`, {}); },
    deleteStory(id) { return this.delete(`/stories/${id}`); },

    // === Folders ===
    folders() { return this.get('/folders'); },
    createFolder(data) { return this.post('/folders', data); },
    updateFolder(id, data) { return this.patch(`/folders/${id}`, data); },
    deleteFolder(id) { return this.delete(`/folders/${id}`); },
    addChatToFolder(id, chatId) { return this.post(`/folders/${id}/chats/${chatId}`); },

    // === Notifications ===
    notifications() { return this.get('/notifications'); },
    markNotificationsRead(ids) { return this.post('/notifications/read', { ids }); },
    markAllNotificationsRead() { return this.post('/notifications/read-all', {}); },

    // === Settings ===
    saveSettings(patch) { return this.patch('/profile', { settings: patch }); },

    // === Upload ===
    // Простая загрузка (до 2МБ)
    async upload(file, extra = {}) {
      const fd = new FormData();
      fd.append('file', file);
      if (extra.type) fd.append('type', extra.type);
      return this.post('/upload', fd);
    },

    // Чанковая загрузка > 3МБ с прогрессом
    async uploadSmart(file, extra = {}, onProgress) {
      if (file.size > 3 * 1024 * 1024 && typeof onProgress === 'function') {
        return this.uploadChunkWithProgress(file, extra, onProgress);
      }
      if (onProgress) onProgress(0.1);
      const res = await this.upload(file, extra);
      if (onProgress) onProgress(1);
      return res;
    },

    async uploadChunkWithProgress(file, extra = {}, onProgress) {
      const init = await this.post('/upload/chunk/init', {
        name: file.name,
        size: file.size,
        mime: file.type,
        type: extra.type || extra.forceType
      });
      if (!init || !init.ok) return init;
      const uploadId = init.uploadId;
      const chunkSize = init.chunkSize || 1024 * 1024;
      const total = Math.ceil(file.size / chunkSize);
      let uploaded = 0;
      for (let i = 0; i < total; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const blob = file.slice(start, end);
        const fd = new FormData();
        fd.append('chunk', blob);
        fd.append('index', String(i));
        const r = await this.post(`/upload/chunk/${uploadId}`, fd);
        if (!r || !r.ok) {
          return r || { ok: false, error: 'chunk failed' };
        }
        uploaded += end - start;
        onProgress(uploaded / file.size);
      }
      return this.post(`/upload/chunk/${uploadId}/complete`, {});
    },

    abortUpload(uploadId) {
      return this.delete(`/upload/chunk/${uploadId}`);
    },

    deleteUploaded(url) {
      return this.delete('/upload/file', { url });
    }
  };

  window.QWAS.API = API;
})();
