const CACHE = 'training-journal-v3';
const ASSETS = [
  './', './index.html', './style.css', './accessibility.css', './app.js', './exercises.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './lib/jspdf.umd.min.js', './fonts/font-data.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request,response.clone());
      }
      return response;
    } catch {
      return await caches.match(request) || (request.mode === 'navigate' ? await caches.match('./index.html') : Response.error());
    }
  })());
});
