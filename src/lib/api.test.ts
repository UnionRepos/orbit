import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { FeedQuery } from '../../shared/types.ts'
import { ApiError, feedPath, getFeed, prefetchFeed } from './api.ts'

const params: FeedQuery = {
  channel: 'trending',
  q: '',
  language: '',
  topic: '',
  minStars: 0,
  createdWithin: 0,
  sort: 'best',
  page: 1,
  perPage: 12,
}

const realFetch = globalThis.fetch
let calls: string[]

function stubFetch(body: unknown = { items: [] }, status = 200): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input))
    await new Promise((resolve) => setTimeout(resolve, 5))
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('feed paths', () => {
  it('keeps the page in the query string', () => {
    assert.match(feedPath(params, 2), /page=2/)
    assert.match(feedPath(params, 2), /perPage=12/)
  })

  it('only sends filters that are set', () => {
    const path = feedPath({ ...params, language: 'Rust', sort: 'stars' }, 1)
    assert.match(path, /language=Rust/)
    assert.match(path, /sort=stars/)
    assert.doesNotMatch(path, /q=/)
  })
})

describe('request sharing', () => {
  it('reuses the request started before the component mounted', async () => {
    stubFetch()
    prefetchFeed(params)
    await getFeed(params)
    assert.equal(calls.length, 1, 'the prefetched round trip is reused')
  })

  it('collapses concurrent requests for the same page', async () => {
    stubFetch()
    const [a, b] = await Promise.all([getFeed(params), getFeed(params)])
    assert.equal(calls.length, 1)
    assert.deepEqual(a, b)
  })

  it('still fetches a different page separately', async () => {
    stubFetch()
    await Promise.all([getFeed(params, 1), getFeed(params, 2)])
    assert.equal(calls.length, 2)
  })

  it('keeps working when a prefetched request failed', async () => {
    stubFetch({ error: 'nope' }, 500)
    prefetchFeed(params)
    await assert.rejects(() => getFeed(params), ApiError)

    stubFetch({ items: [] })
    await getFeed(params)
    assert.equal(calls.length, 2, 'a failed prefetch does not poison the cache')
  })

  it('aborts only the caller that asked for it', async () => {
    stubFetch()
    const controller = new AbortController()
    const aborted = getFeed(params, 1, controller.signal)
    const survivor = getFeed(params, 1)
    controller.abort()

    await assert.rejects(() => aborted, { name: 'AbortError' })
    await assert.doesNotReject(() => survivor)
    assert.equal(calls.length, 1)
  })

  it('surfaces the API error message and status', async () => {
    stubFetch({ error: 'rate limited' }, 429)
    await assert.rejects(() => getFeed(params), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 429)
      assert.equal(error.message, 'rate limited')
      return true
    })
  })
})
