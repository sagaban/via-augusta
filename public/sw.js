/*
 * Business context: lets Via Augusta open and display saved routes without a
 * network connection. The application shell is cached as it is used, and map
 * tiles downloaded for saved routes are served from their dedicated cache.
 * Everything else (routing, search, elevation) goes straight to the network.
 */
const APP_CACHE = 'via-augusta-app-v1';
const TILE_CACHE = 'via-augusta-tiles-v1';
const TILE_HOSTS = ['www.ign.es', 'tile.waymarkedtrails.org'];
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) =>
        cache.addAll([SCOPE, `${SCOPE}es/`, `${SCOPE}en/`]).catch(() => undefined),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('via-augusta-app-') && key !== APP_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** The page sends the URLs of its loaded scripts and styles for precaching. */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-app-shell' || !Array.isArray(event.data.urls)) {
    return;
  }

  const urls = event.data.urls.filter(
    (url) => typeof url === 'string' && url.startsWith(SCOPE),
  );

  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) =>
        Promise.all(urls.map((url) => cache.add(url).catch(() => undefined))),
      ),
  );
});

/** Serves saved tiles from their cache; unsaved tiles use the network only. */
async function handleTile(request) {
  const cached = await caches.match(request.url, { cacheName: TILE_CACHE });
  return cached ?? fetch(request);
}

/** Network first for pages so a deployment is picked up as soon as possible. */
async function handleNavigation(request) {
  const cache = await caches.open(APP_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ??
      (await cache.match(`${SCOPE}es/`)) ??
      (await cache.match(SCOPE));

    if (cached) {
      return cached;
    }

    throw error;
  }
}

/** Stale-while-revalidate for scripts, styles, and images of the app. */
async function handleAsset(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => undefined);

  return cached ?? (await network) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(handleTile(request));
    return;
  }

  if (!request.url.startsWith(SCOPE)) {
    return;
  }

  event.respondWith(
    request.mode === 'navigate' ? handleNavigation(request) : handleAsset(request),
  );
});
