// Service Worker - Ultimate Crossover PWA
const CACHE_NAME = 'uc-galaxy-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './cards_db.js',
  './battle.js',
  './app.js',
  './icon-512.png',
  './sobre_galaxy.png',
  './CadeteEstelar.png',
  './DroideExplorador.png',
  './Defensordeandromeda.png',
  './Cazadordepulsars.png',
  './ExploradorSolar.png',
  './Pilotodecazas.png',
  './Guerrerodemeteoritos.png',
  './Bestiadelagujeronegro.png',
  './Infiltradodelvacio.png',
  './Centinelatitan.png',
  './EmperadorDragonCosmico.png',
  './Nebulosacurativa.png',
  './Generadordeplasma.png'
];

// Instalar: cachear todos los recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando recursos de Ultimate Crossover...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activar: limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first para API/Firebase, Cache first para assets estáticos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Siempre ir a la red para Firebase (datos en tiempo real)
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Devolver cache pero actualizar en background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
