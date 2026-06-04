// Запись голоса и видео-кружков, hold-to-record
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  // === VideoRecorder для кружков ===
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
    recording: false,
    audioCtx: null,
    audioAnalyser: null,
    amplitudes: [],

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
      this.amplitudes = [];
      this._createOverlay();
      this._start();
    },

    _createOverlay() {
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
        <div class="round-rec-hint">Удерживайте центральную кнопку</div>
      `;
      document.body.appendChild(o);
      this.overlay = o;

      o.querySelector('#roundClose').addEventListener('click', () => this.cancel());
      o.querySelector('#roundFlip').addEventListener('click', () => this.flip());
      const toggle = o.querySelector('#roundToggle');
      const start = (e) => { e.preventDefault(); if (!this.recording) this._record(); };
      const stop = (e) => { e.preventDefault(); if (this.recording) this._stopAndSend(); };
      toggle.addEventListener('mousedown', start);
      toggle.addEventListener('mouseup', stop);
      toggle.addEventListener('mouseleave', stop);
      toggle.addEventListener('touchstart', start, { passive: false });
      toggle.addEventListener('touchend', stop, { passive: false });
    },

    async _start() {
      if (this.stream) return;
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
        const video = this.overlay?.querySelector('#roundPreview');
        if (video) video.srcObject = this.stream;
        this.active = true;
        // audio analyser
        this._initAnalyser(this.stream);
      } catch (err) {
        QWAS.Toast.error('Не удалось получить доступ к камере: ' + (err.message || err.name));
        this.cancel();
      }
    },

    _initAnalyser(stream) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        this.audioCtx = ctx;
        this.audioAnalyser = an;
      } catch (e) { /* noop */ }
    },

    _readAmplitude() {
      if (!this.audioAnalyser) return 0;
      const arr = new Uint8Array(this.audioAnalyser.frequencyBinCount);
      this.audioAnalyser.getByteFrequencyData(arr);
      let sum = 0;
      for (const v of arr) sum += v;
      return sum / arr.length / 255;
    },

    async flip() {
      if (!this.stream) return;
      this.facing = this.facing === 'user' ? 'environment' : 'user';
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      await this._start();
    },

    _record() {
      if (!this.stream) return;
      const q = this.qualities[this.quality];
      const mimeType = this._pickMime();
      try {
        this.recorder = new MediaRecorder(this.stream, {
          mimeType,
          videoBitsPerSecond: q.bitrate,
          audioBitsPerSecond: 64000
        });
      } catch (e) {
        QWAS.Toast.error('Запись не поддерживается');
        return;
      }
      this.chunks = [];
      this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.recorder.onstop = () => this._onRecorded();
      this.recorder.start(200);
      this.recording = true;
      this.startTime = Date.now();
      this._tickTimer();
      this._tickAmplitudes();
    },

    _tickTimer() {
      const el = this.overlay?.querySelector('#roundTimer');
      if (!el) return;
      this.timerInt = setInterval(() => {
        const sec = Math.floor((Date.now() - this.startTime) / 1000);
        el.textContent = QWAS.Util.formatDuration(sec);
        if (sec >= 60) { this._stopAndSend(); }
      }, 250);
    },

    _tickAmplitudes() {
      // визуализация амплитуд на overlay (если есть элементы)
      const tick = () => {
        if (!this.recording) return;
        this.amplitudes.push(this._readAmplitude());
        if (this.amplitudes.length > 100) this.amplitudes.shift();
        requestAnimationFrame(tick);
      };
      tick();
    },

    _pickMime() {
      const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4'
      ];
      for (const c of candidates) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
      }
      return '';
    },

    _stopAndSend() {
      if (this.recorder && this.recorder.state !== 'inactive') {
        try { this.recorder.stop(); } catch (e) { this.cancel(); }
      }
    },

    async _onRecorded() {
      this.recording = false;
      clearInterval(this.timerInt);
      if (!this.chunks.length) { this.cancel(); return; }
      const blob = new Blob(this.chunks, { type: this.chunks[0].type || 'video/webm' });
      const duration = (Date.now() - this.startTime) / 1000;
      const file = new File([blob], `round_${Date.now()}.webm`, { type: blob.type });

      // Прогресс
      const idx = QWAS.State.pendingFiles.length;
      QWAS.State.pendingFiles.push({
        type: 'round', url: '', name: file.name, size: file.size, mime: file.type,
        uploading: true, progress: 0, duration
      });
      if (QWAS.Composer) QWAS.Composer.renderAttachments();

      const onProgress = (p) => {
        const list = QWAS.State.pendingFiles;
        const target = list[idx];
        if (target && target.uploading) {
          target.progress = p;
          if (QWAS.Composer) QWAS.Composer.renderAttachments();
        }
      };
      try {
        const r = await QWAS.API.uploadSmart(file, { type: 'round', forceType: 'round' }, onProgress);
        const list = QWAS.State.pendingFiles;
        if (list[idx] && list[idx].uploading) {
          if (r && r.ok) {
            list[idx] = { ...r.file, type: 'round', duration };
            QWAS.Toast.success('Видеосообщение готово');
          } else {
            list.splice(idx, 1);
            QWAS.Toast.error((r && r.error) || 'Ошибка загрузки');
          }
        }
        if (QWAS.Composer) {
          QWAS.Composer.renderAttachments();
          QWAS.Composer.updateSendButton();
        }
      } catch (e) {
        QWAS.State.pendingFiles.splice(idx, 1);
        if (QWAS.Composer) QWAS.Composer.renderAttachments();
        QWAS.Toast.error('Ошибка загрузки');
      }

      this._cleanup();
    },

    cancel() {
      if (this.recorder && this.recorder.state !== 'inactive') {
        try { this.recorder.stop(); } catch {}
      }
      this._cleanup();
    },

    _cleanup() {
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.audioCtx) { try { this.audioCtx.close(); } catch {} this.audioCtx = null; }
      this.audioAnalyser = null;
      this.recording = false;
      this.active = false;
      if (this.timerInt) clearInterval(this.timerInt);
      this.timerInt = null;
      if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    }
  };

  // === Voice (hold-to-record для голосовых) ===
  const Voice = {
    mode: 'voice',
    locked: false,
    _stream: null,
    _recorder: null,
    _chunks: [],
    _startTime: 0,
    _timerInt: null,
    _audioCtx: null,
    _analyser: null,
    _amplitudes: [],
    _lockOrigin: null,
    _moveHandlers: null,
    _slideHintShown: false,
    _maxDuration: 300,

    setMode(m) {
      this.mode = m === 'video' ? 'video' : 'voice';
      try { localStorage.setItem('qwas_record_mode', this.mode); } catch {}
    },

    async start(e) {
      if (QWAS.State.recording) return;
      if (!QWAS.State.current) {
        QWAS.Toast.warn('Откройте чат');
        return;
      }
      e.preventDefault();
      // Если режим видео — запускаем VideoRecorder
      if (this.mode === 'video' || (e.shiftKey && this.mode === 'voice')) {
        if (QWAS.VideoRecorder) QWAS.VideoRecorder.open();
        return;
      }

      try {
        this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        QWAS.Toast.error('Нет доступа к микрофону: ' + (err.message || err.name));
        return;
      }
      this._initAnalyser();
      this._showRecordingUI();
      this._chunks = [];
      this._amplitudes = [];
      this._startTime = Date.now();
      this.locked = false;
      QWAS.State.recording = true;
      this._lockOrigin = { x: this._clientX(e), y: this._clientY(e) };

      // MediaRecorder
      const mime = this._pickAudioMime();
      try {
        this._recorder = new MediaRecorder(this._stream, {
          mimeType: mime || undefined,
          audioBitsPerSecond: this._bitrate()
        });
      } catch (e) {
        QWAS.Toast.error('Запись не поддерживается');
        this.cancel();
        return;
      }
      this._recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) this._chunks.push(ev.data); };
      this._recorder.onstop = () => this._onStop();
      this._recorder.start(200);
      this._startTimer();
      this._tickAmplitudes();
    },

    _bitrate() {
      const q = (QWAS.State.settings.voiceQuality || 'sd');
      return q === 'hd' ? 128000 : (q === 'sd' ? 64000 : 32000);
    },

    _pickAudioMime() {
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];
      for (const c of candidates) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
      }
      return '';
    },

    _initAnalyser() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(this._stream);
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        this._audioCtx = ctx;
        this._analyser = an;
      } catch (e) {}
    },

    _readAmplitude() {
      if (!this._analyser) return 0;
      const arr = new Uint8Array(this._analyser.frequencyBinCount);
      this._analyser.getByteFrequencyData(arr);
      let sum = 0;
      for (const v of arr) sum += v;
      return sum / arr.length / 255;
    },

    _showRecordingUI() {
      const ui = document.getElementById('voiceRecording');
      if (ui) ui.style.display = 'flex';
      this._updateWave();
    },

    _hideRecordingUI() {
      const ui = document.getElementById('voiceRecording');
      if (ui) ui.style.display = 'none';
    },

    _startTimer() {
      const el = document.getElementById('voiceTimer');
      this._timerInt = setInterval(() => {
        const sec = Math.floor((Date.now() - this._startTime) / 1000);
        if (el) el.textContent = QWAS.Util.formatDuration(sec);
        if (sec >= this._maxDuration) this.stop();
      }, 250);
    },

    _tickAmplitudes() {
      const tick = () => {
        if (!QWAS.State.recording) return;
        this._amplitudes.push(this._readAmplitude());
        if (this._amplitudes.length > 60) this._amplitudes.shift();
        this._updateWave();
        requestAnimationFrame(tick);
      };
      tick();
    },

    _updateWave() {
      const wrap = document.getElementById('voiceWave');
      if (!wrap) return;
      const spans = wrap.querySelectorAll('span');
      const amps = this._amplitudes;
      spans.forEach((sp, i) => {
        const v = amps[amps.length - spans.length + i] || 0;
        sp.style.height = Math.max(4, v * 36 + 4) + 'px';
      });
    },

    move(e) {
      if (!QWAS.State.recording) return;
      if (this.locked) return;
      const x = this._clientX(e);
      const y = this._clientY(e);
      if (x == null || y == null || !this._lockOrigin) return;
      const dx = this._lockOrigin.x - x;
      const dy = this._lockOrigin.y - y;
      if (dx > 80) {
        // slide left to cancel
        const ui = document.getElementById('voiceRecording');
        if (ui) ui.classList.add('voice-cancelling');
      } else {
        const ui = document.getElementById('voiceRecording');
        if (ui) ui.classList.remove('voice-cancelling');
      }
      if (dy < -60) {
        // slide up to lock
        this.lockRecord();
      }
    },

    lockRecord() {
      if (!QWAS.State.recording) return;
      this.locked = true;
      const ui = document.getElementById('voiceRecording');
      if (ui) ui.classList.add('voice-locked');
    },

    async stop() {
      if (!QWAS.State.recording) return;
      QWAS.State.recording = false;
      const ui = document.getElementById('voiceRecording');
      const cancelled = ui && ui.classList.contains('voice-cancelling');
      clearInterval(this._timerInt);
      this._timerInt = null;
      this._hideRecordingUI();
      if (ui) ui.classList.remove('voice-cancelling', 'voice-locked');
      if (this._recorder && this._recorder.state !== 'inactive') {
        try { this._recorder.stop(); } catch {}
      }
      // ждём onStop? onStop вызывается асинхронно, но мы можем вызвать обработку через событие
    },

    cancel() {
      if (!QWAS.State.recording) return;
      QWAS.State.recording = false;
      clearInterval(this._timerInt);
      this._hideRecordingUI();
      if (this._recorder && this._recorder.state !== 'inactive') {
        try { this._recorder.stop(); } catch {}
      }
      this._chunks = [];
      this._cleanupStream();
    },

    async _onStop() {
      const cancelled = this._chunks.length === 0 || (this._amplitudes.length === 0 && (Date.now() - this._startTime) < 500);
      // Определяем отмену через UI класс не доступен тут, используем durations
      const wasCancelled = this._chunks.length === 0;
      const duration = (Date.now() - this._startTime) / 1000;
      this._cleanupStream();
      this._chunks = [];
      this._amplitudes = [];
      if (duration < 0.5) return; // слишком короткое

      const blob = new Blob(this._chunks, { type: this._chunks[0]?.type || 'audio/webm' });
      const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type });

      const idx = QWAS.State.pendingFiles.length;
      QWAS.State.pendingFiles.push({
        type: 'voice', url: '', name: file.name, size: file.size, mime: file.type,
        uploading: true, progress: 0, duration
      });
      if (QWAS.Composer) QWAS.Composer.renderAttachments();

      const onProgress = (p) => {
        const list = QWAS.State.pendingFiles;
        const t = list[idx];
        if (t && t.uploading) {
          t.progress = p;
          if (QWAS.Composer) QWAS.Composer.renderAttachments();
        }
      };
      try {
        const r = await QWAS.API.uploadSmart(file, { type: 'voice', forceType: 'voice' }, onProgress);
        const list = QWAS.State.pendingFiles;
        if (list[idx] && list[idx].uploading) {
          if (r && r.ok) {
            list[idx] = { ...r.file, type: 'voice', duration };
          } else {
            list.splice(idx, 1);
            QWAS.Toast.error((r && r.error) || 'Ошибка загрузки');
          }
        }
        if (QWAS.Composer) {
          QWAS.Composer.renderAttachments();
          QWAS.Composer.updateSendButton();
        }
      } catch (e) {
        QWAS.State.pendingFiles.splice(idx, 1);
        if (QWAS.Composer) QWAS.Composer.renderAttachments();
        QWAS.Toast.error('Ошибка загрузки');
      }
    },

    _cleanupStream() {
      if (this._stream) { this._stream.getTracks().forEach(t => t.stop()); this._stream = null; }
      if (this._audioCtx) { try { this._audioCtx.close(); } catch {} this._audioCtx = null; }
      this._analyser = null;
    },

    _clientX(e) {
      if (e.touches && e.touches.length) return e.touches[0].clientX;
      if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX;
      return e.clientX;
    },
    _clientY(e) {
      if (e.touches && e.touches.length) return e.touches[0].clientY;
      if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientY;
      return e.clientY;
    }
  };

  window.QWAS.VideoRecorder = VideoRecorder;
  window.QWAS.Voice = Voice;
})();
