import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { feedParamsFromRoute, patchFeedQuery } from './feed.ts'
import { parseRoute, repoPath, userPath } from './router.ts'

describe('parseRoute', () => {
  it('parses the home feed', () => {
    assert.equal(parseRoute('#/').name, 'feed')
    assert.equal(parseRoute('').name, 'feed')
  })

  it('parses repository routes with encoded names', () => {
    const route = parseRoute('#/repo/vercel/next.js')
    assert.equal(route.name, 'repo')
    assert.equal(route.owner, 'vercel')
    assert.equal(route.repo, 'next.js')
  })

  it('parses user routes and query strings', () => {
    const route = parseRoute('#/user/octocat?tab=repos')
    assert.equal(route.name, 'user')
    assert.equal(route.login, 'octocat')
    assert.equal(route.query.get('tab'), 'repos')
  })

  it('falls back to the feed for unknown paths', () => {
    assert.equal(parseRoute('#/nope').name, 'feed')
  })
})

describe('route builders', () => {
  it('encodes owners and repositories', () => {
    assert.equal(repoPath('a b', 'c/d'), '/repo/a%20b/c%2Fd')
    assert.equal(userPath('octo cat'), '/user/octo%20cat')
  })
})

describe('feedParamsFromRoute', () => {
  it('sanitises unknown channels and sorts', () => {
    const params = feedParamsFromRoute(parseRoute('#/?channel=bogus&sort=nope'))
    assert.equal(params.channel, 'trending')
    assert.equal(params.sort, 'best')
  })

  it('reads supported filters', () => {
    const params = feedParamsFromRoute(
      parseRoute('#/?channel=gems&language=Rust&topic=cli&minStars=500&createdWithin=30&q=fast'),
    )
    assert.equal(params.channel, 'gems')
    assert.equal(params.language, 'Rust')
    assert.equal(params.topic, 'cli')
    assert.equal(params.minStars, 500)
    assert.equal(params.createdWithin, 30)
    assert.equal(params.q, 'fast')
  })
})

describe('patchFeedQuery', () => {
  it('sets and removes values', () => {
    const next = patchFeedQuery(new URLSearchParams('channel=fresh&q=rust'), {
      topic: 'cli',
      q: '',
      minStars: 0,
    })
    assert.equal(next.get('topic'), 'cli')
    assert.equal(next.get('q'), null)
    assert.equal(next.get('minStars'), null)
    assert.equal(next.get('channel'), 'fresh')
  })
})
