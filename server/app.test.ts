import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

process.env.ORBIT_CACHE_FILE = `/tmp/orbit-test-cache-${process.pid}.json`

const { app } = await import('./app.ts')

const now = Date.now()
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString()

const repoJson = {
  id: 7,
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
  homepage: 'https://orbit.example',
  stargazers_count: 4321,
  forks_count: 123,
  open_issues_count: 4,
  watchers_count: 4321,
  language: 'TypeScript',
  topics: ['react', 'hono'],
  license: { spdx_id: 'MIT', name: 'MIT License' },
  created_at: daysAgo(200),
  updated_at: daysAgo(1),
  pushed_at: daysAgo(1),
  archived: false,
  fork: false,
  default_branch: 'main',
  size: 1024,
}

const userJson = {
  login: 'octocat',
  name: 'The Octocat',
  avatar_url: 'https://avatars.example/octocat.png',
  html_url: 'https://github.com/octocat',
  bio: 'hi',
  company: null,
  blog: null,
  location: null,
  twitter_username: null,
  followers: 10,
  following: 1,
  public_repos: 2,
  created_at: daysAgo(3000),
  type: 'User',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '59',
      'x-ratelimit-reset': String(Math.floor(now / 1000) + 3600),
      etag: '"test-etag"',
    },
  })
}

function installFetch(overrides: Record<string, () => Response> = {}) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    for (const [fragment, handler] of Object.entries(overrides)) {
      if (url.includes(fragment)) return handler()
    }
    if (url.includes('/search/repositories')) {
      return jsonResponse({ total_count: 1, incomplete_results: false, items: [repoJson] })
    }
    if (url.includes('/repos/acme/orbit/languages')) {
      return jsonResponse({ TypeScript: 900, CSS: 100 })
    }
    if (url.includes('/repos/acme/orbit/contributors')) {
      return jsonResponse([
        {
          login: 'octocat',
          avatar_url: 'https://avatars.example/octocat.png',
          html_url: 'https://github.com/octocat',
          contributions: 42,
        },
      ])
    }
    if (url.includes('/repos/acme/orbit/releases')) {
      return jsonResponse([
        {
          tag_name: 'v1.0.0',
          name: 'Orbit 1.0',
          published_at: daysAgo(3),
          html_url: 'https://github.com/acme/orbit/releases/v1.0.0',
          prerelease: false,
        },
      ])
    }
    if (url.startsWith('https://raw.githubusercontent.com/')) {
      return new Response('# Orbit\n\nHello **world**.\n', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    }
    if (url.includes('/users/octocat/repos')) {
      return jsonResponse([repoJson])
    }
    if (url.includes('/users/octocat')) {
      return jsonResponse(userJson)
    }
    if (url.includes('/repos/acme/orbit')) {
      return jsonResponse(repoJson)
    }
    return jsonResponse({ message: 'Not Found' }, 404)
  }) as typeof fetch
}

function restoreFetch() {
  delete (globalThis as { fetch?: typeof fetch }).fetch
}

describe('API feed', () => {
  it('returns a mapped, paginated feed', async () => {
    installFetch()
    const res = await app.request('/api/feed?channel=trending&perPage=1')
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      items: { fullName: string; heat: number }[]
      total: number
      channel: string
      source: string
    }
    assert.equal(body.channel, 'trending')
    assert.equal(body.items[0].fullName, 'acme/orbit')
    assert.ok(body.items[0].heat >= 0)
    assert.equal(typeof body.total, 'number')
    assert.ok(['live', 'cache'].includes(body.source))
    restoreFetch()
  })

  it('falls back to the curated snapshot when GitHub is unreachable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    const res = await app.request('/api/feed?channel=stars&perPage=3')
    // A cached response may still be used; either way the API must answer.
    assert.equal(res.status, 200)
    const body = (await res.json()) as { items: unknown[]; source: string }
    assert.ok(Array.isArray(body.items))
    assert.ok(body.items.length > 0)
    restoreFetch()
  })
})

describe('API repository', () => {
  it('returns details, languages, contributors and releases', async () => {
    installFetch()
    const res = await app.request('/api/repo/acme/orbit')
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      repo: { fullName: string }
      languages: { name: string; percent: number }[]
      contributors: { login: string }[]
      releases: { tagName: string }[]
    }
    assert.equal(body.repo.fullName, 'acme/orbit')
    assert.equal(body.languages[0].name, 'TypeScript')
    assert.equal(body.contributors[0].login, 'octocat')
    assert.equal(body.releases[0].tagName, 'v1.0.0')
    restoreFetch()
  })

  it('rejects unsafe repository segments', async () => {
    installFetch()
    const res = await app.request('/api/repo/acme/bad%20name')
    assert.equal(res.status, 400)
    restoreFetch()
  })
})

describe('API readme', () => {
  it('serves markdown from the raw CDN', async () => {
    installFetch()
    const res = await app.request('/api/readme/acme/orbit')
    assert.equal(res.status, 200)
    const body = (await res.json()) as { markdown: string; path: string }
    assert.match(body.markdown, /Hello \*\*world\*\*/)
    assert.equal(body.path, 'README.md')
    restoreFetch()
  })
})

describe('API user and search', () => {
  it('returns a profile with top repositories', async () => {
    installFetch()
    const res = await app.request('/api/user/octocat')
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      user: { login: string }
      repos: { fullName: string }[]
    }
    assert.equal(body.user.login, 'octocat')
    assert.equal(body.repos[0].fullName, 'acme/orbit')
    restoreFetch()
  })

  it('searches repositories and usernames together', async () => {
    installFetch()
    const res = await app.request('/api/search?q=octocat')
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      repos: { fullName: string }[]
      user: { login: string } | null
    }
    assert.equal(body.repos[0].fullName, 'acme/orbit')
    assert.equal(body.user?.login, 'octocat')
    restoreFetch()
  })

  it('returns an empty result for too-short queries', async () => {
    installFetch()
    const res = await app.request('/api/search?q=a')
    assert.equal(res.status, 200)
    const body = (await res.json()) as { repos: unknown[]; user: unknown }
    assert.deepEqual(body.repos, [])
    assert.equal(body.user, null)
    restoreFetch()
  })
})

describe('API health', () => {
  it('reports cache and rate state', async () => {
    installFetch()
    const res = await app.request('/api/health')
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      ok: boolean
      version: string
      cache: { entries: number }
    }
    assert.equal(body.ok, true)
    assert.equal(typeof body.version, 'string')
    assert.ok(body.cache.entries >= 0)
    restoreFetch()
  })
})
