/*
 * Orbit service worker.
 *
 * Offline behaviour:
 *  - the app shell (index.html + the entry assets it references) is precached
 *    on install, so any route opens offline and the SPA router takes over;
 *  - hashed /assets/ files are cache-first because their names are immutable,
 *    and are stored the first time they are used (lazy chunks, fonts);
 *  - other same-origin files (fonts, icons, the manifest) are served from the
 *    cache and refreshed in the background;
 *  - API reads are network-first with the last good response as the fallback,
 *    so a previously visited feed still renders when the network drops.
 *
 * `PRECACHE` and `BUILD_ID` are rewritten at build time by
 * scripts/vite-plugin-pwa.ts; the values below are what the dev copy uses.
 */
const BUILD_ID = 'dev'
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg']

const SHELL_CACHE = `orbit-shell-${BUILD_ID}`
const ASSET_CACHE = `orbit-assets-${BUILD_ID}`
const API_CACHE = `orbit-api-${BUILD_ID}`
const OWNED_CACHES = new Set([SHELL_CACHE, ASSET_CACHE, API_CACHE])
const SHELL_URL = '/index.html'
const API_CACHE_LIMIT = 60

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            // Prefer the HTTP cache: the page has just downloaded these files
            // with immutable headers, so a fresh install reuses them instead of
            // paying for a second copy of the bundle.
            await cache.add(new Request(url))
          } catch (error) {
            // A single missing file must not fail the whole install.
            console.warn('[orbit sw] precache skipped', url, error)
          }
        }),
      )
      // Activate immediately on the first install; updates wait for the page.
      if (!self.registration.active) await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('orbit-') && !OWNED_CACHES.has(key))
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request))
    return
  }
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiResponse(request))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(immutableResponse(request))
    return
  }
  event.respondWith(revalidatedResponse(request, event))
})

async function navigationResponse(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      await cache.put(SHELL_URL, response.clone())
    }
    return response
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE)
    const cached = (await cache.match(request)) || (await cache.match(SHELL_URL))
    if (cached) return cached
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Orbit is offline</title><body style="font-family:system-ui;padding:2rem;background:#191b19;color:#a0c7ad">Orbit is offline and has not cached this page yet. Reconnect, then reload.</body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}

async function immutableResponse(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function revalidatedResponse(request, event) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)

  if (cached) {
    event.waitUntil(network)
    return cached
  }
  const response = await network
  return response || Response.error()
}

async function apiResponse(request) {
  const cache = await caches.open(API_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
      await trimApiCache(cache)
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

async function trimApiCache(cache) {
  const keys = await cache.keys()
  if (keys.length <= API_CACHE_LIMIT) return
  await Promise.all(keys.slice(0, keys.length - API_CACHE_LIMIT).map((key) => cache.delete(key)))
}
