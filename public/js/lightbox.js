// Lightbox для просмотра картинок и видео на полный экран
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Lightbox = {
    images: [],
    current: -1,

    init() {
      const lb = document.getElementById('lightbox');
      if (!lb) return;
      const closeBtn = lb.querySelector('.lightbox-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      const prevBtn = document.getElementById('lightboxPrev');
      const nextBtn = document.getElementById('lightboxNext');
      if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
      if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });
      lb.addEventListener('click', () => this.close());
      document.addEventListener('keydown', (e) => {
        if (lb.style.display === 'none' || lb.style.display === '') return;
        if (e.key === 'Escape') this.close();
        else if (e.key === 'ArrowLeft') this.prev();
        else if (e.key === 'ArrowRight') this.next();
      });
    },

    open(src, caption) {
      const lb = document.getElementById('lightbox');
      if (!lb) return;
      this.images = [{ src, caption }];
      this.current = 0;
      this._showCurrent();
      lb.style.display = 'flex';
    },

    openGallery(images, index) {
      const lb = document.getElementById('lightbox');
      if (!lb) return;
      this.images = images || [];
      this.current = index || 0;
      this._showCurrent();
      lb.style.display = 'flex';
    },

    _showCurrent() {
      const img = document.getElementById('lightboxImg');
      const cap = document.getElementById('lightboxCaption');
      const cur = this.images[this.current];
      if (!cur) return;
      if (img) img.src = cur.src;
      if (cap) cap.textContent = cur.caption || '';
    },

    prev(e) {
      if (e) e.stopPropagation();
      if (!this.images.length) return;
      this.current = (this.current - 1 + this.images.length) % this.images.length;
      this._showCurrent();
    },

    next(e) {
      if (e) e.stopPropagation();
      if (!this.images.length) return;
      this.current = (this.current + 1) % this.images.length;
      this._showCurrent();
    },

    close() {
      const lb = document.getElementById('lightbox');
      if (lb) lb.style.display = 'none';
      this.images = [];
      this.current = -1;
    }
  };

  window.QWAS.Lightbox = Lightbox;
})();
