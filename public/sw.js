const CACHE_NAME = 'qwas-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/mobile.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/notifications.js',
  '/js/auth.js',
  '/js/profile.js',
  '/js/socket.js',
  '/js/chat.js',
  '/js/messages.js',
  '/js/search.js',
  '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});