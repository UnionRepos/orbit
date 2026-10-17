import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TranslationSession, type TranslationProgress } from './translationSession.ts'
import { TranslationRequestError } from './translation.ts'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('README session starts only on request and translates current reading position first', async () => {
  const calls: string[] = []
  const jobs = Array.from({ length: 4 }, () => deferred<string>())
  const results: number[] = []
  let progress!: TranslationProgress
  const reader = new TranslationSession({
    texts: ['a', 'b', 'c', 'd'],
    translate: (text) => { calls.push(text); return jobs['abcd'.indexOf(text)].promise },
    onResult: (index) => results.push(index),
    onProgress: (next) => { progress = next },
    priority: (index) => [3, 2, 0, 1][index],
  })
  assert.deepEqual(calls, [])
  reader.resume()
  assert.deepEqual(calls, ['c', 'd'])
  assert.equal(progress.pending, 2)
  jobs[2].resolve('C')
  await tick()
  assert.deepEqual(calls, ['c', 'd', 'b'])
  assert.equal(progress.completed, 1)
  jobs[3].resolve('D'); jobs[1].resolve('B')
  await tick()
  jobs[0].resolve('A')
  await tick()
  assert.equal(progress.completed, 4)
  assert.equal(progress.pending, 0)
  assert.equal(new Set(results).size, 4)
  reader.dispose()
})

test('pause and original view retain results; resume schedules only unfinished passages', async () => {
  const calls: string[] = []
  const jobs = Array.from({ length: 4 }, () => deferred<string>())
  let progress!: TranslationProgress
  const reader = new TranslationSession({ texts: ['a', 'b', 'c', 'd'], translate: (text) => {
    calls.push(text); return jobs['abcd'.indexOf(text)].promise
  }, onResult: () => {}, onProgress: (next) => { progress = next } })
  reader.resume()
  reader.pause()
  jobs[0].resolve('A'); jobs[1].resolve('B')
  await tick()
  assert.deepEqual(calls, ['a', 'b'])
  assert.equal(progress.completed, 2)
  reader.resume()
  assert.deepEqual(calls, ['a', 'b', 'c', 'd'])
  jobs[2].resolve('C'); jobs[3].resolve('D')
  await tick()
  reader.pause(); reader.resume()
  assert.equal(calls.length, 4)
  assert.equal(progress.completed, 4)
  reader.dispose()
})

test('retry only schedules failed passages and keeps successful results in place', async () => {
  const calls: string[] = []
  let healthy = false
  let progress!: TranslationProgress
  const results: string[] = []
  const reader = new TranslationSession({ texts: ['a', 'b', 'c'], translate: async (text) => {
    calls.push(text)
    if (text === 'b' && !healthy) throw new Error('Unavailable')
    return text.toUpperCase()
  }, onResult: (_index, text) => results.push(text), onProgress: (next) => { progress = next } })
  reader.resume()
  await tick()
  assert.equal(progress.completed, 2)
  assert.equal(progress.failed, 1)
  healthy = true
  reader.retry()
  await tick()
  assert.deepEqual(calls, ['a', 'b', 'c', 'b'])
  assert.deepEqual(results, ['A', 'C', 'B'])
  assert.equal(progress.completed, 3)
  assert.equal(progress.failed, 0)
  reader.dispose()
})

test('leaving a README aborts in-flight work and suppresses late results/progress', async () => {
  const job = deferred<string>()
  let signal!: AbortSignal
  let results = 0
  let reports = 0
  const reader = new TranslationSession({ texts: ['a', 'b', 'c'], translate: (_text, next) => {
    signal = next; return job.promise
  }, onResult: () => { results++ }, onProgress: () => { reports++ } })
  reader.resume()
  reader.dispose()
  const before = reports
  assert.equal(signal.aborted, true)
  job.resolve('late result')
  await tick()
  assert.equal(results, 0)
  assert.equal(reports, before)
})

test('rate limits retain queued work and block retries until the cooldown ends', async () => {
  let progress!: TranslationProgress
  let calls = 0
  const reader = new TranslationSession({ texts: ['a', 'b', 'c'], translate: async () => {
    calls++
    throw new TranslationRequestError(429, 60)
  }, onResult: () => {}, onProgress: (next) => { progress = next } })
  reader.resume()
  await tick()
  assert.equal(calls, 2)
  assert.ok(progress.retryAt > Date.now())
  reader.retry()
  await tick()
  assert.equal(calls, 2)
  assert.equal(progress.failed, 2)
  assert.equal(progress.total, 3)
  reader.dispose()
})
