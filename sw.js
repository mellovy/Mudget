const CACHE = 'mudget-v8';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for HTML/JS/CSS so updates show up on next reload,
// falling back to cache only when offline.
self.addEventListener('fetch', e => {
  const isCore = e.request.destination === 'document' ||
                 e.request.url.endsWith('.js') ||
                 e.request.url.endsWith('.css');

  if(isCore){
    e.respondWith(
      fetch(e.request).then(res => {
        const resClone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, resClone));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => {
        return cached || fetch(e.request).then(res => {
          const resClone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, resClone));
          return res;
        }).catch(() => cached);
      })
    );
  }
});