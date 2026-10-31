// ZherPad service worker: caches the site so it works offline.
const CACHE = 'zherpad-v5';
const FILES = ['./', 'index.html', 'style.css', 'i18n-en.js', 'i18n.js', 'dualsense.js', 'app.js', 'calibration.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (to get updates), cache when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
