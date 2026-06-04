(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const VideoRecorder = {
    active: false,
    stream: null,
    recorder: null,
    chunks: [],
    startTime: 0,
    timerInt: null,
    overlay: null,
    quality: 'sd',
    fps: 30,
    facing: 'user',

    qualities: {
      ld:  { width: 240,  height: 240,  bitrate: 400000  },
      sd:  { width: 480,  height: 480,  bitrate: 1200000 },
      hd:  { width: 720,  height: 720,  bitrate: 2500000 },
      fhd: { width: 1080, height: 1080, bitrate: 5000000 }
    },

    applySettings() {
      const s = QWAS.State.settings || {};
      if (s.videoQuality && this.qualities[s.videoQuality]) this.quality = s.videoQuality;
      if ([30, 60].includes(s.videoFps)) this.fps = s.videoFps;
    },

    open() {
      this.applySettings();
      this.createOverlay();
      this.start();
    },

    createOverlay() {
      const o = document.createElement('div');
      o.className = 'call-overlay round-recorder';
      o.innerHTML = `
        <div class="round-rec-wrap">
          <video id="roundPreview" autoplay muted playsinline></video>
          <div class="round-rec-fps" id="roundFps">${this.fps}fps · ${this.quality.toUpperCase()}</div>
        </div>
        <div id="roundTimer" class="round-rec-timer">0:00</div>
        <div class="round-rec-actions">
          <button class="round-rec-btn secondary" id="roundFlip" title="Сменить камеру">
            <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 4h-3.17L15 2H9L7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m-5 11.5V13H9v-2h6V8.5l3.5 3.5z"/></svg>
          </button>
          <button class="round-rec-btn primary" id="roundToggle" title="Начать запись">
            <span class="rec-dot"></span>
          </button>
          <button class="round-rec-btn secondary" id="roundClose" title="Отмена">
            <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      `;
      document.body.appendChild(o);
      this.overlay = o;

      o.querySelector('#roundClose').onclick = () => this.cancel();
      o.querySelector('#roundFlip').onclick = () => this.flip();
      o.querySelector('#roundToggle').onclick = () => this.toggle();
    },

    async start() {
      if (this.active) return;
      const q = this.qualities[this.quality];
      const fps = this.fps;
      const facing = this.facing;
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: q.width },
            height: { ideal: q.height },
            frameRate: { ideal: fps, max: fps }
          },
          audio: true
        });
        const video = this.overlay.querySelector('#roundPreview');
        video.srcObject = this.stream;
        this.active = true;
      } catch (err) {
        QWAS.Toast.error('Не удалось получить доступ к камере: ' + (err.message || err.name));
        this.cancel();
      }
    },

    async flip() {
      this.facing = this.facing === 'user' ? 'environment' : 'user';
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      await this.start();
    },

    toggle() {
      if (!this.stream) return;
      if (this.recorder && this.recorder.state === 'recording') {
        this.stop();
      } else {
        this.record();
      }
    },

    record() {
      if (!this.stream) return;
      const q = this.qualities[this.quality];
      this.chunks = [];
      let mimeType = 'video/webm';
      if (typeof MediaRecorder !== 'undefined') {
        const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        for (const t of candidates) {
          if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
        }
      }
      try {
        this.recorder = new MediaRecorder(this.stream, { mimeType, videoBitsPerSecond: q.bitrate });
      } catch (e) {
        try { this.recorder = new MediaRecorder(this.stream); }
        catch { QWAS.Toast.error('Запись видео не поддерживается'); return; }
      }
      this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
      this.recorder.onstop = () => this.onStop();
      this.recorder.start(100);
      this.startTime = Date.now();
      this.overlay.classList.add('recording');
      this.overlay.querySelector('#roundToggle').classList.add('recording');
      this.timerInt = setInterval(() => {
        const s = (Date.now() - this.startTime) / 1000;
        this.overlay.querySelector('#roundTimer').textContent = QWAS.Util.formatDuration(s);
      }, 100);
    },

    stop() {
      if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
    },

    async onStop() {
      clearInterval(this.timerInt);
      this.overlay.classList.remove('recording');
      const duration = (Date.now() - this.startTime) / 1000;
      if (duration < 0.3 || this.chunks.length === 0) {
        this.cleanup();
        return;
      }
      const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'video/webm' });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `round-${Date.now()}.${ext}`, { type: blob.type });
      QWAS.Toast.info('Загружаем кружок...');
      const r = await QWAS.API.upload(file, { forceType: 'round' });
      if (r.ok) {
        r.file.duration = Math.round(duration);
        QWAS.State.pendingFiles.push(r.file);
        QWAS.Composer.renderAttachments();
        QWAS.Composer.updateSendButton();
        QWAS.Toast.success('Кружок добавлен');
      } else {
        QWAS.Toast.error(r.error || 'Ошибка загрузки');
      }
      this.cleanup();
    },

    cancel() {
      if (this.recorder && this.recorder.state === 'recording') {
        this.recorder.onstop = null;
        try { this.recorder.stop(); } catch {}
      }
      this.cleanup();
    },

    cleanup() {
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.timerInt) clearInterval(this.timerInt);
      this.chunks = [];
      this.recorder = null;
      this.active = false;
      if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    }
  };

  const Voice = {
    init() {},

    qualities: {
      low:    { audioBitsPerSecond: 32000 },
      medium: { audioBitsPerSecond: 64000 },
      high:   { audioBitsPerSecond: 128000 }
    },

    applySettings() {
      const s = QWAS.State.settings || {};
      this.quality = this.qualities[s.voiceQuality] ? s.voiceQuality : 'medium';
    },

    async start(e) {
      e.preventDefault();
      if (QWAS.State.recording) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        QWAS.Toast.error('Микрофон недоступен');
        return;
      }
      this.applySettings();
      const q = this.qualities[this.quality];

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: QWAS.State.settings.echoCancellation !== false,
            noiseSuppression: QWAS.State.settings.noiseSuppression !== false,
            autoGainControl: QWAS.State.settings.autoGainControl !== false,
            sampleRate: 48000
          }
        });
        QWAS.State.recording = true;
        QWAS.State.recordStream = stream;
        QWAS.State.recordChunks = [];

        const mr = new MediaRecorder(stream, { mimeType: this.getMimeType(), audioBitsPerSecond: q.audioBitsPerSecond });
        QWAS.State.mediaRecorder = mr;
        mr.ondataavailable = ev => { if (ev.data.size > 0) QWAS.State.recordChunks.push(ev.data); };
        mr.start(100);

        QWAS.State.recordStartTime = Date.now();
        const ui = document.getElementById('voiceRecording');
        if (ui) ui.style.display = 'flex';
        const timerEl = document.getElementById('voiceTimer');
        if (timerEl) {
          this.timerInt = setInterval(() => {
            const s = (Date.now() - QWAS.State.recordStartTime) / 1000;
            timerEl.textContent = QWAS.Util.formatDuration(s);
            this.animateWave();
          }, 100);
        }
      } catch (err) {
        QWAS.Toast.error('Нет доступа к микрофону');
      }
    },

    getMimeType() {
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];
      for (const t of types) {
        if (MediaRecorder.isTypeSupported(t)) return t;
      }
      return 'audio/webm';
    },

    animateWave() {
      const spans = document.querySelectorAll('#voiceWave span');
      spans.forEach(s => {
        s.style.height = (15 + Math.random() * 70) + '%';
      });
    },

    async stop() {
      if (!QWAS.State.recording) return;
      QWAS.State.recording = false;
      clearInterval(this.timerInt);

      const mr = QWAS.State.mediaRecorder;
      if (!mr) return;

      const chunks = QWAS.State.recordChunks;
      const stream = QWAS.State.recordStream;
      const duration = (Date.now() - QWAS.State.recordStartTime) / 1000;

      mr.stop();
      stream.getTracks().forEach(t => t.stop());

      const ui = document.getElementById('voiceRecording');
      if (ui) ui.style.display = 'none';

      if (duration < 0.5 || chunks.length === 0) return;

      const blob = new Blob(chunks, { type: mr.mimeType });
      const ext = mr.mimeType.includes('webm') ? 'webm' : mr.mimeType.includes('ogg') ? 'ogg' : 'm4a';
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mr.mimeType });

      QWAS.Toast.info('Загружаем голосовое...');
      const r = await QWAS.API.upload(file, { forceType: 'voice' });
      if (!r.ok) {
        QWAS.Toast.error('Ошибка загрузки');
        return;
      }
      r.file.duration = Math.round(duration);
      QWAS.State.pendingFiles.push(r.file);
      QWAS.Composer.renderAttachments();
      QWAS.Composer.updateSendButton();
      QWAS.Toast.success('Голосовое добавлено');
    },

    cancel() {
      if (!QWAS.State.recording) return;
      QWAS.State.recording = false;
      clearInterval(this.timerInt);
      if (QWAS.State.mediaRecorder) QWAS.State.mediaRecorder.stop();
      if (QWAS.State.recordStream) QWAS.State.recordStream.getTracks().forEach(t => t.stop());
      QWAS.State.recordChunks = [];
      const ui = document.getElementById('voiceRecording');
      if (ui) ui.style.display = 'none';
    }
  };

  QWAS.Voice = Voice;
  QWAS.VideoRecorder = VideoRecorder;
})();
