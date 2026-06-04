// Сторис
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Stories = {
    list: [],
    init() {
      this.reload();
      this._bindAdd();
    },
    setStories(list) { this.list = list || []; this._render(); },
    async reload() {
      const r = await QWAS.API.storiesFeed();
      if (r && r.ok) {
        this.list = r.stories;
        this._render();
      }
    },
    _bindAdd() {
      const btn = document.getElementById('storiesAddBtn');
      if (btn) btn.addEventListener('click', () => this._openCreator());
    },
    _openCreator() {
      // создание сторис через input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const isVideo = file.type.startsWith('video');
        const r = await QWAS.API.uploadSmart(file, { type: isVideo ? 'video' : 'image' });
        if (!r.ok) { QWAS.Toast.error('Ошибка загрузки'); return; }
        const cap = prompt('Подпись (необязательно):') || '';
        const r2 = await QWAS.API.createStory({
          type: isVideo ? 'video' : 'image',
          mediaUrl: r.file.url,
          textCaption: cap
        });
        if (r2 && r2.ok) {
          QWAS.Toast.success('Сторис опубликован');
          this.reload();
        } else {
          QWAS.Toast.error('Ошибка');
        }
      };
      input.click();
    },
    _render() {
      const rail = document.getElementById('storiesRail');
      if (!rail) return;
      // Группируем по пользователю
      const byUser = new Map();
      for (const s of this.list) {
        if (!byUser.has(s.userId)) byUser.set(s.userId, []);
        byUser.get(s.userId).push(s);
      }
      const me = QWAS.State.me;
      const meId = me?.id;
      const items = [];
      // Сначала "своя" сторис (создать)
      items.push(`<div class="story-item story-add" id="storiesAddBtn">
        <div class="story-avatar">${me ? QWAS.Util.avatarHtml(me, 56) : '<div class="avatar"></div>'}</div>
        <div class="story-name">Ваша сторис</div>
      </div>`);
      for (const [uid, list] of byUser) {
        const first = list[0];
        const userInfo = { firstName: first.firstName, lastName: first.lastName, username: first.username, avatarUrl: first.avatarUrl };
        const allViewed = list.every(s => s.isViewed);
        items.push(`<div class="story-item ${allViewed ? 'viewed' : 'new'}" data-user-id="${uid}">
          <div class="story-avatar">${QWAS.Util.avatarHtml(userInfo, 56)}</div>
          <div class="story-name">${QWAS.Util.escapeHtml(first.firstName || first.username)}</div>
        </div>`);
      }
      rail.innerHTML = items.join('');
      rail.querySelectorAll('.story-item[data-user-id]').forEach(el => {
        el.addEventListener('click', () => this._view(parseInt(el.dataset.userId)));
      });
    },
    async _view(userId) {
      // Берём первую непросмотренную сторис пользователя
      const list = this.list.filter(s => s.userId === userId);
      if (!list.length) return;
      this._showViewer(list, 0);
    },
    _showViewer(list, idx) {
      const s = list[idx];
      // Помечаем просмотренной
      QWAS.API.viewStory(s.id);
      s.isViewed = true;
      // Создаём оверлей
      const o = document.createElement('div');
      o.className = 'story-viewer';
      o.innerHTML = `
        <div class="story-viewer-progress">
          ${list.map((_, i) => `<div class="story-viewer-bar ${i < idx ? 'done' : i === idx ? 'active' : ''}"><div></div></div>`).join('')}
        </div>
        <div class="story-viewer-header">
          ${QWAS.Util.avatarHtml({ firstName: s.firstName, lastName: s.lastName, username: s.username, avatarUrl: s.avatarUrl }, 32)}
          <div class="story-viewer-name">${QWAS.Util.escapeHtml(s.firstName || s.username)}</div>
          <button class="story-viewer-close">✕</button>
        </div>
        <div class="story-viewer-content">
          ${s.type === 'video'
            ? `<video src="${QWAS.Util.escapeAttr(s.mediaUrl)}" autoplay playsinline></video>`
            : `<img src="${QWAS.Util.escapeAttr(s.mediaUrl)}" alt="">`}
          ${s.textCaption ? `<div class="story-viewer-caption">${QWAS.Util.escapeHtml(s.textCaption)}</div>` : ''}
        </div>
      `;
      document.body.appendChild(o);
      o.querySelector('.story-viewer-close').addEventListener('click', () => {
        o.remove();
        this._render();
      });
      // Авто-переход через 5 секунд
      setTimeout(() => {
        if (idx + 1 < list.length) {
          o.remove();
          this._showViewer(list, idx + 1);
        } else {
          o.remove();
          this._render();
        }
      }, 5000);
    }
  };
  window.QWAS.Stories = Stories;
})();
