/**
 * sw.js — Service Worker do CineMatch (PWA)
 * ------------------------------------------------------------
 * Estratégia "network-first": sempre tenta a versão mais nova
 * dos arquivos; se estiver offline, usa a cópia em cache.
 * Assim o app abre e recomenda mesmo sem internet.
 */
const CACHE = 'cinematch-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/movies.js',
  './js/storage.js',
  './js/api.js',
  './js/recommender.js',
  './js/ui.js',
  './js/app.js',
  './assets/images/logo.svg',
  './assets/images/favicon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Só cuida de GETs do próprio site (APIs externas seguem direto para a rede)
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});
