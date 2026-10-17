import type { MiddlewareHandler } from 'hono'
import { runInBackground } from './background.ts'

/**
 * Edge caching for API reads.
 *
 * A Worker isolate starts with an empty in-memory cache, so every cold start
 * used to mean a fresh round trip to GitHub. Responses are therefore also
 * stored in the Cloudflare cache (`caches.default`): a new isolate answers the
 * same URL from the edge in a few milliseconds.
 *
 * Everything here is a no-op when the Cache API is missing (Node server,
 * `node --test`), so the API behaves identically without Cloudflare.
 */

const STORED_AT = 'x-orbit-edge-stored'
const STORED_CC = 'x-orbit-edge-cc'

export interface EdgePolicy {
  /** How long a stored response is served from the edge. */
  ttl: number
}

/** Per-route edge lifetime. Anything not listed is never edge cached. */
const POLICIES: { prefix: string; policy: EdgePolicy }[] = [
  { prefix: '/api/feed', policy: { ttl: 20 } },
  { prefix: '/api/search', policy: { ttl: 20 } },
  { prefix: '/api/repo/', policy: { ttl: 60 } },
  { prefix: '/api/user/', policy: { ttl: 60 } },
  { prefix: '/api/readme/', policy: { ttl: 300 } },
  { prefix: '/api/seed', policy: { ttl: 3600 } },
]

export function edgePolicyFor(pathname: string): EdgePolicy | undefined {
  return POLICIES.find((entry) => pathname.startsWith(entry.prefix))?.policy
}

/** Minimal Cache API surface, so the freshness rules stay unit-testable. */
export interface EdgeStore {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
}

export interface EdgeEntry {
  response: Response
  /** Age of the stored copy in milliseconds. */
  age: number
}

/** Returns a stored response when it is still inside its edge TTL. */
export async function readEdge(
  store: EdgeStore,
  key: string,
  policy: EdgePolicy,
  now = Date.now(),
): Promise<EdgeEntry | null> {
  let stored: Response | undefined
  try {
    stored = await store.match(key)
  } catch {
    return null
  }
  if (!stored) return null

  const stamps = Number(stored.headers.get(STORED_AT))
  if (!Number.isFinite(stamps) || stamps <= 0) return null
  const age = now - stamps
  if (age < 0 || age > policy.ttl * 1000) return null

  const headers = new Headers(stored.headers)
  headers.delete(STORED_AT)
  // Restore the client-facing lifetime that the route declared; the stored
  // copy keeps a long TTL so it survives on the edge until it is refreshed.
  const clientCC = headers.get(STORED_CC)
  headers.delete(STORED_CC)
  if (clientCC) headers.set('cache-control', clientCC)
  headers.set('x-orbit-cache', 'edge')
  headers.set('age', String(Math.round(age / 1000)))
  return { response: new Response(stored.body, { status: stored.status, headers }), age }
}

/** Copies a response into the edge cache with its storage timestamp. */
export async function writeEdge(
  store: EdgeStore,
  key: string,
  response: Response,
  now = Date.now(),
): Promise<void> {
  if (response.status !== 200) return
  const headers = new Headers(response.headers)
  headers.set(STORED_AT, String(now))
  headers.set(STORED_CC, response.headers.get('cache-control') ?? 'no-store')
  // Keep the stored copy alive for the whole TTL window; the edge decides on
  // freshness through the timestamp above, not through the client headers.
  headers.set('cache-control', 'public, max-age=86400')

  const body = await response.arrayBuffer()
  try {
    await store.put(key, new Response(body, { status: 200, headers }))
  } catch {
    // Oversized or non-cacheable responses are fine to skip.
  }
}

/** The Cache API, when the runtime provides one (Cloudflare Workers only). */
export function edgeStore(): EdgeStore | null {
  const runtime = globalThis as { caches?: { default?: Cache } }
  const cache = runtime.caches?.default
  if (!cache) return null
  return {
    match: (key) => cache.match(key),
    put: (key, response) => cache.put(key, response),
  }
}

export function edgeCacheKey(url: string): string {
  const parsed = new URL(url)
  // Cache per origin+path+query, ignoring anything else on the request.
  return `${parsed.origin}${parsed.pathname}${parsed.search}`
}

/**
 * Middleware that serves a fresh edge copy before running the route and stores
 * the response afterwards. Cache writes happen after the response is sent.
 */
export function edgeCache(): MiddlewareHandler {
  return async (c, next) => {
    const store = edgeStore()
    const policy = edgePolicyFor(new URL(c.req.url).pathname)
    if (!store || !policy || c.req.method !== 'GET') return next()

    const key = edgeCacheKey(c.req.url)
    const hit = await readEdge(store, key, policy)
    if (hit) return hit.response

    await next()

    if (c.res.status === 200) {
      runInBackground(writeEdge(store, key, c.res.clone()))
    }
  }
}
