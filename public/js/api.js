(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const API = {
    async request(path, options = {}) {
      const opts = Object.assign({
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${QWAS.State.userToken || ''}`,
          'Content-Type': 'application/json'
        }
      }, options);

      if (options.body && typeof options.body !== 'string' && !(options.body instanceof FormData)) {
        opts.body = JSON.stringify(options.body);
      } else if (options.body instanceof FormData) {
        delete opts.headers['Content-Type'];
        opts.body = options.body;
      } else if (options.body) {
        opts.body = options.body;
      }

      try {
        const res = await fetch(path, opts);
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          return await res.json();
        }
        return { ok: res.ok, status: res.status };
      } catch (err) {
        console.error('API error:', path, err);
        return { ok: false, error: 'network_error' };
      }
    },

    get(path) { return this.request(path); },
    post(path, body) { return this.request(path, { method: 'POST', body }); },
    put(path, body) { return this.request(path, { method: 'PUT', body }); },
    del(path) { return this.request(path, { method: 'DELETE' }); },

    upload(file, extra = {}) {
      const fd = new FormData();
      fd.append('file', file);
      for (const k in extra) fd.append(k, extra[k]);
      return this.request('/upload', { method: 'POST', body: fd });
    },

    uploadChunk(file, onProgress) {
      return new Promise((resolve, reject) => {
        const chunkSize = 1024 * 1024;
        const totalChunks = Math.ceil(file.size / chunkSize);
        const uploadId = 'up_' + Math.random().toString(36).slice(2);

        this.post('/upload/chunk/init', {
          name: file.name, size: file.size, mime: file.type
        }).then(init => {
          if (!init.ok) return reject(new Error('init failed'));

          let uploaded = 0;
          const uploadNext = (i) => {
            if (i >= totalChunks) {
              this.post(`/upload/chunk/${init.uploadId}/complete`).then(resolve);
              return;
            }
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);
            const fd = new FormData();
            fd.append('chunk', chunk);
            fd.append('index', i);
            this.request(`/upload/chunk/${init.uploadId}`, { method: 'POST', body: fd })
              .then(r => {
                if (!r.ok) return reject(new Error('chunk failed'));
                uploaded += (end - start);
                onProgress && onProgress(uploaded / file.size);
                uploadNext(i + 1);
              });
          };
          uploadNext(0);
        }).catch(reject);
      });
    }
  };

  QWAS.API = API;
})();
