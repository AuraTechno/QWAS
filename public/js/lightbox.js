(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Lightbox = {
    images: [],
    current: 0,

    open(url, caption) {
      this.images = [{ url, caption: caption || '' }];
      this.current = 0;
      this.render();
    },

    openImages(images) {
      this.images = images;
      this.current = 0;
      this.render();
    },

    openVideo(url) {
      const lb = document.getElementById('lightbox');
      if (!lb) return;
      lb.innerHTML = `
        <button class="lightbox-close" onclick="QWAS.Lightbox.close()">✕</button>
        <video src="${url}" controls autoplay style="max-width:95vw;max-height:90vh;border-radius:8px;"></video>
      `;
      lb.style.display = 'flex';
    },

    render() {
      const lb = document.getElementById('lightbox');
      if (!lb) return;
      const cur = this.images[this.current];
      lb.innerHTML = `
        <button class="lightbox-close" onclick="QWAS.Lightbox.close()">✕</button>
        ${this.images.length > 1 ? `<button class="lightbox-nav lightbox-prev" onclick="QWAS.Lightbox.prev(event)">‹</button>` : ''}
        <img id="lightboxImg" class="lightbox-img" src="${cur.url}" alt="${cur.caption || ''}">
        ${this.images.length > 1 ? `<button class="lightbox-nav lightbox-next" onclick="QWAS.Lightbox.next(event)">›</button>` : ''}
        ${cur.caption ? `<div class="lightbox-caption">${QWAS.Util.escapeHtml(cur.caption)}</div>` : ''}
      `;
      lb.style.display = 'flex';
    },

    prev(e) {
      if (e) e.stopPropagation();
      if (this.current > 0) {
        this.current--;
        this.render();
      }
    },

    next(e) {
      if (e) e.stopPropagation();
      if (this.current < this.images.length - 1) {
        this.current++;
        this.render();
      }
    },

    close() {
      const lb = document.getElementById('lightbox');
      if (lb) {
        lb.style.display = 'none';
        lb.innerHTML = '';
      }
    }
  };

  QWAS.Lightbox = Lightbox;
})();
