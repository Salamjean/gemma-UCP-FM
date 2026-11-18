/* =========================================================
   SERVICE WORKER GEMMA (application installable / PWA)
   - Pages (navigation) : réseau d'abord ; hors connexion → dernière version de l'application en cache.
   - Fichiers statiques (build /assets, /images, /pwa-icons) : servis depuis le cache, mis à jour en arrière-plan.
   - JAMAIS mis en cache : /api (données des patients, connexion…), ni les fichiers du serveur de développement.
   Changer VERSION pour forcer le renouvellement du cache après un déploiement.
   ========================================================= */
const VERSION = 'gemma-v3';
const CACHE = `${VERSION}-statique`;
const COQUILLE = ['/', '/manifest.webmanifest', '/pwa-icons/icon-192.png', '/pwa-icons/icon-512.png', '/images/logo.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(COQUILLE))
      .catch(() => undefined) // une ressource manquante ne doit pas bloquer l'installation
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Requêtes jamais interceptées : données (API), serveur de développement Vite, autres domaines */
const ignorer = (url) =>
  url.origin !== self.location.origin ||
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/@') ||
  url.pathname.startsWith('/src/') ||
  url.pathname.startsWith('/node_modules/') ||
  url.searchParams.has('import') ||
  url.searchParams.has('t');

const statique = (url) => /^\/(assets|images|pwa-icons)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (ignorer(url)) return;

  // Navigation : réseau d'abord, sinon l'application en cache (fonctionne hors connexion pour l'affichage)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((rep) => {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put('/', copie)).catch(() => undefined);
          return rep;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  // Fichiers statiques : cache d'abord, mise à jour en arrière-plan
  if (statique(url)) {
    event.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((enCache) => {
          const reseau = fetch(req)
            .then((rep) => {
              if (rep.ok) c.put(req, rep.clone());
              return rep;
            })
            .catch(() => enCache);
          return enCache || reseau;
        }),
      ),
    );
  }
});
