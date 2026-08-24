/**
 * Service worker — app shell PWA per Timbrature Online.
 *
 * Cache SOLO gli asset statici (HTML/CSS/JS/icone): mai le chiamate a
 * Supabase o a CDN esterni, che restano sempre network-only. Un'app di
 * timbrature che mostrasse dati "vecchi" dalla cache al posto di quelli
 * reali sarebbe peggio che non avere offline support.
 *
 * Bump di CACHE_VERSION ad ogni deploy che tocca gli asset statici: forza
 * i client con una versione vecchia in cache a scaricare quella nuova.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `badgeapp-shell-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/utils.js',
  '/supabase-config.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Mai intercettare richieste cross-origin (Supabase, CDN jsdelivr, ecc.)
  // o metodi diversi da GET: devono sempre andare in rete, dati sempre freschi.
  if (url.origin !== self.location.origin || req.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // offline: usa la cache se disponibile

      // Stale-while-revalidate: risposta immediata dalla cache se c'è,
      // aggiornamento in background per la prossima visita.
      return cached || network;
    })
  );
});
