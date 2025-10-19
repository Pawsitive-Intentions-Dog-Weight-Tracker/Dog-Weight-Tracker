const CACHE_NAME = 'dog-weight-cache-v25'; // bump
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.webmanifest',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon-green-192.png',
  './icons/icon-green-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-64.png'
];
// (keep the rest of your service worker the same)


self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method === 'GET' && new URL(req.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html')))
    );
  }
});
