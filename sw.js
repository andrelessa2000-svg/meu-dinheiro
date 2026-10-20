'use strict';

// Service worker do Meu Dinheiro.
// - Guarda o "casco" do app (HTML, manifest, icones) em cache para abrir rapido
//   e funcionar offline na interface.
// - As chamadas /api/data sao SEMPRE de rede (dados vem do banco), com o
//   localStorage do app servindo de cache/offline dos registros.

const CACHE = 'meu-dinheiro-v9';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: rede primeiro, nunca cache.
  if (url.pathname.startsWith('/api/')) return;

  // Resto: cache primeiro, com atualizacao em segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fromNet = fetch(req)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || fromNet;
    })
  );
});
