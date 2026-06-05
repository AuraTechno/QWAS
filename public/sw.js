// QWAS Service Worker — кеширование для PWA + offline
const CACHE_NAME = 'qwas-v12';
const RUNTIME_CACHE = 'qwas-runtime-v12';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-32.png',
  '/favicon-16.png',
  '/icon-180.png',
  '/icon-167.png',
  '/icon-152.png',
  '/icon-120.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/css/vars.css',
  '/css/base.css',
  '/css/auth.css',
  '/css/sidebar.css',
  '/css/chat.css',
  '/css/messages.css',
  '/css/components.css',
  '/css/animations.css',
  '/css/settings.css',
  '/css/mobile.css',
  '/js/util.js',
  '/js/icons.js',
  '/js/state.js',
  '/js/api.js',
  '/js/toast.js',
  '/js/emoji.js',
  '/js/voice.js',
  '/js/calls.js',
  '/js/notifications.js',
  '/js/lightbox.js',
  '/js/reactions.js',
  '/js/contextmenu.js',
  '/js/attach.js',
  '/js/composer.js',
  '/js/messages.js',
  '/js/chat.js',
  '/js/chats.js',
  '/js/sidebar.js',
  '/js/search.js',
  '/js/folders.js',
  '/js/stories.js',
  '/js/groups.js',
  '/js/profile.js',
  '/js/modals.js',
  '/js/mainmenu.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/boot.js',
  '/js/mobileNav.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => console.warn('[SW] precache failed:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Не кешируем socket.io и API
  if (url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/api')) return;
  // Загрузки (большие файлы) — без кеша
  if (url.pathname.startsWith('/uploads')) return;

  // Навигация — network-first с fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Статика — cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// Обработка сообщений от клиента (skipWaiting, очистка кеша)
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
