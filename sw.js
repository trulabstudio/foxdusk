// Keeps public site files for offline use. The network always wins, so new versions arrive on their own.
const CACHE = 'site-v2';
const FILES = [
  '/',
  'index.html',
  'work.html',
  'offline.html',
  'styles.css',
  'main.js',
  'nav.js',
  'projects.js',
  'projects.json',
  'icons/icon-192.png',
  'aios.js',
  'brand/foxdusk-logomark-orange.png',
  'brand/foxdusk-wordmark-white.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// Also clears the offline cache left by the game this site used to host.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  // Never keep API replies or the admin page: they can hold private order data.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('offline.html');
        return Response.error();
      }),
  );
});
