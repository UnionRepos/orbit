import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FeedQuery } from '../shared/types.ts'
import {
  buildSearchQuery,
  querySort,
  seedCount,
  seedFeed,
  seedRepo,
} from './feed.ts'
// Registers the bundled snapshot with the lazy seed loader.
import './seed-node.ts'

const base: FeedQuery = {
  channel: 'trending',
  q: '',
  language: '',
  topic: '',
  minStars: 0,
  createdWithin: 0,
  sort: 'best',
  page: 1,
  perPage: 12,
}

describe('buildSearchQuery', () => {
  it('adds channel constraints for trending', () => {
    const query = buildSearchQuery(base)
    assert.match(query, /created:>=\d{4}-\d{2}-\d{2}/)
    assert.match(query, /archived:false/)
    assert.match(query, /stars:>=200/)
  })

  it('drops channel age filters when a text query is present', () => {
    const query = buildSearchQuery({ ...base, channel: 'fresh', q: 'react' })
    assert.ok(query.startsWith('react'))
    assert.doesNotMatch(query, /created:>=/)
    assert.doesNotMatch(query, /pushed:>=/)
  })

  it('quotes languages and applies topics and star floors', () => {
    const query = buildSearchQuery({
      ...base,
      language: 'TypeScript',
      topic: 'cli',
      minStars: 1000,
    })
    assert.match(query, /language:"TypeScript"/)
    assert.match(query, /topic:cli/)
    assert.match(query, /stars:>=1000/)
  })

  it('never widens a channel star floor', () => {
    const query = buildSearchQuery({ ...base, channel: 'stars', minStars: 10 })
    assert.match(query, /stars:>=40000/)
  })

  it('keeps upper bounds only for bounded channels', () => {
    const gems = buildSearchQuery({ ...base, channel: 'gems' })
    assert.match(gems, /stars:>=100/)
    assert.match(gems, /stars:<=2500/)
  })
})

describe('querySort', () => {
  it('uses the channel default for best match', () => {
    assert.deepEqual(querySort(base), { sort: 'stars', order: 'desc' })
  })

  it('drops sort for text searches to preserve relevance', () => {
    assert.deepEqual(querySort({ ...base, q: 'rust' }), { order: 'desc' })
  })

  it('honours explicit sorts', () => {
    assert.deepEqual(querySort({ ...base, sort: 'forks' }), { sort: 'forks', order: 'desc' })
  })
})

describe('seed snapshot', () => {
  it('bundles curated repositories', async () => {
    assert.ok((await seedCount()) > 100)
  })

  it('finds a known repository case-insensitively', async () => {
    const repo = await seedRepo('Codecrafters-IO/BUILD-YOUR-OWN-X')
    assert.ok(repo)
    assert.equal(repo.fullName.toLowerCase(), 'codecrafters-io/build-your-own-x')
  })

  it('filters by language and topic', async () => {
    const rust = await seedFeed({ ...base, language: 'Rust', perPage: 12 })
    assert.ok(rust.length > 0)
    assert.ok(rust.every((repo) => repo.language === 'Rust'))
  })

  it('sorts by stars descending', async () => {
    const items = await seedFeed({ ...base, sort: 'stars' })
    for (let i = 1; i < items.length; i++) {
      assert.ok(items[i - 1].stars >= items[i].stars)
    }
  })
})
