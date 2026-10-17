import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { createTranslationRoutes, INDEX_TRANSLATE_MODEL, INDEX_TRANSLATE_URL, parseTranslationOutput, parseTranslationRequest, TranslationService, TranslationError } from './translation.ts'

const completion = (values: Record<string, string>, finish = 'stop') => Response.json({
  choices: [{ message: { content: JSON.stringify(values) }, finish_reason: finish }],
})

test('translation intake bounds languages, texts, total length and batch size', () => {
  assert.deepEqual(parseTranslationRequest({ target: 'zh', texts: ['Hello'] }), { target: 'zh', texts: ['Hello'] })
  for (const input of [null, {}, { target: 'xx', texts: ['Hello'] }, { target: 'en', texts: [] },
    { target: 'en', texts: [1] }, { target: 'en', texts: [' '] },
    { target: 'en', texts: ['x'.repeat(2401)] }, { target: 'en', texts: Array(7).fill('a') },
    { target: 'en', texts: Array(3).fill('x'.repeat(2100)) }]) {
    assert.equal(parseTranslationRequest(input), null)
  }
})

test('translation output validates identities, placeholders and completeness', () => {
  assert.deepEqual(parseTranslationOutput('```json\n{"1":"再见","0":"你好 ⟪ORBIT_0⟫"}\n```', ['Hi ⟪ORBIT_0⟫', 'Bye']), ['你好 ⟪ORBIT_0⟫', '再见'])
  for (const value of ['not JSON', '[]', '{"0":""}', '{"0":"hello","extra":"invented"}', '{"1":"hello"}', '{"0":"hello"}', '{"0":"⟪ORBIT_0⟫ ⟪ORBIT_0⟫"}']) {
    assert.throws(() => parseTranslationOutput(value, ['Hi ⟪ORBIT_0⟫']), TranslationError)
  }
  assert.deepEqual(parseTranslationOutput('{"0":"<script>alert(1)</script>"}', ['text']), ['<script>alert(1)</script>'])
})

test('Index-Translate request uses the documented endpoint, headers and model; cache is target-specific', async () => {
  let calls = 0
  const service = new TranslationService(async (url, init) => {
    calls++
    assert.equal(url, INDEX_TRANSLATE_URL)
    assert.equal(init?.method, 'POST')
    assert.equal(new Headers(init.headers).get('User-Agent'), 'Index-Translate-Client/1.0')
    const body = JSON.parse(String(init.body))
    assert.equal(body.model, INDEX_TRANSLATE_MODEL)
    assert.equal(body.chat_template_kwargs.enable_thinking, false)
    assert.equal(body.temperature, 0)
    assert.ok(body.messages[0].content.includes('Keep the same JSON keys'))
    return completion({ '0': calls === 1 ? '你好' : 'こんにちは' })
  })
  assert.deepEqual(await service.translate({ target: 'zh', texts: ['Hello'] }), ['你好'])
  assert.deepEqual(await service.translate({ target: 'zh', texts: ['Hello'] }), ['你好'])
  assert.equal(calls, 1)
  assert.deepEqual(await service.translate({ target: 'ja', texts: ['Hello'] }), ['こんにちは'])
  assert.equal(calls, 2)
})

test('only uncached passages are sent and results retain the requested order', async () => {
  let calls = 0
  const service = new TranslationService(async (_url, init) => {
    calls++
    if (calls === 2) assert.ok(!JSON.parse(String(init?.body)).messages[0].content.includes('Hello'))
    return completion({ '0': calls === 1 ? '你好' : '再见' })
  })
  await service.translate({ target: 'zh', texts: ['Hello'] })
  assert.deepEqual(await service.translate({ target: 'zh', texts: ['Bye', 'Hello'] }), ['再见', '你好'])
})

test('upstream rate limits, timeouts and truncated results are explicit and not cached', async () => {
  const throttled = new TranslationService(async () => new Response('', { status: 429, headers: { 'Retry-After': '12' } }))
  await assert.rejects(throttled.translate({ target: 'zh', texts: ['Hi'] }), (error: unknown) => error instanceof TranslationError && error.status === 429 && error.retryAfter === 12)
  const timeout = new TranslationService(async () => { throw new DOMException('timed out', 'TimeoutError') })
  await assert.rejects(timeout.translate({ target: 'zh', texts: ['Hi'] }), (error: unknown) => error instanceof TranslationError && error.status === 504)
  let calls = 0
  const truncated = new TranslationService(async () => { calls++; return completion({ '0': '你好' }, calls === 1 ? 'length' : 'stop') })
  await assert.rejects(truncated.translate({ target: 'zh', texts: ['Hi'] }), TranslationError)
  assert.deepEqual(await truncated.translate({ target: 'zh', texts: ['Hi'] }), ['你好'])
  assert.equal(calls, 2)
})

test('translation route validates JSON, enforces body limits, and does not expose upstream errors', async () => {
  const routes = new Hono().route('/api/translate', createTranslationRoutes(new TranslationService(async () => completion({ '0': '你好' }))))
  const post = (body: string, headers: Record<string, string> = {}) => routes.request('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
  assert.equal((await post('broken')).status, 400)
  assert.equal((await post(JSON.stringify({ target: 'unsupported', texts: ['Hi'] }))).status, 400)
  assert.equal((await post(JSON.stringify({ target: 'zh', texts: ['x'.repeat(33000)] }))).status, 413)
  assert.equal((await post(JSON.stringify({ target: 'zh', texts: ['Hi'] }), { Origin: 'https://other.example' })).status, 403)
  const ok = await post(JSON.stringify({ target: 'zh', texts: ['Hi'] }))
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await ok.json(), { translations: ['你好'], provider: 'bilibili-index-translate' })
  const failing = new Hono().route('/api/translate', createTranslationRoutes(new TranslationService(async () => { throw new Error('private upstream diagnostic') })))
  const failure = await failing.request('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'zh', texts: ['Hi'] }) })
  assert.equal(failure.status, 502)
  assert.ok(!(await failure.text()).includes('private upstream diagnostic'))
})

test('translation proxy bounds per-client request rate and returns retry metadata', async () => {
  const routes = new Hono().route('/api/translate', createTranslationRoutes(new TranslationService(async () => completion({ '0': '你好' }))))
  const post = () => routes.request('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'zh', texts: ['Hi'] }) })
  for (let index = 0; index < 60; index++) assert.equal((await post()).status, 200)
  const limited = await post()
  assert.equal(limited.status, 429)
  const payload = await limited.json() as { retryAfter: number }
  assert.ok(payload.retryAfter > 0 && payload.retryAfter <= 60)
  assert.equal(limited.headers.get('Retry-After'), String(payload.retryAfter))
})

function requestTexts(init: RequestInit | undefined): string[] {
  const body = JSON.parse(String(init?.body))
  assert.equal(body.max_tokens, 4096)
  const prompt: string = body.messages[0].content
  return Object.values(JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n') + 2)))
}

function echoCompletion(texts: string[], usage?: Record<string, number>) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(texts.map((text, index) => [String(index), text.trim()]))) }, finish_reason: 'stop' }], usage })
}

const diverseProse = (length: number) => Array.from({ length }, (_, index) => `Step ${index} explains configuration option ${index * 13} for component ${index * 7}. `).join('').trimEnd()

test('public upstream requests split a long multi-passage input to fit both token budgets', async () => {
  const { fitsTranslationBudget } = await import('./translationQuality.ts')
  const calls: string[][] = []
  const service = new TranslationService(async (_url, init) => {
    const texts = requestTexts(init)
    const prompt = JSON.parse(String(init?.body)).messages[0].content
    assert.equal(fitsTranslationBudget(prompt, texts), true)
    calls.push(texts)
    return echoCompletion(texts)
  })
  const texts = [diverseProse(28), diverseProse(29), diverseProse(30)]
  assert.ok(texts.join('').length > 5000)
  assert.deepEqual(await service.translate({ target: 'en', texts }), texts)
  assert.ok(calls.length > 1)
  assert.ok(calls.every((batch) => batch.join('').length < 2100))
  const previous = calls.length
  assert.deepEqual(await service.translate({ target: 'en', texts }), texts)
  assert.equal(calls.length, previous)
})

test('a document over 15K characters is fully reassembled through bounded request envelopes', async () => {
  const { splitTranslationText, joinTranslationPieces } = await import('../shared/translationChunks.ts')
  const document = diverseProse(340)
  assert.ok(document.length > 15000)
  let calls = 0
  const service = new TranslationService(async (_url, init) => { calls++; return echoCompletion(requestTexts(init)) })
  const pieces = splitTranslationText(document)
  const translated: string[] = []
  for (let index = 0; index < pieces.length; index += 4) {
    const request = { target: 'en' as const, texts: pieces.slice(index, index + 4) }
    assert.ok(parseTranslationRequest(request))
    translated.push(...await service.translate(request))
  }
  assert.equal(joinTranslationPieces(pieces, translated), document.trimEnd())
  assert.ok(calls > 10)
})

test('valid JSON with stop but truncated content recovers using smaller source pieces', async () => {
  const source = diverseProse(18)
  let calls = 0
  const lengths: number[] = []
  const service = new TranslationService(async (_url, init) => {
    const texts = requestTexts(init)
    lengths.push(texts.join('').length)
    calls++
    if (calls === 1) return completion(Object.fromEntries(texts.map((_text, index) => [String(index), 'A short summary.'])))
    return echoCompletion(texts)
  })
  assert.deepEqual(await service.translate({ target: 'en', texts: [source] }), [source])
  assert.ok(calls > 1 && lengths[1] < lengths[0])
})

test('stop at the 4096-token cap triggers recovery even if the returned JSON looks complete', async () => {
  let calls = 0
  const service = new TranslationService(async (_url, init) => {
    const texts = requestTexts(init)
    return echoCompletion(texts, ++calls === 1 ? { prompt_tokens: 1200, completion_tokens: 4096, total_tokens: 5296 } : undefined)
  })
  const source = diverseProse(12)
  assert.deepEqual(await service.translate({ target: 'en', texts: [source] }), [source])
  assert.ok(calls > 1)
})

test('persistent repetition fails bounded recovery and cannot poison the cache', async () => {
  const source = diverseProse(18)
  let calls = 0
  let healthy = false
  const service = new TranslationService(async (_url, init) => {
    calls++
    const texts = requestTexts(init)
    return healthy ? echoCompletion(texts) : completion(Object.fromEntries(texts.map((_text, index) => [String(index), 'a pointless repeated sentence. '.repeat(80)])))
  })
  await assert.rejects(service.translate({ target: 'en', texts: [source] }), TranslationError)
  assert.ok(calls <= 24)
  const failedCalls = calls
  healthy = true
  assert.deepEqual(await service.translate({ target: 'en', texts: [source] }), [source])
  assert.ok(calls > failedCalls)
  const successfulCalls = calls
  await service.translate({ target: 'en', texts: [source] })
  assert.equal(calls, successfulCalls)
})

test('an unsuccessful batch does not commit its successfully translated earlier pieces', async () => {
  let healthy = false
  let sawFirstAgain = false
  const first = 'A small first passage.'
  const second = diverseProse(16)
  const service = new TranslationService(async (_url, init) => {
    const texts = requestTexts(init)
    if (healthy && texts.includes(first)) sawFirstAgain = true
    if (!healthy && texts.some((text) => text.includes('Step'))) {
      return completion(Object.fromEntries(texts.map((_text, index) => [String(index), 'an endless phrase. '.repeat(150)])))
    }
    return echoCompletion(texts)
  })
  await assert.rejects(service.translate({ target: 'en', texts: [first, second] }), TranslationError)
  healthy = true
  assert.deepEqual(await service.translate({ target: 'en', texts: [first, second] }), [first, second])
  assert.equal(sawFirstAgain, true)
})

test('cancellation during recovery stops additional upstream calls', async () => {
  const controller = new AbortController()
  let calls = 0
  const service = new TranslationService(async () => {
    calls++
    controller.abort()
    return completion({ '0': 'Incomplete.' })
  })
  await assert.rejects(service.translate({ target: 'en', texts: [diverseProse(15)] }, controller.signal), (error: unknown) => error instanceof TranslationError && error.status === 503)
  assert.equal(calls, 1)
})
