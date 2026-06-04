// Прикрепление файлов: выбор, drag-drop, paste, прогресс, геолокация, контакт, опрос
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Attach = {
    init() {
      this._initInputs();
      this._initDragDrop();
      this._initPaste();
      this._initAttachMenu();
    },

    _initInputs() {
      // Создаём скрытые input'ы
      const create = (id, accept) => {
        if (document.getElementById(id)) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.id = id;
        input.accept = accept;
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', (e) => this.onFile(e));
        return input;
      };
      create('filePicker', '*/*');
      create('imagePicker', 'image/*');
      create('videoPicker', 'video/*');
      create('audioPicker', 'audio/*');
    },

    _initDragDrop() {
      const wrap = document.getElementById('messagesWrapper') || document.getElementById('chatContent');
      if (!wrap) return;
      let counter = 0;
      const overlay = document.createElement('div');
      overlay.className = 'drag-drop-overlay';
      overlay.id = 'dragDropOverlay';
      overlay.innerHTML = '<div class="drag-drop-content"><div class="drag-drop-icon">📎</div><div>Перетащите файл сюда</div></div>';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);

      wrap.addEventListener('dragenter', (e) => {
        if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        counter++;
        overlay.style.display = 'flex';
      });
      wrap.addEventListener('dragleave', (e) => {
        e.preventDefault();
        counter = Math.max(0, counter - 1);
        if (counter === 0) overlay.style.display = 'none';
      });
      wrap.addEventListener('dragover', (e) => { e.preventDefault(); });
      wrap.addEventListener('drop', (e) => {
        e.preventDefault();
        counter = 0;
        overlay.style.display = 'none';
        const files = e.dataTransfer?.files;
        if (!files || !files.length) return;
        for (const f of files) this._addFile(f);
      });
    },

    _initPaste() {
      const ta = document.getElementById('msgInput');
      if (!ta) return;
      ta.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const it of items) {
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f) {
              e.preventDefault();
              this._addFile(f);
            }
          }
        }
      });
    },

    _initAttachMenu() {
      // Привязка пунктов меню прикрепления
      const map = {
        'attach-photo': 'image',
        'attach-video': 'video',
        'attach-file': 'file',
        'attach-audio': 'audio',
        'attach-location': 'location',
        'attach-contact': 'contact',
        'attach-poll': 'poll',
        'attach-round': 'round'
      };
      Object.keys(map).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', () => {
          if (map[id] === 'round') return this.startRound();
          if (map[id] === 'location') return this.pickLocation();
          if (map[id] === 'contact') return this.pickContact();
          if (map[id] === 'poll') return this.pickPoll();
          this.pick(map[id]);
        });
      });
    },

    _addFile(file) {
      // Используем onFile, эмулируя событие
      this.onFile({ target: { files: [file], dataset: {} } });
    },

    pick(type) {
      if (QWAS.Composer) QWAS.Composer.hideAttachMenu();
      const map = {
        image: 'imagePicker',
        video: 'videoPicker',
        audio: 'audioPicker',
        file: 'filePicker'
      };
      const id = map[type] || 'filePicker';
      const input = document.getElementById(id);
      if (!input) return;
      input.value = '';
      input.dataset.type = type;
      input.click();
    },

    startRound() {
      if (QWAS.Composer) QWAS.Composer.hideAttachMenu();
      if (!navigator.mediaDevices?.getUserMedia) {
        QWAS.Toast.error('Камера недоступна');
        return;
      }
      if (QWAS.VideoRecorder) QWAS.VideoRecorder.open();
    },

    pickLocation() {
      if (QWAS.Composer) QWAS.Composer.hideAttachMenu();
      if (!navigator.geolocation) {
        QWAS.Toast.error('Геолокация недоступна');
        return;
      }
      QWAS.Toast.info('Определяем местоположение...');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          QWAS.State.pendingFiles.push({
            type: 'location',
            lat: latitude,
            lng: longitude,
            name: 'Моя геопозиция'
          });
          if (QWAS.Composer) {
            QWAS.Composer.renderAttachments();
            QWAS.Composer.updateSendButton();
          }
          QWAS.Toast.success('Местоположение добавлено');
        },
        (err) => QWAS.Toast.error('Не удалось определить местоположение: ' + (err.message || '')),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    },

    pickContact() {
      if (QWAS.Composer) QWAS.Composer.hideAttachMenu();
      if (QWAS.Modals) QWAS.Modals.openContactPicker();
    },

    pickPoll() {
      if (QWAS.Composer) QWAS.Composer.hideAttachMenu();
      if (QWAS.Modals) QWAS.Modals.openCreatePoll();
    },

    async onFile(e, forceType) {
      const file = e.target.files?.[0];
      if (!file) return;
      const requestedType = e.target.dataset.type || forceType || 'file';

      // Лимит размера (50МБ)
      if (file.size > 50 * 1024 * 1024) {
        QWAS.Toast.error('Файл слишком большой (макс 50 МБ)');
        e.target.value = '';
        return;
      }

      const placeholder = {
        type: requestedType,
        url: '',
        name: file.name,
        size: file.size,
        mime: file.type,
        uploading: true,
        progress: 0
      };
      const uploadIdx = QWAS.State.pendingFiles.length;
      QWAS.State.pendingFiles.push(placeholder);
      if (QWAS.Composer) QWAS.Composer.renderAttachments();
      QWAS.Toast.info('Загружаем файл...');

      const onProgress = (p) => {
        const list = QWAS.State.pendingFiles;
        const target = list[uploadIdx];
        if (target && target.uploading) {
          target.progress = p;
          if (QWAS.Composer) QWAS.Composer.renderAttachments();
        }
      };

      try {
        const r = await QWAS.API.uploadSmart(
          file,
          ['image', 'video', 'audio'].includes(requestedType) ? { type: requestedType, forceType: requestedType } : {},
          onProgress
        );
        const list = QWAS.State.pendingFiles;
        if (list[uploadIdx] && list[uploadIdx].uploading) {
          if (r && r.ok) {
            list[uploadIdx] = { ...r.file, type: requestedType };
            QWAS.Toast.success('Файл добавлен');
          } else {
            list.splice(uploadIdx, 1);
            QWAS.Toast.error((r && r.error) || 'Ошибка загрузки');
          }
        }
        if (QWAS.Composer) {
          QWAS.Composer.renderAttachments();
          QWAS.Composer.updateSendButton();
        }
      } catch (err) {
        const list = QWAS.State.pendingFiles;
        if (list[uploadIdx] && list[uploadIdx].uploading) list.splice(uploadIdx, 1);
        if (QWAS.Composer) QWAS.Composer.renderAttachments();
        QWAS.Toast.error('Ошибка загрузки');
      } finally {
        e.target.value = '';
      }
    },

    playVoice(btn) {
      const wrap = btn.closest('.att-voice, .msg-voice, .msg-round');
      if (!wrap) return;
      const url = wrap.dataset.url || wrap.querySelector('audio, video')?.src;
      if (!url) return;
      const audio = wrap.querySelector('audio') || (() => {
        const a = document.createElement('audio');
        a.src = url;
        wrap.appendChild(a);
        return a;
      })();
      if (audio.paused) audio.play().catch(() => {});
      else { audio.pause(); audio.currentTime = 0; }
    }
  };

  window.QWAS.Attach = Attach;
})();
