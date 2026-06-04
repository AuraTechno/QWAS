(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Stories = {
    openCreator() {
      this.showCreator();
    },

    showCreator() {
      const content = `
        <div class="field">
          <label>Текст истории</label>
          <textarea id="storyText" placeholder="Что у вас нового?" maxlength="200" style="min-height:100px;"></textarea>
        </div>
        <div class="field">
          <label>Фон</label>
          <div class="theme-grid" id="storyColors">
            <div class="theme-swatch active" style="background:linear-gradient(135deg, #5e8ee7, #2a7ae0);" data-color="#5e8ee7"></div>
            <div class="theme-swatch" style="background:linear-gradient(135deg, #b78eff, #7c4dff);" data-color="#b78eff"></div>
            <div class="theme-swatch" style="background:linear-gradient(135deg, #ff7eb6, #e91e63);" data-color="#ff7eb6"></div>
            <div class="theme-swatch" style="background:linear-gradient(135deg, #4dd599, #27ae60);" data-color="#4dd599"></div>
            <div class="theme-swatch" style="background:linear-gradient(135deg, #ffd54f, #ff9800);" data-color="#ffd54f"></div>
            <div class="theme-swatch" style="background:linear-gradient(135deg, #5fc7d7, #16a085);" data-color="#5fc7d7"></div>
            <div class="theme-swatch" style="background:linear-gradient(135deg, #ff6b6b, #e74c3c);" data-color="#ff6b6b"></div>
            <div class="theme-swatch" style="background:linear-gradient(135deg, #6ab2f2, #2b5278);" data-color="#6ab2f2"></div>
          </div>
        </div>
      `;
      QWAS.Modals.open({
        title: 'Новая история',
        content,
        actions: [
          { label: 'Отмена', type: 'secondary', onclick: 'QWAS.Modals.close()' },
          { label: 'Опубликовать', type: 'primary', onclick: 'QWAS.Stories.publish()' }
        ]
      });
      document.querySelectorAll('#storyColors .theme-swatch').forEach(s => {
        s.onclick = () => {
          document.querySelectorAll('#storyColors .theme-swatch').forEach(x => x.classList.remove('active'));
          s.classList.add('active');
        };
      });
    },

    async publish() {
      const text = document.getElementById('storyText').value.trim();
      const color = document.querySelector('#storyColors .theme-swatch.active')?.dataset.color || '#5e8ee7';
      if (!text) {
        QWAS.Toast.warning('Введите текст');
        return;
      }
      const r = await QWAS.API.post('/stories/create', { type: 'text', content: text, backgroundColor: color });
      if (r.ok) {
        QWAS.Toast.success('История опубликована');
        QWAS.Modals.close();
        QWAS.App.connectSocket && QWAS.State.socket?.emit && setTimeout(() => QWAS.App.loadGroups(), 200);
      } else {
        QWAS.Toast.error(r.error || 'Ошибка');
      }
    },

    open(author) {
      const stories = QWAS.State.stories[author] || [];
      if (!stories.length) return;
      this.viewer = { author, index: 0 };
      this.renderViewer();
    },

    renderViewer() {
      const { author, index } = this.viewer;
      const stories = QWAS.State.stories[author] || [];
      if (!stories.length) {
        this.closeViewer();
        return;
      }
      const s = stories[index];
      if (!s) return;

      let el = document.getElementById('storyViewer');
      if (!el) {
        el = document.createElement('div');
        el.id = 'storyViewer';
        el.className = 'story-viewer';
        document.body.appendChild(el);
      }

      const user = QWAS.Util.getUserDisplayName({ firstName: s.authorFirstName, username: s.author }) || s.author;
      const content = s.type === 'text'
        ? `<div class="story-text" style="background:${s.backgroundColor};">${QWAS.Util.escapeHtml(s.content)}</div>`
        : (s.type === 'image'
          ? `<img class="story-image" src="${s.url || s.mediaUrl}">`
          : `<video class="story-video" src="${s.url || s.mediaUrl}" autoplay></video>`);

      el.innerHTML = `
        <div class="story-progress">
          ${stories.map((_, i) => `<div class="story-progress-bar"><div class="story-progress-fill ${i < index ? 'completed' : i === index ? 'active' : ''}"></div></div>`).join('')}
        </div>
        <div class="story-header">
          <div class="avatar ${QWAS.Util.gradientFor(author)}">${QWAS.Util.escapeHtml(QWAS.Util.getInitials(user))}</div>
          <div>
            <div class="story-header-name">${QWAS.Util.escapeHtml(user)}</div>
            <div class="story-header-time">${QWAS.Util.relativeTime(s.createdAt)}</div>
          </div>
        </div>
        <button class="story-close" onclick="QWAS.Stories.closeViewer()">✕</button>
        <div class="story-viewer-content">${content}</div>
        <div class="story-nav story-nav-prev" onclick="QWAS.Stories.prev()"></div>
        <div class="story-nav story-nav-next" onclick="QWAS.Stories.next()"></div>
      `;

      requestAnimationFrame(() => {
        const fill = el.querySelector('.story-progress-fill.active');
        if (fill) fill.style.width = '100%';
      });

      this.timer = setTimeout(() => this.next(), 5000);

      if (QWAS.State.socket) {
        QWAS.State.socket.emit('view_story', s._id);
      }
    },

    next() {
      clearTimeout(this.timer);
      const { author, index } = this.viewer;
      const stories = QWAS.State.stories[author] || [];
      if (index + 1 < stories.length) {
        this.viewer.index++;
        this.renderViewer();
      } else {
        const authors = Object.keys(QWAS.State.stories);
        const authorIdx = authors.indexOf(author);
        if (authorIdx + 1 < authors.length) {
          this.open(authors[authorIdx + 1]);
        } else {
          this.closeViewer();
        }
      }
    },

    prev() {
      clearTimeout(this.timer);
      if (this.viewer.index > 0) {
        this.viewer.index--;
        this.renderViewer();
      } else {
        this.closeViewer();
      }
    },

    closeViewer() {
      clearTimeout(this.timer);
      const el = document.getElementById('storyViewer');
      if (el) el.remove();
    }
  };

  QWAS.Stories = Stories;
})();
