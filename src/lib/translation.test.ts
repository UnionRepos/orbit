import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cachedTranslation, decodeTranslationEvent, requestReadmeTranslation, splitPassage, TranslationRequestError } from './translation.ts'
import type { ReadmeTranslationEvent } from '../../shared/translation.ts'

const sse = (events: ReadmeTranslationEvent[], close = true) => {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); if (close) controller.close() } }), { headers: { 'Content-Type': 'text/event-stream' } })
}

test('long source boundaries remain lossless and Unicode/placeholder-safe', () => {
  const source = 'A sentence. '.repeat(500) + '⟪ORBIT_0⟫' + '文😀'.repeat(500)
  assert.equal(splitPassage(source).join(''), source)
})

test('stream events reject malformed state instead of silently counting it complete', () => {
  assert.deepEqual(decodeTranslationEvent('{"type":"ping"}'), { type: 'ping' })
  for (const text of ['null', '{"type":"unknown"}', '{"type":"result","index":0,"text":""}', '{"type":"waiting","retryAt":"bad"}']) assert.throws(() => decodeTranslationEvent(text))
})

test('a whole README uses one request and streams completed passages immediately', async () => {
  const original = globalThis.fetch
  let calls = 0
  const events: ReadmeTranslationEvent[] = []
  globalThis.fetch = async (url, init) => {
    calls++
    assert.equal(url, '/api/translate/readme')
    assert.equal(JSON.parse(String(init?.body)).passages.length, 40)
    return sse([...Array.from({ length: 40 }, (_, index): ReadmeTranslationEvent => ({ type: 'result', index, text: `译文 ${index}` })), { type: 'done' }])
  }
  try {
    await requestReadmeTranslation(Array.from({ length: 40 }, (_, index) => ({ index, text: `whole-readme-${index}` })), 'zh', new AbortController().signal, (event) => events.push(event))
    assert.equal(calls, 1)
    assert.equal(events.filter((event) => event.type === 'result').length, 40)
  } finally { globalThis.fetch = original }
})

test('a broken stream retains completed passages and the next request sends only unfinished work', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body))
    if (++calls === 1) return sse([{ type: 'result', index: 0, text: '已完成' }])
    assert.deepEqual(request.passages, [{ index: 1, text: 'stream-unfinished' }])
    return sse([{ type: 'result', index: 1, text: '后续完成' }, { type: 'done' }])
  }
  try {
    const passages = [{ index: 0, text: 'stream-completed' }, { index: 1, text: 'stream-unfinished' }]
    await assert.rejects(requestReadmeTranslation(passages, 'zh', new AbortController().signal, () => {}), TranslationRequestError)
    assert.equal(cachedTranslation(passages[0].text, 'zh'), '已完成')
    const results: string[] = []
    await requestReadmeTranslation(passages, 'zh', new AbortController().signal, (event) => { if (event.type === 'result') results.push(event.text) })
    assert.deepEqual(results, ['已完成', '后续完成'])
    assert.equal(calls, 2)
  } finally { globalThis.fetch = original }
})

test('split UTF-8 and CRLF frames decode without corrupting bilingual text', async () => {
  const original = globalThis.fetch
  const bytes = new TextEncoder().encode('data: {"type":"result","index":7,"text":"中文😀"}\r\n\r\ndata: {"type":"done"}\r\n\r\n')
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { bytes.forEach((byte) => controller.enqueue(new Uint8Array([byte]))); controller.close() } }), { headers: { 'Content-Type': 'text/event-stream' } })
  try {
    let translated = ''
    await requestReadmeTranslation([{ index: 7, text: 'utf8-source' }], 'ja', new AbortController().signal, (event) => { if (event.type === 'result') translated = event.text })
    assert.equal(translated, '中文😀')
  } finally { globalThis.fetch = original }
})

test('outage events retain completed results without pretending the remaining passages failed', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => sse([{ type: 'result', index: 0, text: '保存' }, { type: 'unavailable', retryAt: Date.now() + 1000 }])
  try {
    const events: ReadmeTranslationEvent[] = []
    await requestReadmeTranslation([{ index: 0, text: 'outage-complete' }, { index: 1, text: 'outage-pending' }], 'ko', new AbortController().signal, (event) => events.push(event))
    assert.equal(events.some((event) => event.type === 'failed'), false)
    assert.equal(cachedTranslation('outage-complete', 'ko'), '保存')
    assert.equal(cachedTranslation('outage-pending', 'ko'), undefined)
  } finally { globalThis.fetch = original }
})

test('a done event cannot hide missing results or an unexpected passage index', async () => {
  const original = globalThis.fetch
  try {
    for (const event of [{ type: 'done' } as const, { type: 'result', index: 99, text: 'wrong passage' } as const]) {
      globalThis.fetch = async () => sse([event])
      await assert.rejects(requestReadmeTranslation([{ index: 0, text: 'missing-source' }], 'fr', new AbortController().signal, () => {}), TranslationRequestError)
    }
  } finally { globalThis.fetch = original }
})

test('connection rejection is terminal over SSE and JSON without repeated browser retries', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => sse([{ type: 'blocked' }])
    const events: ReadmeTranslationEvent[] = []
    await requestReadmeTranslation([{ index: 0, text: 'blocked-stream' }], 'zh', new AbortController().signal, (event) => events.push(event))
    assert.deepEqual(events, [{ type: 'blocked' }])
    globalThis.fetch = async () => Response.json({ code: 'translation-connection' }, { status: 503 })
    await assert.rejects(requestReadmeTranslation([{ index: 0, text: 'blocked-json' }], 'zh', new AbortController().signal, () => {}), (error: unknown) => error instanceof TranslationRequestError && error.blocked)
  } finally { globalThis.fetch = original }
})
