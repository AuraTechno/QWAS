(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Attach = {
    init() {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'filePicker';
      input.style.display = 'none';
      input.accept = '*/*';
      document.body.appendChild(input);
      input.addEventListener('change', (e) => this.onFile(e));

      const videoInput = document.createElement('input');
      videoInput.type = 'file';
      videoInput.id = 'videoPicker';
      videoInput.accept = 'video/*';
      videoInput.style.display = 'none';
      document.body.appendChild(videoInput);
      videoInput.addEventListener('change', (e) => this.onFile(e, 'video'));

      const audioInput = document.createElement('input');
      audioInput.type = 'file';
      audioInput.id = 'audioPicker';
      audioInput.accept = 'audio/*';
      audioInput.style.display = 'none';
      document.body.appendChild(audioInput);
      audioInput.addEventListener('change', (e) => this.onFile(e, 'audio'));
    },

    toggle() { QWAS.Composer.toggleAttach(); },

    pick(type) {
      QWAS.Composer.hideAttachMenu();
      const inputMap = {
        image: { id: 'filePicker', accept: 'image/*' },
        video: { id: 'videoPicker', accept: 'video/*' },
        audio: { id: 'audioPicker', accept: 'audio/*' },
        file: { id: 'filePicker', accept: '*/*' }
      };
      const cfg = inputMap[type] || inputMap.file;
      const input = document.getElementById(cfg.id) || this.createInput(cfg);
      input.value = '';
      input.accept = cfg.accept;
      input.dataset.type = type;
      input.click();
    },

    createInput(cfg) {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = cfg.id;
      input.accept = cfg.accept;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', (e) => this.onFile(e));
      return input;
    },

    startRound() {
      QWAS.Composer.hideAttachMenu();
      if (!navigator.mediaDevices?.getUserMedia) {
        QWAS.Toast.error('Камера недоступна');
        return;
      }
      this.openRoundRecorder();
    },

    pickLocation() {
      QWAS.Composer.hideAttachMenu();
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
          QWAS.Composer.updateSendButton();
          QWAS.Toast.success('Местоположение добавлено');
        },
        (err) => QWAS.Toast.error('Не удалось определить местоположение')
      );
    },

    pickContact() {
      QWAS.Composer.hideAttachMenu();
      QWAS.Modals.openContactPicker();
    },

    pickPoll() {
      QWAS.Composer.hideAttachMenu();
      QWAS.Modals.openCreatePoll();
    },

    async onFile(e, forceType) {
      const file = e.target.files?.[0];
      if (!file) return;
      const requestedType = e.target.dataset.type || forceType || 'file';

      if (file.size > QWAS.Config.MAX_FILE_SIZE) {
        QWAS.Toast.error('Файл слишком большой (макс 50 МБ)');
        return;
      }

      QWAS.Toast.info('Загружаем файл...');

      const r = await QWAS.API.upload(file, requestedType === 'image' || requestedType === 'video' || requestedType === 'audio' ? { forceType: requestedType } : {});
      if (!r.ok) {
        QWAS.Toast.error(r.error || 'Ошибка загрузки');
        return;
      }

      QWAS.State.pendingFiles.push(r.file);
      QWAS.Composer.renderAttachments();
      QWAS.Composer.updateSendButton();
      QWAS.Toast.success('Файл добавлен');
    },

    playVoice(btn) {
      const wrap = btn.closest('.att-voice');
      if (!wrap) return;
      const url = wrap.dataset.url;
      const audio = new Audio(url);
      const bars = wrap.querySelectorAll('.att-voice-wave span');
      const total = parseFloat(wrap.dataset.duration) || 0;
      const icon = btn.querySelector('svg');

      btn.classList.add('playing');
      icon.innerHTML = '<path fill="currentColor" d="M6 6h4v12H6zm8 0h4v12h-4z"/>';

      audio.play().catch(() => {});

      const startTime = Date.now();
      const tick = () => {
        if (audio.paused || audio.ended) {
          btn.classList.remove('playing');
          icon.innerHTML = '<path fill="currentColor" d="M8 5v14l11-7z"/>';
          bars.forEach(b => { b.style.opacity = ''; });
          return;
        }
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(1, elapsed / total);
        bars.forEach((b, i) => {
          b.style.opacity = i / bars.length < progress ? '1' : '0.3';
        });
        requestAnimationFrame(tick);
      };
      audio.addEventListener('ended', () => {
        btn.classList.remove('playing');
        icon.innerHTML = '<path fill="currentColor" d="M8 5v14l11-7z"/>';
        bars.forEach(b => { b.style.opacity = ''; });
      });
      audio.addEventListener('play', tick);

      wrap._audio = audio;
    },

    openRoundRecorder() {
      const overlay = document.createElement('div');
      overlay.className = 'call-overlay';
      overlay.innerHTML = `
        <div style="text-align:center; color:white;">
          <video id="roundPreview" autoplay muted style="width:300px;height:300px;border-radius:50%;object-fit:cover;background:black;"></video>
          <div id="roundTimer" style="margin-top:20px;font-size:18px;">0:00</div>
        </div>
        <div class="call-actions">
          <button class="call-btn danger" id="roundStop">
            <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M6 6h12v12H6z"/></svg>
          </button>
        </div>
      `;
      document.body.appendChild(overlay);

      let stream, recorder, chunks = [];
      let startTime = 0;
      let timerInt;

      const cleanup = () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        if (timerInt) clearInterval(timerInt);
        overlay.remove();
      };

      const start = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 }, audio: true });
          const video = overlay.querySelector('#roundPreview');
          video.srcObject = stream;
          recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
          recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const file = new File([blob], 'round-' + Date.now() + '.webm', { type: 'video/webm' });
            const r = await QWAS.API.upload(file, { forceType: 'round' });
            if (r.ok) {
              QWAS.State.pendingFiles.push(r.file);
              QWAS.Composer.renderAttachments();
              QWAS.Composer.updateSendButton();
            } else {
              QWAS.Toast.error('Ошибка загрузки');
            }
            cleanup();
          };
          recorder.start();
          startTime = Date.now();
          const timerEl = overlay.querySelector('#roundTimer');
          timerInt = setInterval(() => {
            const s = (Date.now() - startTime) / 1000;
            timerEl.textContent = QWAS.Util.formatDuration(s);
          }, 100);
        } catch (err) {
          QWAS.Toast.error('Не удалось получить доступ к камере');
          cleanup();
        }
      };

      overlay.querySelector('#roundStop').onclick = () => {
        if (recorder && recorder.state === 'recording') {
          recorder.stop();
        } else {
          cleanup();
        }
      };

      start();
    }
  };

  QWAS.Attach = Attach;
})();
