const cacheName = 'little-sketchbook-v24';
const appFiles = [
  './',
  './index.html',
  './style.css',
  './coloring.js',
  './app.js',
  './manifest.webmanifest',
  './icons/sketchbook.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // Installation succeeds only once the whole app is available offline.
  event.waitUntil(caches.open(cacheName).then((cache) =>
    cache.addAll(appFiles.map((file) => new Request(file, { cache: 'reload' }))),
  ));
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
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    // A home-screen launch works offline, including URLs with a query string.
    const cached = event.request.mode === 'navigate'
      ? await cache.match('./index.html')
      : await cache.match(event.request, { ignoreSearch: true });
    return cached || fetch(event.request);
  })());
});
