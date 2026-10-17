import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { ghJson } from './github.ts'

const realFetch = globalThis.fetch
let calls = 0

function stubFetch(body: unknown, status = 200): void {
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ETag: `"v${calls}"` },
    })
  }) as typeof fetch
}

const tick = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  calls = 0
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('github response cache', () => {
  it('reuses a fresh entry without a network call', async () => {
    stubFetch({ value: 1 })
    const path = '/repos/orbit/fresh'
    const first = await ghJson<{ value: number }>(path, { ttl: 5_000 })
    const second = await ghJson<{ value: number }>(path, { ttl: 5_000 })
    assert.equal(first.source, 'live')
    assert.equal(second.source, 'cache')
    assert.equal(calls, 1)
  })

  it('serves an expired entry immediately and refreshes behind the response', async () => {
    stubFetch({ value: 1 })
    const path = '/repos/orbit/stale'
    await ghJson<{ value: number }>(path, { ttl: 1 })
    await tick(10)

    stubFetch({ value: 2 })
    const stale = await ghJson<{ value: number }>(path, { ttl: 1 })
    assert.equal(stale.source, 'cache', 'the reader is not kept waiting')
    assert.deepEqual(stale.data, { value: 1 })

    await tick()
    assert.equal(calls, 2, 'the refresh runs in the background')

    const refreshed = await ghJson<{ value: number }>(path, { ttl: 5_000 })
    assert.deepEqual(refreshed.data, { value: 2 })
  })

  it('lets the refresh itself bypass the stale path', async () => {
    stubFetch({ value: 1 })
    const path = '/repos/orbit/refresh'
    await ghJson<{ value: number }>(path, { ttl: 1 })
    await tick(10)

    stubFetch({ value: 2 })
    const forced = await ghJson<{ value: number }>(path, { ttl: 1, revalidate: true })
    assert.equal(forced.source, 'live')
    assert.deepEqual(forced.data, { value: 2 })
  })

  it('falls back to the stale entry when the refresh fails', async () => {
    stubFetch({ value: 1 })
    const path = '/repos/orbit/offline'
    await ghJson<{ value: number }>(path, { ttl: 1 })
    await tick(10)

    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    const result = await ghJson<{ value: number }>(path, { ttl: 1, revalidate: true })
    assert.equal(result.source, 'stale')
    assert.deepEqual(result.data, { value: 1 })
  })
})
