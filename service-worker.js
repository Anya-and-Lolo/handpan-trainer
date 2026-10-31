const CACHE = 'ethereal-handpan-trainer-v31';
const SHELL = [
  './app-files/ethereal-translations.js',
  './app-files/ethereal-i18n.js',
  './app-files/ethereal-i18n.css',
  './app-files/ethereal-lessons.js',
  './app-files/ethereal-cosmetics.js',
  './app-files/ethereal-cosmetics.css',
  './app-files/cosmetics/eclipse.svg',
  './app-files/cosmetics/hammered.svg',
  './app-files/cosmetics/marble-mint.webp',
  './app-files/cosmetics/marble-ocean.webp',
  './app-files/cosmetics/nebula-aqua.webp',
  './app-files/cosmetics/nebula-blue.webp',
  './app-files/cosmetics/nebula-violet.webp',
  './app-files/cosmetics/prism.svg',
  './app-files/cosmetics/vortex.svg',

  './',
  './index.html',
  './app-files/ethereal-common.css',
  './app-files/styles.css',
  './app-files/ethereal-common-layout.css',
  './app-files/ethereal-common.js',
  './app-files/app.js',
  './app-files/ethereal-cloud-config.js',
  './app-files/song-catalog.js',
  './app-files/community-upload-config.js',
  './app-files/manifest.webmanifest',
  './app-files/fonts/fredoka-latin-600-normal.woff2',
  './app-files/fonts/fredoka-latin-700-normal.woff2',
  './app-files/icon-192.png',
  './app-files/icon-512.png',
  './app-files/icon-maskable-512.png',
  './app-files/kofi-logo.webp'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('ethereal-handpan-trainer-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Network first, so a new deploy is picked up immediately; the cache is only an offline fallback.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (response && response.ok) cache.put(event.request, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      throw error;
    }
  })());
});
