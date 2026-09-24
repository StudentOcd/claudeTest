// Offline support: the app shell is cached, and the last copy of your data is
// kept so the shopping list still opens inside the supermarket without signal.

const CACHE = 'leve-v1';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/main.js', '/manifest.webmanifest', '/icons/icon.svg'];
const DATA = ['/api/state', '/api/hevy/workouts'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (!DATA.includes(url.pathname)) return;
    // Network first, cached copy when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || new Response(JSON.stringify({ error: 'offline' }), { status: 503 }))),
    );
    return;
  }

  // App files: cached copy immediately, refreshed in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit || caches.match('/index.html'));
      return hit || network;
    }),
  );
});
