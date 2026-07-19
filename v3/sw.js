/* Realbook Service Worker
   - Shell (index.html, data.js, Icons): NETWORK-FIRST → Oberfläche ist online immer aktuell,
     offline aus dem Cache. Kein „zweimal neu laden" nach Updates mehr.
   - Noten (/tunes/…): CACHE-FIRST → einmal geladen bleiben sie offline verfügbar.
   Der bestehende Noten-Cache ('tunes-rb-v1') wird bewusst NICHT umbenannt, damit bereits
   offline gespeicherte Noten erhalten bleiben. */
const SHELL = 'shell-rb-v16-suche-caps';
const TUNES = 'tunes-rb-v1';
const SHELL_ASSETS = [
  './', './index.html', './data.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL && k !== TUNES).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.includes('/tunes/')) {
    // Noten: cache-first (offline-fest)
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
        if (resp && resp.status === 200) { const copy = resp.clone(); caches.open(TUNES).then(c => c.put(e.request, copy)); }
        return resp;
      }).catch(() => hit))
    );
    return;
  }

  // Shell: network-first mit HTTP-Cache-Umgehung (immer aktueller Code online), Fallback Cache (offline)
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(resp => {
      if (resp && resp.status === 200) { const copy = resp.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
      return resp;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});

// Precache all tunes on request from the page, reporting progress
self.addEventListener('message', e => {
  const msg = e.data || {};
  if (msg.type === 'PRECACHE_ALL' && Array.isArray(msg.urls)) {
    const urls = msg.urls;
    caches.open(TUNES).then(async cache => {
      let done = 0;
      for (const u of urls) {
        try {
          const req = new Request(u);
          const has = await cache.match(req);
          if (!has) { const r = await fetch(req); if (r && r.status === 200) await cache.put(req, r); }
        } catch (_) {}
        done++;
        if (done % 20 === 0 || done === urls.length) {
          const clients = await self.clients.matchAll();
          clients.forEach(c => c.postMessage({ type: 'PRECACHE_PROGRESS', done, total: urls.length }));
        }
      }
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'PRECACHE_DONE', total: urls.length }));
    });
  }
});
