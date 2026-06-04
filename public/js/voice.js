(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Voice = {
    init() {},

    async start(e) {
      e.preventDefault();
      if (QWAS.State.recording) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        QWAS.Toast.error('Микрофон недоступен');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        QWAS.State.recording = true;
        QWAS.State.recordStream = stream;
        QWAS.State.recordChunks = [];

        const mr = new MediaRecorder(stream, { mimeType: this.getMimeType() });
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
      const types = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];
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
})();
