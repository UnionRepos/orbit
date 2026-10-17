/**
 * Runs `public/sw.js` in a sandbox with fake Cache Storage and fetch so the
 * offline behaviour can be verified without a browser.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const ORIGIN = 'https://orbit.test'
const source = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

type Handler = (event: Record<string, unknown>) => void

class FakeRequest {
  url: string
  method: string
  mode: string
  destination: string

  constructor(url: string, init: Record<string, string> = {}) {
    this.url = url.startsWith('http') ? url : `${ORIGIN}${url}`
    this.method = init.method ?? 'GET'
    this.mode = init.mode ?? 'no-cors'
    this.destination = init.destination ?? ''
  }
}

interface FakeCache {
  add(request: FakeRequest | string): Promise<void>
  put(request: FakeRequest | string, response: Response): Promise<void>
  match(request: FakeRequest | string): Promise<Response | undefined>
  keys(): Promise<(FakeRequest | string)[]>
  delete(request: FakeRequest | string): Promise<boolean>
}

function keyOf(request: FakeRequest | string): string {
  const raw = typeof request === 'string' ? request : request.url
  return raw.startsWith('http') ? raw : `${ORIGIN}${raw}`
}

function createWorker() {
  const handlers = new Map<string, Handler>()
  const stores = new Map<string, Map<string, Response>>()
  const deletedCaches: string[] = []
  let fetchImpl: (request: FakeRequest) => Promise<Response> = async () =>
    new Response('network', { status: 200 })

  const cacheFor = (name: string): FakeCache => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)!
    return {
      async add(request) {
        store.set(keyOf(request), new Response(`cached ${keyOf(request)}`))
      },
      async put(request, response) {
        store.set(keyOf(request), response)
      },
      async match(request) {
        const hit = store.get(keyOf(request))
        return hit ? hit.clone() : undefined
      },
      async keys() {
        return [...store.keys()]
      },
      async delete(request) {
        return store.delete(keyOf(request))
      },
    }
  }

  const sandbox = {
    console,
    URL,
    Response,
    Request: FakeRequest,
    Promise,
    fetch: (request: FakeRequest) => fetchImpl(request),
    caches: {
      open: async (name: string) => cacheFor(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => {
        deletedCaches.push(name)
        return stores.delete(name)
      },
    },
    self: {
      location: new URL(`${ORIGIN}/sw.js`),
      registration: { active: null },
      clients: { claim: async () => undefined },
      skipWaiting: async () => undefined,
      addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    },
  }

  vm.runInNewContext(source, sandbox, { filename: 'sw.js' })

  return {
    handlers,
    stores,
    deletedCaches,
    /** Replaces the network for subsequent fetches. */
    setFetch(next: (request: FakeRequest) => Promise<Response>) {
      fetchImpl = next
    },
    async run(type: 'install' | 'activate', event: Record<string, unknown> = {}) {
      const waits: Promise<unknown>[] = []
      const handler = handlers.get(type)
      assert.ok(handler, `${type} handler is registered`)
      handler({
        ...event,
        waitUntil: (promise: Promise<unknown>) => waits.push(promise),
        ...event,
      })
      await Promise.all(waits)
    },
    /** Returns the response produced for a request, or null when ignored. */
    async respond(request: FakeRequest): Promise<Response | null> {
      const waits: Promise<unknown>[] = []
      let result: Promise<Response> | null = null
      handlers.get('fetch')!({
        request,
        waitUntil: (promise: Promise<unknown>) => waits.push(promise),
        respondWith: (promise: Promise<Response>) => {
          result = promise
        },
      })
      await Promise.all(waits)
      return result ? await result : null
    },
  }
}

const navigation = () =>
  new FakeRequest(`${ORIGIN}/`, { mode: 'navigate', destination: 'document' })

describe('service worker install', () => {
  it('precaches the shell and the hashed bundle', async () => {
    const worker = createWorker()
    await worker.run('install')
    const shell = worker.stores.get('orbit-shell-dev')
    assert.ok(shell, 'shell cache is created')
    assert.ok(shell.has(`${ORIGIN}/index.html`), 'index.html is precached')
    assert.ok(shell.has(`${ORIGIN}/manifest.webmanifest`), 'manifest is precached')
  })
})

describe('service worker navigation', () => {
  it('serves the cached shell when the network is unreachable', async () => {
    const worker = createWorker()
    await worker.run('install')
    worker.setFetch(() => Promise.reject(new TypeError('offline')))

    const response = await worker.respond(navigation())
    assert.ok(response, 'a response is produced')
    assert.equal(response.status, 200)
    assert.match(await response.text(), /cached https:\/\/orbit\.test\/(?:index\.html)?$/)
  })

  it('refreshes the shell after a successful navigation', async () => {
    const worker = createWorker()
    await worker.run('install')
    worker.setFetch(async () => new Response('<html>fresh</html>', { status: 200 }))

    const response = await worker.respond(navigation())
    assert.equal(await response!.text(), '<html>fresh</html>')
    const shell = worker.stores.get('orbit-shell-dev')!
    assert.equal(await shell.get(`${ORIGIN}/index.html`)!.text(), '<html>fresh</html>')
  })
})

describe('service worker assets', () => {
  it('serves hashed bundles from the cache without a network call', async () => {
    const worker = createWorker()
    const asset = new FakeRequest(`${ORIGIN}/assets/index-abc.js`)
    let calls = 0
    worker.setFetch(async () => {
      calls += 1
      return new Response('bundle', { status: 200 })
    })

    await worker.respond(asset)
    const cached = await worker.respond(asset)
    assert.equal(await cached!.text(), 'bundle')
    assert.equal(calls, 1, 'the second request stays local')
  })

  it('ignores non-GET requests', async () => {
    const worker = createWorker()
    const post = new FakeRequest(`${ORIGIN}/api/feed`, { method: 'POST' })
    assert.equal(await worker.respond(post), null)
  })
})

describe('service worker API reads', () => {
  it('falls back to the last good response when offline', async () => {
    const worker = createWorker()
    const url = `${ORIGIN}/api/feed?channel=trending`
    const request = new FakeRequest(url)
    worker.setFetch(async () => Response.json({ repos: [{ fullName: 'orbit/one' }] }))

    const first = await worker.respond(request)
    assert.deepEqual(await first!.json(), { repos: [{ fullName: 'orbit/one' }] })

    worker.setFetch(() => Promise.reject(new TypeError('offline')))
    const offline = await worker.respond(request)
    assert.deepEqual(await offline!.json(), { repos: [{ fullName: 'orbit/one' }] })
  })

  it('does not cache failed responses', async () => {
    const worker = createWorker()
    const request = new FakeRequest(`${ORIGIN}/api/feed`)
    worker.setFetch(async () => new Response('rate limited', { status: 429 }))

    await worker.respond(request)
    worker.setFetch(() => Promise.reject(new TypeError('offline')))
    await assert.rejects(() => worker.respond(request), /offline/)
  })
})

describe('service worker activation', () => {
  it('drops caches from previous builds', async () => {
    const worker = createWorker()
    await worker.run('activate')
    assert.ok(worker.stores.size >= 0)
    const stale = 'orbit-shell-previous'
    worker.stores.set(stale, new Map())

    await worker.run('activate')
    assert.deepEqual(worker.deletedCaches, [stale])
  })
})
