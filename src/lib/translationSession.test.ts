import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TranslationSession, type TranslationProgress } from './translationSession.ts'
import type { ReadmeTranslationEvent } from '../../shared/translation.ts'
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

function setup() {
  let progress!: TranslationProgress
  const results: string[] = []
  return { results, get progress() { return progress }, onResult: (_index: number, text: string) => results.push(text), onProgress: (next: TranslationProgress) => { progress = next } }
}

test('one request owns the whole README, sorted by the current reading position', async () => {
  const state = setup()
  let calls = 0
  const reader = new TranslationSession({ ...state, texts: ['a', 'b', 'c'], priority: (index) => [2, 1, 0][index], request: async (passages, _signal, emit) => {
    calls++
    assert.deepEqual(passages.map((passage) => passage.index), [2, 1, 0])
    passages.forEach((passage) => emit({ type: 'result', index: passage.index, text: passage.text.toUpperCase() }))
    emit({ type: 'done' })
  } })
  assert.equal(calls, 0)
  reader.resume()
  await tick()
  assert.equal(calls, 1)
  assert.equal(state.progress.completed, 3)
  assert.equal(state.progress.status, 'complete')
  reader.dispose()
})

test('network loss reconnects only unfinished passages and does not duplicate completed output', async () => {
  const state = setup()
  let calls = 0
  const reader = new TranslationSession({ ...state, texts: ['a', 'b'], reconnectDelay: 1, request: async (passages, _signal, emit) => {
    if (++calls === 1) { emit({ type: 'result', index: 0, text: 'A' }); throw new TypeError('Network failed') }
    assert.deepEqual(passages.map((passage) => passage.index), [1])
    emit({ type: 'result', index: 1, text: 'B' }); emit({ type: 'done' })
  } })
  reader.resume()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(state.results, ['A', 'B'])
  assert.equal(calls, 2)
  assert.equal(state.progress.failed, 0)
  reader.dispose()
})

test('an outage stops bounded reconnects and retains unfinished work for explicit recovery', async () => {
  const state = setup()
  let calls = 0
  let healthy = false
  const reader = new TranslationSession({ ...state, texts: ['a', 'b'], reconnectDelay: 1, request: async (passages, _signal, emit) => {
    calls++
    if (!healthy) throw new TypeError('offline')
    passages.forEach((passage) => emit({ type: 'result', index: passage.index, text: passage.text }))
  } })
  reader.resume()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(calls, 3)
  assert.equal(state.progress.status, 'unavailable')
  assert.equal(state.progress.failed, 0)
  healthy = true
  reader.reconnect()
  await tick()
  assert.equal(state.progress.completed, 2)
  reader.dispose()
})

test('pause cancels a stream and resumes only unfinished work', async () => {
  const state = setup()
  let calls = 0
  let emit!: (event: ReadmeTranslationEvent) => void
  const reader = new TranslationSession({ ...state, texts: ['a', 'b'], request: async (passages, signal, onEvent) => {
    calls++
    emit = onEvent
    if (calls === 1) { emit({ type: 'result', index: 0, text: 'A' }); await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }
    else { assert.deepEqual(passages.map((passage) => passage.index), [1]); emit({ type: 'result', index: 1, text: 'B' }) }
  } })
  reader.resume(); await tick(); reader.pause(); await tick()
  assert.equal(state.progress.completed, 1)
  assert.equal(calls, 1)
  reader.resume(); await tick()
  assert.deepEqual(state.results, ['A', 'B'])
  reader.dispose()
})

test('coming back online replaces a stalled connection with only unfinished passages', async () => {
  const state = setup()
  let calls = 0
  let firstSignal!: AbortSignal
  const reader = new TranslationSession({ ...state, texts: ['a', 'b'], request: async (passages, signal, emit) => {
    if (++calls === 1) {
      firstSignal = signal
      emit({ type: 'result', index: 0, text: 'A' })
      await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    } else {
      assert.deepEqual(passages.map((passage) => passage.index), [1])
      emit({ type: 'result', index: 1, text: 'B' })
    }
  } })
  reader.resume(); await tick(); reader.reconnect(); await tick()
  assert.equal(firstSignal.aborted, true)
  assert.equal(calls, 2)
  assert.deepEqual(state.results, ['A', 'B'])
  assert.equal(state.progress.status, 'complete')
  reader.dispose()
})

test('service cooldown is explicit, with no browser passage retry storm', async () => {
  const state = setup()
  let calls = 0
  const reader = new TranslationSession({ ...state, texts: ['a', 'b', 'c'], request: async (_passages, _signal, emit) => {
    calls++; emit({ type: 'result', index: 0, text: 'A' }); emit({ type: 'waiting', retryAt: Date.now() + 60_000 }); emit({ type: 'unavailable', retryAt: Date.now() + 60_000 })
  } })
  reader.resume(); await tick(); reader.retry(); reader.resume(); await tick()
  assert.equal(calls, 1)
  assert.equal(state.progress.completed, 1)
  assert.equal(state.progress.failed, 0)
  assert.equal(state.progress.status, 'unavailable')
  reader.dispose()
})

test('leaving a README suppresses late results and cancels its server stream', async () => {
  const state = setup()
  let emit!: (event: ReadmeTranslationEvent) => void
  let signal!: AbortSignal
  const reader = new TranslationSession({ ...state, texts: ['a'], request: async (_passages, next, send) => {
    signal = next; emit = send
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  } })
  reader.resume(); reader.dispose(); emit({ type: 'result', index: 0, text: 'late' }); await tick()
  assert.equal(signal.aborted, true)
  assert.deepEqual(state.results, [])
})

test('provider access rejection cannot restart through timers, online events, pause or retry', async () => {
  const state = setup()
  let calls = 0
  const reader = new TranslationSession({ ...state, texts: ['a', 'b'], reconnectDelay: 1, request: async (_passages, _signal, emit) => {
    calls++; emit({ type: 'result', index: 0, text: 'A' }); emit({ type: 'blocked' })
  } })
  reader.resume(); await tick()
  reader.reconnect(); reader.retry(); reader.pause(); reader.resume(); await tick()
  assert.equal(calls, 1)
  assert.equal(state.progress.status, 'blocked')
  assert.equal(state.progress.completed, 1)
  assert.equal(state.progress.pending, 0)
  assert.equal(state.progress.retryAt, 0)
  reader.dispose()
})
