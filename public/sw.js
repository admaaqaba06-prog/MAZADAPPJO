const CACHE_NAME = 'mazad-jo-cache-v1';
const OFFLINE_FALLBACK_URL = '/index.html';

// Asset types to cache first (Static assets)
const STATIC_ASSET_EXTENSIONS = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2', '.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Warm up the cache with the entry points
      return cache.addAll([
        '/',
        '/index.html',
        '/icon.svg',
        '/manifest.json'
      ]).catch((err) => {
        console.warn('Pre-caching warm-up completed with warnings: ', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Bypass non-GET requests, firestore databases, external analytical APIs, and hot module replacements
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('firebaseinstallations.googleapis.com') ||
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    requestUrl.hostname.includes('hot-update') ||
    requestUrl.pathname.includes('socket.io') ||
    event.request.url.includes('/api/')
  ) {
    return;
  }

  // Caching strategy:
  // For document / navigation requests -> Network First, fallback to Cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseCopy);
          });
          return response;
        })
        .catch(() => {
          return caches.match(OFFLINE_FALLBACK_URL) || caches.match('/');
        })
    );
    return;
  }

  // For static assets -> Stale While Revalidate
  const isStaticAsset = STATIC_ASSET_EXTENSIONS.some(ext => requestUrl.pathname.endsWith(ext)) || 
                        event.request.url.includes('fonts.googleapis.com') || 
                        event.request.url.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseCopy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseCopy);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse); // ignore network failures and use cached version

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: Network First
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseCopy);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
