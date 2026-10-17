import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { TranslationGate } from './translationGate.ts'
import { createTranslationRoutes, TranslationService } from './translation.ts'
import { parseReadmeTranslation, translateReadme } from './readmeTranslation.ts'
import { splitTranslationText } from '../shared/translationChunks.ts'
import { fitsTranslationBudget, translationQualityIssue } from './translationQuality.ts'
import { translationPrompt } from './translation.ts'
import type { ReadmeTranslationEvent } from '../shared/translation.ts'

function inputs(init?: RequestInit): string[] {
  const prompt = JSON.parse(String(init?.body)).messages[0].content as string
  return Object.values(JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n') + 2)))
}
function echo(texts: string[]) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(texts.map((text, index) => [index, text]))) }, finish_reason: 'stop' }] })
}

test('README intake bounds document size and unique indices without the six-passage RPC limit', () => {
  assert.ok(parseReadmeTranslation({ target: 'zh', passages: Array.from({ length: 80 }, (_, index) => ({ index, text: `Paragraph ${index}` })) }))
  for (const passages of [[], [{ index: 0, text: 'x' }, { index: 0, text: 'y' }], [{ index: -1, text: 'x' }], [{ index: 0, text: 'x'.repeat(250001) }]]) assert.equal(parseReadmeTranslation({ target: 'zh', passages }), null)
})

test('whole-document workflow batches short paragraphs and publishes results progressively', async () => {
  let calls = 0
  const events: ReadmeTranslationEvent[] = []
  const service = new TranslationService(async (_url, init) => { calls++; return echo(inputs(init)) }, new TranslationGate(0))
  await translateReadme({ target: 'en', passages: Array.from({ length: 24 }, (_, index) => ({ index, text: `Short paragraph ${index}.` })) }, service, new AbortController().signal, async (event) => { events.push(event) })
  assert.equal(calls, 4)
  assert.equal(events.filter((event) => event.type === 'result').length, 24)
  assert.equal(events.at(-1)?.type, 'done')
  const previous = calls
  await translateReadme({ target: 'en', passages: [{ index: 0, text: 'Short paragraph 0.' }] }, service, new AbortController().signal, async () => {})
  assert.equal(calls, previous)
})

test('a temporary rate limit is retried centrally without failing browser passages', async () => {
  let clock = 0
  let calls = 0
  const events: ReadmeTranslationEvent[] = []
  const delays: number[] = []
  const sleep = async (ms: number) => { delays.push(ms); clock += ms }
  const gate = new TranslationGate(0, () => clock, sleep)
  const service = new TranslationService(async (_url, init) => ++calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '2' } }) : echo(inputs(init)), gate)
  await translateReadme({ target: 'en', passages: [{ index: 0, text: 'Temporary outage source' }] }, service, new AbortController().signal, async (event) => { events.push(event) }, sleep)
  assert.equal(calls, 2)
  assert.equal(events.filter((event) => event.type === 'result').length, 1)
  assert.equal(events.some((event) => event.type === 'failed'), false)
  assert.ok(delays.includes(2000))
})

test('a sustained outage stops after three attempts, leaving remaining paragraphs queued', async () => {
  let calls = 0
  const events: ReadmeTranslationEvent[] = []
  const service = new TranslationService(async () => { calls++; throw new TypeError('Network offline') }, new TranslationGate(0))
  await translateReadme({ target: 'en', passages: Array.from({ length: 60 }, (_, index) => ({ index, text: `Network source ${index}` })) }, service, new AbortController().signal, async (event) => { events.push(event) }, async () => {})
  assert.equal(calls, 3)
  assert.equal(events.some((event) => event.type === 'failed'), false)
  assert.equal(events.at(-1)?.type, 'unavailable')
  assert.equal(events.filter((event) => event.type === 'start').length, 6)
})

test('a paragraph over 15K characters resumes from cached internal pieces after an outage', async () => {
  const text = Array.from({ length: 360 }, (_, index) => `Sentence ${index} describes feature ${index} and how readers can use it.`).join(' ')
  assert.ok(text.length > 15_000)
  let healthy = false
  const submitted: string[] = []
  const service = new TranslationService(async (_url, init) => {
    const texts = inputs(init)
    assert.ok(fitsTranslationBudget(translationPrompt(texts, 'en'), texts))
    submitted.push(...texts)
    if (submitted.length > 1 && !healthy) throw new TypeError('Network offline')
    return echo(texts)
  }, new TranslationGate(0))
  const request = { target: 'en' as const, passages: [{ index: 0, text }] }
  const events: ReadmeTranslationEvent[] = []
  await translateReadme(request, service, new AbortController().signal, async (event) => { events.push(event) }, async () => {})
  assert.equal(events.at(-1)?.type, 'unavailable')
  assert.equal(events.some((event) => event.type === 'result'), false)
  healthy = true
  await translateReadme(request, service, new AbortController().signal, async (event) => { events.push(event) }, async () => {})
  assert.equal(submitted.filter((piece) => piece === submitted[0]).length, 1)
  assert.deepEqual(events.filter((event) => event.type === 'result'), [{ type: 'result', index: 0, text }])
  assert.equal(events.at(-1)?.type, 'done')
})

test('repetition across otherwise valid chunks is rejected after assembly and removed from cache', async () => {
  const randomText = (length: number, seed: number) => Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return String.fromCharCode(97 + (seed >>> 16) % 26)
  }).join('')
  const text = randomText(20_000, 42)
  const repeated = randomText(600, 77)
  for (const piece of splitTranslationText(text)) assert.equal(translationQualityIssue(piece, repeated), null)
  let calls = 0
  const service = new TranslationService(async (_url, init) => { calls++; return echo(inputs(init).map(() => repeated)) }, new TranslationGate(0))
  const events: ReadmeTranslationEvent[] = []
  await translateReadme({ target: 'en', passages: [{ index: 0, text }] }, service, new AbortController().signal, async (event) => { events.push(event) })
  assert.equal(events.some((event) => event.type === 'result'), false)
  assert.ok(events.some((event) => event.type === 'failed' && event.index === 0))
  const before = calls
  await service.translate({ target: 'en', texts: [splitTranslationText(text)[0]] })
  assert.equal(calls, before + 1)
})

test('an invalid passage does not erase valid neighboring translations or poison its cache', async () => {
  const events: ReadmeTranslationEvent[] = []
  const service = new TranslationService(async (_url, init) => {
    const texts = inputs(init)
    if (texts.includes('bad passage')) return Response.json({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(texts.map((text, index) => [index, text === 'bad passage' ? '' : text]))) }, finish_reason: 'stop' }] })
    return echo(texts)
  }, new TranslationGate(0))
  await translateReadme({ target: 'en', passages: [{ index: 0, text: 'good passage' }, { index: 1, text: 'bad passage' }, { index: 2, text: 'another good passage' }] }, service, new AbortController().signal, async (event) => { events.push(event) })
  assert.deepEqual(events.filter((event) => event.type === 'result').map((event) => event.index), [0, 2])
  assert.deepEqual(events.filter((event) => event.type === 'failed').map((event) => event.index), [1])
  assert.equal(events.at(-1)?.type, 'done')
})

test('README endpoint streams a document through one HTTP response and rejects cross-origin writes', async () => {
  const service = new TranslationService(async (_url, init) => echo(inputs(init)), new TranslationGate(0))
  const app = new Hono().route('/api/translate', createTranslationRoutes(service))
  const body = JSON.stringify({ target: 'en', passages: Array.from({ length: 30 }, (_, index) => ({ index, text: `Endpoint passage ${index}` })) })
  const request = (origin?: string) => app.request('/api/translate/readme', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body })
  assert.equal((await request('https://elsewhere.example')).status, 403)
  const response = await request()
  assert.equal(response.status, 200)
  assert.ok(response.headers.get('content-type')?.includes('text/event-stream'))
  const text = await response.text()
  assert.equal((text.match(/"type":"result"/g) ?? []).length, 30)
  assert.ok(text.includes('"type":"done"'))
})

test('Bilibili HTTP 412 access rejection stops immediately instead of retrying as server busy', async () => {
  let calls = 0
  const events: ReadmeTranslationEvent[] = []
  const service = new TranslationService(async () => { calls++; return new Response('<html>Bilibili access check</html>', { status: 412 }) }, new TranslationGate(0))
  await translateReadme({ target: 'zh', passages: [{ index: 0, text: 'DeepSeek Harness' }, { index: 1, text: 'Developer preview' }] }, service, new AbortController().signal, async (event) => { events.push(event) }, async () => { assert.fail('access denial must not sleep/retry') })
  assert.equal(calls, 1)
  assert.equal(events.at(-1)?.type, 'blocked')
  assert.equal(events.some((event) => ['waiting', 'unavailable', 'failed', 'done'].includes(event.type)), false)
})
