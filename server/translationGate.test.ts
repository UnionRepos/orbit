import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TranslationGate } from './translationGate.ts'
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('the shared provider lane is serialized and spaced between requests', async () => {
  let now = 0
  let finish!: () => void
  const starts: number[] = []
  const gate = new TranslationGate(750, () => now, async (ms) => { now += ms })
  const signal = new AbortController().signal
  const first = gate.run(signal, async () => { starts.push(now); await new Promise<void>((resolve) => { finish = resolve }) })
  const second = gate.run(signal, async () => { starts.push(now) })
  await tick()
  assert.deepEqual(starts, [0])
  finish()
  await Promise.all([first, second])
  assert.deepEqual(starts, [0, 750])
})

test('rate-limit cooldown applies across different README streams', async () => {
  let now = 0
  const starts: number[] = []
  const gate = new TranslationGate(750, () => now, async (ms) => { now += ms })
  const signal = new AbortController().signal
  await gate.run(signal, async () => { starts.push(now); gate.defer(5000) })
  await gate.run(signal, async () => { starts.push(now) })
  assert.deepEqual(starts, [0, 5000])
})

test('cancelling a queued reader cannot release another active reader lane', async () => {
  let finish!: () => void
  let thirdStarted = false
  const gate = new TranslationGate(0)
  const active = gate.run(new AbortController().signal, () => new Promise<void>((resolve) => { finish = resolve }))
  const controller = new AbortController()
  const cancelled = assert.rejects(gate.run(controller.signal, async () => {}))
  const third = gate.run(new AbortController().signal, async () => { thirdStarted = true })
  controller.abort()
  await cancelled
  await tick()
  assert.equal(thirdStarted, false)
  finish()
  await Promise.all([active, third])
  assert.equal(thirdStarted, true)
})
