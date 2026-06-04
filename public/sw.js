const CACHE_NAME = 'qwas-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/vars.css',
  '/css/base.css',
  '/css/auth.css',
  '/css/sidebar.css',
  '/css/chat.css',
  '/css/messages.css',
  '/css/components.css',
  '/css/animations.css',
  '/css/mobile.css',
  '/js/util.js',
  '/js/state.js',
  '/js/api.js',
  '/js/notifications.js',
  '/js/auth.js',
  '/js/sidebar.js',
  '/js/chat.js',
  '/js/messages.js',
  '/js/composer.js',
  '/js/emoji.js',
  '/js/attach.js',
  '/js/voice.js',
  '/js/reactions.js',
  '/js/contextmenu.js',
  '/js/search.js',
  '/js/app.js',
  '/js/profile.js',
  '/js/groups.js',
  '/js/stories.js',
  '/js/lightbox.js',
  '/js/calls.js',
  '/js/modals.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/uploads')) return;
  if (url.pathname.startsWith('/api')) return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
