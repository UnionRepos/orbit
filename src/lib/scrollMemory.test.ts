import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { parseRoute } from './router.ts'
import {
  forgetScroll,
  recallScroll,
  rememberScroll,
  resetScrollMemory,
  routeScrollKey,
} from './scrollMemory.ts'

beforeEach(() => resetScrollMemory())

describe('routeScrollKey', () => {
  it('ignores the repository segment order for the feed', () => {
    assert.equal(routeScrollKey(parseRoute('#/')), 'feed')
    assert.equal(routeScrollKey(parseRoute('')), 'feed')
  })

  it('separates feed filter combinations', () => {
    const trending = routeScrollKey(parseRoute('#/?channel=trending'))
    const gems = routeScrollKey(parseRoute('#/?channel=gems&language=Rust'))
    assert.equal(trending, 'feed?channel=trending')
    assert.equal(gems, 'feed?channel=gems&language=Rust')
    assert.notEqual(trending, gems)
  })

  it('keys detail routes by name and path', () => {
    assert.equal(routeScrollKey(parseRoute('#/repo/vercel/next.js')), 'repo:/repo/vercel/next.js')
    assert.equal(routeScrollKey(parseRoute('#/user/octocat')), 'user:/user/octocat')
  })
})

describe('scroll memory', () => {
  it('remembers and recalls an offset', () => {
    rememberScroll('feed', 1234.6)
    assert.equal(recallScroll('feed'), 1235)
  })

  it('forgets an offset once the user returns to the top', () => {
    rememberScroll('feed', 800)
    rememberScroll('feed', 0)
    assert.equal(recallScroll('feed'), undefined)
  })

  it('keeps offsets per key and clears them on demand', () => {
    rememberScroll('feed?channel=gems', 400)
    rememberScroll('feed?channel=fresh', 900)
    assert.equal(recallScroll('feed?channel=gems'), 400)
    assert.equal(recallScroll('feed?channel=fresh'), 900)
    forgetScroll('feed?channel=gems')
    assert.equal(recallScroll('feed?channel=gems'), undefined)
    assert.equal(recallScroll('feed?channel=fresh'), 900)
  })

  it('rejects invalid offsets', () => {
    rememberScroll('feed', Number.NaN)
    rememberScroll('feed', -10)
    assert.equal(recallScroll('feed'), undefined)
  })

  it('evicts the oldest offsets beyond the limit', () => {
    for (let index = 0; index < 40; index += 1) rememberScroll(`feed?page=${index}`, 100 + index)
    assert.equal(recallScroll('feed?page=0'), undefined)
    assert.equal(recallScroll('feed?page=39'), 139)
  })
})
