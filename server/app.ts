import { Hono } from 'hono'
import { createTranslationRoutes } from './translation.ts'
import { cors } from 'hono/cors'
import type {
  ChannelId,
  DataSource,
  FeedQuery,
  FeedResponse,
  HealthResponse,
  ReadmeResponse,
  RepoDetail,
  SearchResponse,
  UserResponse,
} from '../shared/types.ts'
import { config, hasToken } from './config.ts'
import { edgeCache } from './edge.ts'
import { buildSearchQuery, querySort, seedCount, seedFeed, seedGeneratedAt, seedRepo } from './feed.ts'
import { GitHubError, cache, getRate, ghJson, rawText, type GhResult } from './github.ts'
import {
  toContributors,
  toLanguages,
  toReleases,
  toRepoSummary,
  toUserProfile,
  type GhContributor,
  type GhRelease,
  type GhRepo,
  type GhUser,
} from './map.ts'
import { recallRepo, rememberRepo } from './memo.ts'

interface GhSearchPayload {
  total_count: number
  incomplete_results: boolean
  items: GhRepo[]
}

const CHANNEL_IDS: ChannelId[] = ['trending', 'rising', 'fresh', 'gems', 'first', 'stars']
const SORTS: FeedQuery['sort'][] = ['best', 'stars', 'updated', 'forks']

export const app = new Hono()

app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }))

// Serve repeat reads from the Cloudflare edge cache, so a freshly started
// isolate answers in a few milliseconds instead of waiting on GitHub again.
app.use('/api/*', edgeCache())

app.route('/api/translate', createTranslationRoutes())

function parseFeedQuery(url: URL): FeedQuery {
  const qp = url.searchParams
  const channelParam = qp.get('channel') ?? ''
  const channel = CHANNEL_IDS.includes(channelParam as ChannelId)
    ? (channelParam as ChannelId)
    : 'trending'
  const sortParam = qp.get('sort') ?? ''
  const sort = SORTS.includes(sortParam as FeedQuery['sort'])
    ? (sortParam as FeedQuery['sort'])
    : 'best'

  const page = clamp(Number(qp.get('page')) || 1, 1, 30)
  const perPage = clamp(Number(qp.get('perPage')) || 12, 1, 30)
  const minStars = clamp(Number(qp.get('minStars')) || 0, 0, 5_000_000)
  const createdWithin = clamp(Number(qp.get('createdWithin')) || 0, 0, 3650)
  const language = clean(qp.get('language'), 40)
  const topic = clean(qp.get('topic'), 50).replace(/[^a-zA-Z0-9-]/g, '')
  const q = clean(qp.get('q'), 160)

  return { channel, q, language, topic, minStars, createdWithin, sort, page, perPage }
}

function clean(value: string | undefined | null, max: number): string {
  return (value ?? '').trim().slice(0, max)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function safeSegment(value: string): boolean {
  return /^[a-zA-Z0-9_.-]{1,100}$/.test(value) && value !== '.' && value !== '..'
}

app.get('/api/health', (c) => {
  const stats = cache.stats()
  const payload: HealthResponse = {
    ok: true,
    hasToken,
    rate: getRate(),
    cache: { entries: stats.entries, bytes: stats.bytes },
    uptime: runtimeUptime(),
    version: config.version,
  }
  c.header('Cache-Control', 'no-store')
  return c.json(payload)
})

app.get('/api/feed', async (c) => {
  const params = parseFeedQuery(new URL(c.req.url))
  const query = buildSearchQuery(params)
  const { sort, order } = querySort(params)
  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')

  try {
    const search = new URLSearchParams({
      q: query,
      per_page: String(params.perPage),
      page: String(params.page),
      order,
    })
    if (sort) search.set('sort', sort)

    const result = await ghJson<GhSearchPayload>(`/search/repositories?${search.toString()}`, {
      ttl: 8 * 60 * 1000,
    })

    const items = result.data.items.map(toRepoSummary)
    for (const repo of items) rememberRepo(repo)

    const payload: FeedResponse = {
      items,
      total: result.data.total_count,
      page: params.page,
      perPage: params.perPage,
      hasMore:
        result.data.items.length === params.perPage &&
        params.page * params.perPage < Math.min(result.data.total_count, 1000),
      query,
      source: result.source,
      fetchedAt: result.fetchedAt,
      rate: getRate(),
      channel: params.channel,
      hasToken,
      note:
        result.source === 'stale'
          ? 'GitHub is rate limited right now. Showing the last cached snapshot.'
          : undefined,
    }
    return c.json(payload)
  } catch (error) {
    const fallback = await seedFeed(params)
    if (fallback.length > 0) {
      const offset = (params.page - 1) * params.perPage
      const items = fallback.slice(offset, offset + params.perPage)
      const payload: FeedResponse = {
        items,
        total: fallback.length,
        page: params.page,
        perPage: params.perPage,
        hasMore: offset + params.perPage < fallback.length,
        query,
        source: 'seed',
        fetchedAt: Date.now(),
        rate: getRate(),
        channel: params.channel,
        hasToken,
        note: `Live GitHub data is unavailable (${await seedCount()} curated projects loaded). Showing the built-in snapshot.`,
      }
      return c.json(payload)
    }
    throw error
  }
})

app.get('/api/repo/:owner/:repo', async (c) => {
  const owner = c.req.param('owner')
  const repoName = c.req.param('repo')
  if (!safeSegment(owner) || !safeSegment(repoName)) {
    throw new GitHubError(400, 'Invalid repository path.')
  }
  const fullName = `${owner}/${repoName}`
  const base = `/repos/${owner}/${repoName}`

  const [repoResult, languagesResult, contributorsResult, releasesResult] = await Promise.allSettled([
    ghJson<GhRepo>(base, { ttl: 10 * 60 * 1000 }),
    ghJson<Record<string, number>>(`${base}/languages`, { ttl: 24 * 60 * 60 * 1000 }),
    ghJson<GhContributor[]>(`${base}/contributors?per_page=14`, { ttl: 6 * 60 * 60 * 1000 }),
    ghJson<GhRelease[]>(`${base}/releases?per_page=6`, { ttl: 30 * 60 * 1000 }),
  ])

  let repo
  let source: DataSource = 'seed'
  if (repoResult.status === 'fulfilled') {
    repo = toRepoSummary(repoResult.value.data)
    source = repoResult.value.source
    rememberRepo(repo)
  } else {
    repo = recallRepo(fullName) ?? (await seedRepo(fullName))
    if (!repo) throw repoResult.reason
    source = 'seed'
  }

  const payload: RepoDetail = {
    repo,
    languages:
      languagesResult.status === 'fulfilled' ? toLanguages(languagesResult.value.data) : [],
    contributors:
      contributorsResult.status === 'fulfilled'
        ? toContributors(contributorsResult.value.data)
        : [],
    releases: releasesResult.status === 'fulfilled' ? toReleases(releasesResult.value.data) : [],
    partial:
      languagesResult.status === 'rejected' ||
      contributorsResult.status === 'rejected' ||
      releasesResult.status === 'rejected',
    source,
    rate: getRate(),
  }

  c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  return c.json(payload)
})

/**
 * Candidates are probed in parallel waves (keeping priority order) instead of
 * one round trip after another: a repo whose README has an unusual name pays
 * three round trips instead of six.
 */
const README_WAVES: string[][] = [
  ['README.md', 'readme.md'],
  ['Readme.md', 'README.rst', 'README'],
  ['docs/README.md'],
]

interface ReadmeHit {
  path: string
  data: string
  source: GhResult<string>['source']
}

async function findReadme(owner: string, repoName: string): Promise<ReadmeHit | null> {
  for (const wave of README_WAVES) {
    const settled = await Promise.all(
      wave.map(async (candidate): Promise<ReadmeHit | null> => {
        try {
          const result = await rawText(
            `https://raw.githubusercontent.com/${owner}/${repoName}/HEAD/${candidate}`,
          )
          return { path: candidate, data: result.data, source: result.source }
        } catch {
          return null
        }
      }),
    )
    const hit = settled.find((result): result is ReadmeHit => result !== null)
    if (hit) return hit
  }
  return null
}

app.get('/api/readme/:owner/:repo', async (c) => {
  const owner = c.req.param('owner')
  const repoName = c.req.param('repo')
  if (!safeSegment(owner) || !safeSegment(repoName)) {
    throw new GitHubError(400, 'Invalid repository path.')
  }

  c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=900')

  const found = await findReadme(owner, repoName)
  if (found) {
    const payload: ReadmeResponse = {
      markdown: truncateReadme(found.data),
      path: found.path,
      htmlUrl: `https://github.com/${owner}/${repoName}/blob/HEAD/${found.path}`,
      source: found.source,
    }
    return c.json(payload)
  }

  // Last resort: ask the API which file the repo uses as its README.
  try {
    const result = await ghJson<string>(`/repos/${owner}/${repoName}/readme`, {
      ttl: 24 * 60 * 60 * 1000,
      accept: 'application/vnd.github.raw+json',
      text: true,
    })
    const payload: ReadmeResponse = {
      markdown: truncateReadme(result.data),
      path: 'README',
      htmlUrl: `https://github.com/${owner}/${repoName}#readme`,
      source: result.source,
    }
    return c.json(payload)
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      throw new GitHubError(404, 'This repository does not have a README.')
    }
    throw error
  }
})

app.get('/api/user/:login', async (c) => {
  const login = c.req.param('login')
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(login)) {
    throw new GitHubError(400, 'Invalid GitHub username.')
  }

  c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
  const [userResult, reposResult] = await Promise.allSettled([
    ghJson<GhUser>(`/users/${login}`, { ttl: 30 * 60 * 1000 }),
    ghJson<GhRepo[]>(`/users/${login}/repos?sort=updated&per_page=100`, {
      ttl: 30 * 60 * 1000,
    }),
  ])

  if (userResult.status === 'rejected') throw userResult.reason

  const repos = reposResult.status === 'fulfilled' ? reposResult.value.data : []
  const mapped = repos
    .map(toRepoSummary)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 9)
  for (const repo of mapped) rememberRepo(repo)

  const payload: UserResponse = {
    user: toUserProfile(userResult.value.data),
    repos: mapped,
    rate: getRate(),
    source: userResult.value.source,
  }
  return c.json(payload)
})

app.get('/api/search', async (c) => {
  const q = clean(c.req.query('q'), 120)
  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')

  if (q.length < 2) {
    const empty: SearchResponse = { repos: [], user: null, rate: getRate(), source: 'live' }
    return c.json(empty)
  }

  const search = new URLSearchParams({ q, per_page: '8' })
  const shouldTryUser = /^[a-zA-Z0-9-]{2,39}$/.test(q)

  const [reposResult, userResult] = await Promise.allSettled([
    ghJson<GhSearchPayload>(`/search/repositories?${search.toString()}`, {
      ttl: 5 * 60 * 1000,
    }),
    shouldTryUser
      ? ghJson<GhUser>(`/users/${q}`, { ttl: 30 * 60 * 1000 })
      : Promise.reject(new GitHubError(404, 'Not a username')),
  ])

  if (reposResult.status === 'rejected' && userResult.status === 'rejected') {
    throw reposResult.reason
  }

  const repos = reposResult.status === 'fulfilled' ? reposResult.value.data.items.map(toRepoSummary) : []
  for (const repo of repos) rememberRepo(repo)

  const payload: SearchResponse = {
    repos,
    user: userResult.status === 'fulfilled' ? toUserProfile(userResult.value.data) : null,
    rate: getRate(),
    source:
      reposResult.status === 'fulfilled'
        ? reposResult.value.source
        : userResult.status === 'fulfilled'
          ? userResult.value.source
          : 'live',
  }
  return c.json(payload)
})

app.get('/api/seed', async (c) => {
  c.header('Cache-Control', 'public, max-age=3600')
  return c.json({ count: await seedCount(), generatedAt: await seedGeneratedAt() })
})

/** `process` does not exist on every runtime (Cloudflare Workers). */
function runtimeUptime(): number {
  if (typeof process === 'undefined' || typeof process.uptime !== 'function') return 0
  return Math.round(process.uptime())
}

function truncateReadme(markdown: string): string {
  const limit = 220_000
  if (markdown.length <= limit) return markdown
  return `${markdown.slice(0, limit)}\n\n---\n\n*README truncated by Orbit.*`
}

app.onError((error, c) => {
  if (error instanceof GitHubError) {
    const retry = error.reset ? Math.max(0, Math.ceil((error.reset * 1000 - Date.now()) / 1000)) : undefined
    return c.json(
      { error: error.message, status: error.status, reset: error.reset, retryAfter: retry },
      error.status >= 400 && error.status < 600 ? (error.status as 400) : 500,
    )
  }
  console.error('[orbit]', error)
  return c.json({ error: 'Something went wrong while talking to GitHub.', status: 500 }, 500)
})
