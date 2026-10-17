import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  getSeed,
  isSeedLoaded,
  memo,
  resetSeedMemo,
  setSeedProvider,
  type SeedFile,
} from './seed-core.ts'

const raw = (fullName: string, stars: number) => ({
  id: stars,
  name: fullName.split('/')[1],
  full_name: fullName,
  owner: {
    login: fullName.split('/')[0],
    avatar_url: 'https://avatars.example/a.png',
    html_url: `https://github.com/${fullName.split('/')[0]}`,
  },
  description: null,
  html_url: `https://github.com/${fullName}`,
  homepage: null,
  stargazers_count: stars,
  forks_count: 1,
  open_issues_count: 0,
  watchers_count: stars,
  language: 'Rust',
  topics: ['cli'],
  license: { spdx_id: 'MIT' },
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  pushed_at: '2024-01-01T00:00:00Z',
  archived: false,
  fork: false,
  default_branch: 'main',
  size: 1,
})

const snapshot: SeedFile = {
  generatedAt: '2024-01-01T00:00:00Z',
  items: [raw('acme/orbit', 10), raw('acme/lens', 20)],
}

beforeEach(() => {
  resetSeedMemo()
  setSeedProvider(null)
})

describe('lazy seed loading', () => {
  it('does not load the snapshot until it is needed', async () => {
    let calls = 0
    setSeedProvider(async () => {
      calls += 1
      return snapshot
    })

    assert.equal(calls, 0)
    assert.equal(isSeedLoaded(), false)

    const index = await getSeed()
    assert.equal(calls, 1)
    assert.equal(index.items.length, 2)
    assert.equal(index.generatedAt, '2024-01-01T00:00:00Z')
    assert.equal(index.byName.get('acme/orbit')?.stars, 10)
  })

  it('loads once and reuses the index afterwards', async () => {
    let calls = 0
    setSeedProvider(async () => {
      calls += 1
      return snapshot
    })

    await Promise.all([getSeed(), getSeed(), getSeed()])
    await getSeed()
    assert.equal(calls, 1)
  })

  it('accepts raw JSON text so a Worker can stream it from assets', async () => {
    setSeedProvider(async () => JSON.stringify(snapshot))
    const index = await getSeed()
    assert.equal(index.items[1].fullName, 'acme/lens')
  })

  it('resolves empty when no provider is registered', async () => {
    const index = await getSeed()
    assert.equal(index.items.length, 0)
  })

  it('degrades to an empty index when the snapshot is broken', async () => {
    setSeedProvider(async () => '{not json')
    const index = await getSeed()
    assert.equal(index.items.length, 0)
  })
})

describe('memo helper', () => {
  it('builds a value once per key', () => {
    let builds = 0
    for (let i = 0; i < 3; i += 1) memo('key', () => ++builds)
    assert.equal(builds, 1)
  })

  it('evicts the oldest entries beyond its limit', () => {
    let builds = 0
    for (let i = 0; i < 40; i += 1) memo(`key-${i}`, () => ++builds)
    memo('key-0', () => ++builds)
    assert.equal(builds, 41)
  })
})
