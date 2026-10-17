import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitPassage, translatePassage, TranslationRequestError } from './translation.ts'
import { escapeTranslationText } from './translationDom.ts'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('long paragraphs split without losing text, splitting code placeholders, or cutting emoji', () => {
  const text = `${'A sentence. '.repeat(400)}⟪ORBIT_0⟫${'文😀'.repeat(1500)}`
  const chunks = splitPassage(text)
  assert.equal(chunks.join(''), text)
  assert.ok(chunks.every((chunk) => chunk.length <= 2200))
  assert.equal(chunks.filter((chunk) => chunk.includes('⟪ORBIT_0⟫')).length, 1)
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)))
  assert.deepEqual(splitPassage('  '), [])
})

test('description HTML is escaped before it enters the immersive renderer', () => {
  assert.equal(escapeTranslationText('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;')
})

test('visible passages are batched, duplicate source texts are coalesced, and cached results are reused', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, init) => {
    calls++
    assert.equal(url, '/api/translate')
    const { texts, target } = JSON.parse(String(init?.body))
    assert.equal(target, 'zh')
    assert.deepEqual(texts, ['batch-a', 'batch-b'])
    return Response.json({ translations: ['甲', '乙'], provider: 'bilibili-index-translate' })
  }
  try {
    const signal = new AbortController().signal
    assert.deepEqual(await Promise.all([
      translatePassage('batch-a', 'zh', signal), translatePassage('batch-b', 'zh', signal), translatePassage('batch-a', 'zh', signal),
    ]), ['甲', '乙', '甲'])
    assert.equal(await translatePassage('batch-a', 'zh', signal), '甲')
    assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})

test('cancelled queued passages never contact the provider', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('should not fetch') }
  try {
    const controller = new AbortController()
    const pending = assert.rejects(translatePassage('cancel-before-send', 'zh', controller.signal))
    controller.abort()
    await pending
    await pause(60)
    assert.equal(calls, 0)
  } finally { globalThis.fetch = original }
})

test('cancelling every consumer aborts an active request', async () => {
  const original = globalThis.fetch
  let aborted = false
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; reject(init.signal?.reason) }, { once: true })
    started()
  })
  try {
    const controller = new AbortController()
    const pending = assert.rejects(translatePassage('cancel-active', 'en', controller.signal))
    await ready
    controller.abort()
    await pending
    await pause(10)
    assert.equal(aborted, true)
  } finally { globalThis.fetch = original }
})

test('rate limit metadata reaches the retry controls', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json({ error: 'Limited', retryAfter: 15 }, { status: 429 })
  try {
    await assert.rejects(translatePassage('limited-source', 'fr', new AbortController().signal), (error: unknown) => error instanceof TranslationRequestError && error.status === 429 && error.retryAfter === 15)
  } finally { globalThis.fetch = original }
})

test('different targets never share cached translations', async () => {
  const original = globalThis.fetch
  const targets: string[] = []
  globalThis.fetch = async (_url, init) => {
    const { target } = JSON.parse(String(init?.body))
    targets.push(target)
    return Response.json({ translations: [target], provider: 'bilibili-index-translate' })
  }
  try {
    const signal = new AbortController().signal
    assert.deepEqual(await Promise.all([translatePassage('isolate-target', 'de', signal), translatePassage('isolate-target', 'es', signal)]), ['de', 'es'])
    assert.deepEqual(targets.sort(), ['de', 'es'])
  } finally { globalThis.fetch = original }
})

test('one cancelled consumer does not abort another passage in the same batch', async () => {
  const original = globalThis.fetch
  let started!: () => void
  let finish!: (response: Response) => void
  let aborted = false
  const ready = new Promise<void>((resolve) => { started = resolve })
  globalThis.fetch = async (_url, init) => new Promise((resolve) => {
    finish = resolve
    init?.signal?.addEventListener('abort', () => { aborted = true })
    started()
  })
  try {
    const controller = new AbortController()
    const pending = assert.rejects(translatePassage('shared-cancel', 'ko', controller.signal))
    const other = translatePassage('shared-keep', 'ko', new AbortController().signal)
    await ready
    controller.abort()
    await pending
    assert.equal(aborted, false)
    finish(Response.json({ translations: ['취소', '유지'], provider: 'bilibili-index-translate' }))
    assert.equal(await other, '유지')
  } finally { globalThis.fetch = original }
})
