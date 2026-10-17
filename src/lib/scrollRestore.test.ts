import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_IDLE_MS,
  MAX_PULLS,
  nextRestoreAction,
  PULL_DELAY_MS,
  type RestoreQuery,
  SETTLE_MS,
} from './scrollRestore.ts'

function query(patch: Partial<RestoreQuery> = {}): RestoreQuery {
  return {
    target: 5000,
    maxTop: 1500,
    idleMs: 0,
    sincePullMs: 10_000,
    pulls: 0,
    hasMore: true,
    ...patch,
  }
}

describe('nextRestoreAction', () => {
  it('finishes once the document is tall enough for the offset', () => {
    assert.equal(nextRestoreAction(query({ maxTop: 5000 })), 'done')
    assert.equal(nextRestoreAction(query({ maxTop: 4999 })), 'done')
  })

  it('waits for the first page while it is still growing', () => {
    assert.equal(nextRestoreAction(query({ idleMs: 10 })), 'wait')
  })

  it('pulls more pages when the list stops growing short of the offset', () => {
    assert.equal(nextRestoreAction(query({ idleMs: PULL_DELAY_MS })), 'pull')
  })

  it('waits out the cooldown instead of spamming page requests', () => {
    assert.equal(
      nextRestoreAction(query({ idleMs: PULL_DELAY_MS, sincePullMs: PULL_DELAY_MS - 1 })),
      'wait',
    )
  })

  it('stops pulling once the safety cap is reached', () => {
    assert.equal(nextRestoreAction(query({ idleMs: MAX_IDLE_MS - 1, pulls: MAX_PULLS })), 'wait')
  })

  it('gives up on growth that never arrives', () => {
    assert.equal(nextRestoreAction(query({ idleMs: MAX_IDLE_MS })), 'clamp')
    assert.equal(nextRestoreAction(query({ idleMs: MAX_IDLE_MS, hasMore: false })), 'clamp')
  })

  it('clamps quickly when the list has no more pages', () => {
    assert.equal(nextRestoreAction(query({ hasMore: false, idleMs: SETTLE_MS - 1 })), 'wait')
    assert.equal(nextRestoreAction(query({ hasMore: false, idleMs: SETTLE_MS })), 'clamp')
  })
})
