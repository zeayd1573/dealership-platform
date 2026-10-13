// Minimal service worker: makes the app installable and caches the static shell.
// Streams and API calls (/proxy) are never cached.
const CACHE = 'xtream-shell-v1';
const SHELL = ['/', '/style.css', '/app.js', '/vendor/hls.min.js', '/vendor/mpegts.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname === '/proxy' || u.pathname === '/login') return;
  // network first so updates show up immediately; fall back to cache when offline
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && r.type === 'basic' && !r.redirected) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
