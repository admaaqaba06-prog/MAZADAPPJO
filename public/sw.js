// v2: the default branch stopped caching arbitrary responses (see the fetch
// handler). The activate handler deletes every cache whose name is not this
// one, so bumping the version is what actually evicts data cached under the
// old rules — without it the fix only applies to first-time visitors.
const CACHE_NAME = 'mazzado-cache-v2';
const OFFLINE_FALLBACK_URL = '/index.html';

// Asset types to cache first (Static assets)
// NO '.json' here on purpose. It used to be included, which put every JSON
// response on a stale-while-revalidate path — served from cache FIRST and
// revalidated after. For a price that is the one outcome this app cannot
// afford: a bidder reading a bid amount that is minutes out of date and
// bidding against it. The one JSON we do want cached is named explicitly below.
const STATIC_ASSET_EXTENSIONS = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2'];

// Static JSON that is app shell, not app data.
const CACHEABLE_JSON = ['/manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Warm up the cache with the entry points
      return cache.addAll([
        '/',
        '/index.html',
        '/icon-192.png',
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
    // Search results carry live prices and bid counts too. Algolia queries are
    // POST today (already bypassed by the method check), but that is theirs to
    // change, not ours to depend on.
    requestUrl.hostname.includes('algolia') ||
    // Callable/HTTP Cloud Functions — bids, settlement, everything live.
    requestUrl.hostname.includes('cloudfunctions.net') ||
    requestUrl.hostname.includes('run.app') ||
    requestUrl.hostname.includes('firebaseio.com') ||
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
                        CACHEABLE_JSON.includes(requestUrl.pathname) ||
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

  // Default: NETWORK ONLY, deliberately.
  //
  // This used to be network-first-with-cache-fallback, which sounds harmless
  // and is not: anything that is neither a navigation nor a known static
  // asset is DATA, and the fallback served that data from cache whenever the
  // network wobbled. On a phone on Jordanian mobile data that is not an edge
  // case, and "the price you saw was ten minutes old" is worse than "that did
  // not load" — the user retries an error; they bid against a stale number.
  //
  // Not calling respondWith at all would work equally well; it is written out
  // so the choice is visible to the next person reading this file.
  return;
});
