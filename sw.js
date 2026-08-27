/**
 * Service worker — app shell PWA per Timbrature Online.
 *
 * Cache SOLO gli asset statici (HTML/CSS/JS/icone): mai le chiamate a
 * Supabase o a CDN esterni, che restano sempre network-only. Un'app di
 * timbrature che mostrasse dati "vecchi" dalla cache al posto di quelli
 * reali sarebbe peggio che non avere offline support.
 *
 * Strategia: NETWORK-FIRST (non stale-while-revalidate). Questa app non ha
 * build/versioning con nomi di file con hash: senza network-first, chi apre
 * l'app da online continua a vedere la versione salvata in cache al primo
 * caricamento anche quando è uscito un deploy più recente (bug reale,
 * osservato durante lo sviluppo: una nuova sezione del pannello admin
 * risultava invisibile su un URL di anteprima già visitato in precedenza).
 * La cache resta solo un fallback per quando la rete non risponde (offline).
 *
 * Bump di CACHE_VERSION ad ogni deploy che tocca gli asset statici: forza
 * i client con una versione vecchia in cache a scaricare quella nuova.
 */
const CACHE_VERSION = 'v2';
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
    // cache: 'no-store' bypassa anche la cache HTTP del browser (Last-Modified/
    // ETag), non solo la Cache Storage del service worker: altrimenti una
    // risposta 304 Not Modified può far credere "aggiornato" un contenuto che
    // in realtà il browser non ha mai riscaricato dopo un deploy.
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req)) // offline (o rete assente): fallback alla cache
  );
});
