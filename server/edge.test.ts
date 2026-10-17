import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  edgeCacheKey,
  edgePolicyFor,
  edgeStore,
  readEdge,
  writeEdge,
  type EdgeStore,
} from './edge.ts'

/** In-memory stand-in for the Cloudflare Cache API. */
function fakeStore(): EdgeStore & { entries: Map<string, Response> } {
  const entries = new Map<string, Response>()
  return {
    entries,
    async match(key) {
      const hit = entries.get(key)
      return hit ? hit.clone() : undefined
    },
    async put(key, response) {
      entries.set(key, response.clone())
    },
  }
}

const policy = { ttl: 20 }

describe('edge policy', () => {
  it('caches reads that are safe to reuse for a few seconds', () => {
    assert.equal(edgePolicyFor('/api/feed')?.ttl, 20)
    assert.equal(edgePolicyFor('/api/repo/acme/orbit')?.ttl, 60)
    assert.equal(edgePolicyFor('/api/readme/acme/orbit')?.ttl, 300)
  })

  it('never caches health checks', () => {
    assert.equal(edgePolicyFor('/api/health'), undefined)
    assert.equal(edgePolicyFor('/assets/index.js'), undefined)
  })

  it('keys entries by origin, path and query', () => {
    assert.equal(
      edgeCacheKey('https://orbit.test/api/feed?channel=trending&page=2'),
      'https://orbit.test/api/feed?channel=trending&page=2',
    )
  })
})

describe('edge cache reads', () => {
  it('serves a fresh copy without touching the origin', async () => {
    const store = fakeStore()
    const origin = Response.json({ items: [1] }, { headers: { 'cache-control': 'public, max-age=20' } })
    await writeEdge(store, 'k', origin, 1_000)

    const hit = await readEdge(store, 'k', policy, 5_000)
    assert.ok(hit)
    assert.equal(hit.response.headers.get('x-orbit-cache'), 'edge')
    assert.equal(hit.response.headers.get('x-orbit-edge-stored'), null)
    assert.equal(hit.response.headers.get('x-orbit-edge-cc'), null)
    assert.equal(hit.response.headers.get('cache-control'), 'public, max-age=20')
    assert.equal(hit.response.headers.get('age'), '4')
    assert.deepEqual(await hit.response.json(), { items: [1] })
  })

  it('ignores copies past their TTL', async () => {
    const store = fakeStore()
    await writeEdge(store, 'k', Response.json({ items: [1] }), 1_000)
    assert.equal(await readEdge(store, 'k', policy, 1_000 + 21_000), null)
  })

  it('treats untimestamped or missing entries as misses', async () => {
    const store = fakeStore()
    await store.put('bare', Response.json({}))
    assert.equal(await readEdge(store, 'bare', policy), null)
    assert.equal(await readEdge(store, 'missing', policy), null)
  })

  it('survives a failing cache backend', async () => {
    const broken: EdgeStore = {
      match: () => Promise.reject(new Error('cache down')),
      put: () => Promise.reject(new Error('cache down')),
    }
    assert.equal(await readEdge(broken, 'k', policy), null)
    await assert.doesNotReject(() => writeEdge(broken, 'k', Response.json({})))
  })
})

describe('edge cache writes', () => {
  it('stores successful JSON responses with a long backend TTL', async () => {
    const store = fakeStore()
    await writeEdge(store, 'k', Response.json({ ok: true }), 1_000)
    const stored = store.entries.get('k')
    assert.ok(stored)
    assert.equal(stored.headers.get('cache-control'), 'public, max-age=86400')
    assert.equal(stored.headers.get('x-orbit-edge-stored'), '1000')
    assert.equal(stored.headers.get('x-orbit-edge-cc'), 'no-store')
  })

  it('skips error responses so failures are never sticky', async () => {
    const store = fakeStore()
    await writeEdge(store, 'k', new Response('nope', { status: 429 }))
    assert.equal(store.entries.size, 0)
  })
})

describe('edge store discovery', () => {
  it('is disabled when the runtime has no Cache API', () => {
    assert.equal(edgeStore(), null)
  })
})
