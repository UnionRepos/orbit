import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  toContributors,
  toLanguages,
  toReleases,
  toRepoSummary,
  type GhContributor,
  type GhRelease,
  type GhRepo,
  type GhUser,
} from './map.ts'
import { toUserProfile } from './map.ts'

const now = Date.now()
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString()

const rawRepo: GhRepo = {
  id: 42,
  name: 'orbit',
  full_name: 'acme/orbit',
  owner: {
    login: 'acme',
    avatar_url: 'https://avatars.example/acme.png',
    type: 'Organization',
    html_url: 'https://github.com/acme',
  },
  description: 'A feed-style GitHub client',
  html_url: 'https://github.com/acme/orbit',
  homepage: '',
  stargazers_count: 12_500,
  forks_count: 850,
  open_issues_count: 17,
  watchers_count: 12_500,
  language: 'TypeScript',
  topics: ['react', 'hono', 'vite', 'a', 'b', 'c', 'd', 'e', 'f'],
  license: { spdx_id: 'MIT', name: 'MIT License' },
  created_at: daysAgo(365),
  updated_at: daysAgo(1),
  pushed_at: daysAgo(1),
  archived: false,
  fork: false,
  default_branch: 'main',
  size: 2048,
}

describe('toRepoSummary', () => {
  it('maps GitHub fields and caps topics at eight', () => {
    const repo = toRepoSummary(rawRepo)
    assert.equal(repo.fullName, 'acme/orbit')
    assert.equal(repo.stars, 12_500)
    assert.equal(repo.license, 'MIT')
    assert.equal(repo.topics.length, 8)
    assert.equal(repo.pushedAt, rawRepo.pushed_at)
  })

  it('produces a bounded momentum score and positive velocity', () => {
    const repo = toRepoSummary(rawRepo)
    assert.ok(repo.heat >= 0 && repo.heat <= 100)
    assert.ok(repo.starsPerDay > 0)
  })

  it('falls back to the license name when SPDX is missing', () => {
    const repo = toRepoSummary({
      ...rawRepo,
      license: { spdx_id: 'NOASSERTION', name: 'Custom' },
    })
    assert.equal(repo.license, 'Custom')
  })

  it('handles a null homepage and pushed date', () => {
    const repo = toRepoSummary({
      ...rawRepo,
      homepage: null,
      pushed_at: null,
      license: null,
    })
    assert.equal(repo.homepage, null)
    assert.equal(repo.license, null)
    assert.equal(repo.pushedAt, rawRepo.updated_at)
  })
})

describe('toLanguages', () => {
  it('sorts by bytes and computes percentages that sum to ~100', () => {
    const stats = toLanguages({ TypeScript: 600, CSS: 300, HTML: 100 })
    assert.deepEqual(stats.map((s) => s.name), ['TypeScript', 'CSS', 'HTML'])
    const total = stats.reduce((sum, s) => sum + s.percent, 0)
    assert.ok(Math.abs(total - 100) < 0.5)
    assert.ok(stats.every((s) => s.color.startsWith('#')))
  })

  it('returns an empty list for an empty repository', () => {
    assert.deepEqual(toLanguages({}), [])
  })
})

describe('contributors and releases', () => {
  it('filters invalid contributors and caps the list', () => {
    const raw: GhContributor[] = [
      { login: 'a', avatar_url: '', html_url: '', contributions: 10 },
      { login: '', avatar_url: '', html_url: '', contributions: 3 },
      ...Array.from({ length: 20 }, (_, i) => ({
        login: `dev${i}`,
        avatar_url: '',
        html_url: '',
        contributions: i,
      })),
    ]
    const list = toContributors(raw)
    assert.equal(list.length, 14)
    assert.ok(list.every((c) => c.login))
  })

  it('maps releases with tag fallbacks', () => {
    const raw: GhRelease[] = [
      {
        tag_name: 'v1.0.0',
        name: null,
        published_at: daysAgo(2),
        html_url: 'https://github.com/acme/orbit/releases/v1.0.0',
        prerelease: false,
      },
    ]
    const releases = toReleases(raw)
    assert.equal(releases[0].name, 'v1.0.0')
    assert.equal(releases[0].prerelease, false)
  })
})

describe('toUserProfile', () => {
  it('maps profile fields', () => {
    const raw: GhUser = {
      login: 'octocat',
      name: 'The Octocat',
      avatar_url: 'https://avatars.example/octocat.png',
      html_url: 'https://github.com/octocat',
      bio: 'hi',
      company: '@github',
      blog: 'https://github.blog',
      location: 'San Francisco',
      twitter_username: 'octocat',
      followers: 100,
      following: 2,
      public_repos: 8,
      created_at: daysAgo(4000),
      type: 'User',
    }
    const user = toUserProfile(raw)
    assert.equal(user.login, 'octocat')
    assert.equal(user.twitter, 'octocat')
    assert.equal(user.publicRepos, 8)
  })
})
