const cacheName = 'little-sketchbook-v13';
const appFiles = ['./', './index.html', './style.css', './coloring.js', './app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appFiles)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('little-sketchbook-') && key !== cacheName)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch((error) => {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      throw error;
    })),
  );
});
