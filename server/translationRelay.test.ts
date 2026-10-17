import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forwardTranslation } from './translationRelay.ts'
import { createTranslationRelay } from './translationRelayApp.ts'
import { TranslationService } from './translation.ts'
import { TranslationGate } from './translationGate.ts'

const token = 'test-relay-secret-'.repeat(3)
const env = { TRANSLATION_RELAY_URL: 'https://relay.example', TRANSLATION_RELAY_TOKEN: token }
const request = (path = '/api/translate/readme', origin = 'https://orbit.example') => new Request(`https://orbit.example${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: 'private-session=never-forward', Authorization: 'untrusted' },
  body: JSON.stringify({ target: 'zh', passages: [{ index: 0, text: 'Hello' }] }),
})

test('Worker relay forwards authenticated streams without forwarding browser credentials or buffering', async () => {
  const encoder = new TextEncoder()
  let finish!: () => void
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(encoder.encode('data: {"type":"result","index":0,"text":"你好"}\n\n'))
    finish = () => controller.close()
  } })
  const response = await forwardTranslation(request(), env, async (url, init) => {
    assert.equal(String(url), 'https://relay.example/api/translate/readme')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('authorization'), `Bearer ${token}`)
    assert.equal(headers.has('cookie'), false)
    assert.equal(headers.has('origin'), false)
    assert.equal(JSON.parse(await new Response(init?.body).text()).passages[0].text, 'Hello')
    assert.equal(init?.redirect, 'manual')
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Set-Cookie': 'private=never-return' } })
  })
  assert.equal(response?.headers.get('set-cookie'), null)
  assert.equal(response?.headers.get('cache-control'), 'no-store')
  const reader = response!.body!.getReader()
  assert.ok(new TextDecoder().decode((await reader.read()).value).includes('你好'))
  finish()
  assert.equal((await reader.read()).done, true)
})

test('relay selection rejects cross-origin requests and fails closed for invalid configuration', async () => {
  const neverFetch: typeof fetch = async () => { assert.fail('must not fetch') }
  assert.equal(await forwardTranslation(request(), {}, neverFetch), null)
  assert.equal(await forwardTranslation(request('/api/health'), env, neverFetch), null)
  assert.equal((await forwardTranslation(request('/api/translate/readme', 'https://evil.example'), env, neverFetch))?.status, 403)
  for (const bad of [{ ...env, TRANSLATION_RELAY_TOKEN: '' }, { ...env, TRANSLATION_RELAY_TOKEN: 'short' }, { ...env, TRANSLATION_RELAY_URL: 'https://orbit.example' }, { ...env, TRANSLATION_RELAY_URL: 'http://relay.example' }, { ...env, TRANSLATION_RELAY_URL: 'https://user:pass@relay.example' }]) {
    const response = await forwardTranslation(request(), bad, neverFetch)
    assert.equal(response?.status, 503)
    assert.equal((await response?.json() as { code: string }).code, 'translation-connection')
  }
})

test('rejected relay credentials produce an explicit connection error without leaking its response', async () => {
  const response = await forwardTranslation(request(), env, async () => new Response('private diagnostic', { status: 401 }))
  assert.equal(response?.status, 503)
  assert.deepEqual(await response?.json(), { error: 'Translation connection is unavailable.', code: 'translation-connection' })
})

test('Node relay requires authentication, bounds input and streams actual translation routes', async () => {
  assert.throws(() => createTranslationRelay(''))
  let calls = 0
  const service = new TranslationService(async () => {
    calls++
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"0":"你好"}' } }] })
  }, new TranslationGate(0))
  const app = createTranslationRelay(token, service)
  assert.equal((await app.request('/health')).status, 401)
  assert.equal((await app.request('/health', { headers: { Authorization: 'Bearer wrong' } })).status, 401)
  assert.equal((await app.request('/health', { headers: { Authorization: `Bearer ${token}` } })).status, 200)
  assert.equal(calls, 0)
  const post = (body: string) => app.request('/api/translate/readme', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body })
  assert.equal((await post('x'.repeat(1_000_001))).status, 413)
  const response = await post(JSON.stringify({ target: 'zh', passages: [{ index: 0, text: 'Hello' }] }))
  const events = await response.text()
  assert.ok(events.includes('你好'))
  assert.ok(events.includes('"type":"done"'))
  assert.equal(calls, 1)
})
