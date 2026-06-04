// Папки чатов
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Folders = {
    list: [],
    init() {
      this.reload();
    },
    async reload() {
      const r = await QWAS.API.folders();
      if (r && r.ok) {
        this.list = r.folders;
        this._render();
      }
    },
    _render() {
      const bar = document.getElementById('foldersBar');
      if (!bar) return;
      if (!this.list.length) { bar.style.display = 'none'; return; }
      bar.style.display = 'flex';
      bar.innerHTML = this.list.map(f => `
        <button class="folder-chip" data-id="${f.id}" title="${QWAS.Util.escapeAttr(f.name)}">
          ${f.emoji || '📁'} ${QWAS.Util.escapeHtml(f.name)}
        </button>
      `).join('') + `<button class="folder-chip folder-add" data-action="add" title="Создать папку">+</button>`;
      bar.querySelectorAll('.folder-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.action === 'add') this._createPrompt();
          else this._open(parseInt(btn.dataset.id));
        });
      });
    },
    _open(id) {
      const f = this.list.find(x => x.id === id);
      if (!f) return;
      // Фильтруем чаты
      QWAS.Chats.currentTab = 'folder_' + id;
      QWAS.Chats.render();
    },
    _createPrompt() {
      const name = prompt('Название папки:');
      if (!name) return;
      QWAS.API.createFolder({ name }).then(() => this.reload());
    }
  };
  window.QWAS.Folders = Folders;
})();
