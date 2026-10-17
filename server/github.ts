import type { RateInfo } from '../shared/types.ts'
import { runInBackground } from './background.ts'
import { JsonCache } from './cache.ts'
import { config, hasToken } from './config.ts'

export class GitHubError extends Error {
  status: number
  reset?: number

  constructor(status: number, message: string, reset?: number) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
    this.reset = reset
  }
}

export interface GhResult<T> {
  data: T
  source: 'live' | 'cache' | 'stale'
  fetchedAt: number
  etag?: string
}

export interface GhOptions {
  ttl: number
  accept?: string
  text?: boolean
  /** Internal: bypass stale-while-revalidate (used by the refresh itself). */
  revalidate?: boolean
}

const API = 'https://api.github.com'
export const cache = new JsonCache()

let rate: RateInfo = { limit: 60, remaining: 60, reset: 0, resource: 'core' }
const inFlight = new Map<string, Promise<GhResult<unknown>>>()

export function getRate(): RateInfo {
  return { ...rate }
}

function updateRate(headers: Headers, path: string) {
  const limit = Number(headers.get('x-ratelimit-limit'))
  const remaining = Number(headers.get('x-ratelimit-remaining'))
  const reset = Number(headers.get('x-ratelimit-reset'))
  if (!Number.isFinite(limit) || limit <= 0) return
  const resource: RateInfo['resource'] = path.startsWith('/search/') ? 'search' : 'core'
  rate = {
    limit,
    remaining: Number.isFinite(remaining) ? remaining : 0,
    reset: Number.isFinite(reset) ? reset : 0,
    resource,
  }
}

function authHeaders(accept: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': config.userAgent,
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (hasToken) headers.Authorization = `Bearer ${config.token}`
  return headers
}

async function request<T>(path: string, options: GhOptions): Promise<GhResult<T>> {
  const accept = options.accept ?? 'application/vnd.github+json'
  const key = `${options.text ? 'text' : 'json'}:${path}:${accept}`
  const entry = cache.get(key)

  if (entry && cache.isFresh(entry)) {
    return { data: entry.data as T, source: 'cache', fetchedAt: entry.fetchedAt, etag: entry.etag }
  }

  // Stale-while-revalidate: an expired entry is still far better than making
  // the reader wait for GitHub. Hand it over immediately and refresh in the
  // background, so the next visitor gets a fresh copy.
  if (entry && !options.revalidate) {
    runInBackground(ghJson<T>(path, { ...options, revalidate: true }).catch(() => undefined))
    return { data: entry.data as T, source: 'cache', fetchedAt: entry.fetchedAt, etag: entry.etag }
  }

  const headers = authHeaders(accept)
  if (entry?.etag) (headers as Record<string, string>)['If-None-Match'] = entry.etag

  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    if (entry) return { data: entry.data as T, source: 'stale', fetchedAt: entry.fetchedAt, etag: entry.etag }
    throw new GitHubError(502, `GitHub is unreachable: ${(error as Error).message}`)
  }

  updateRate(res.headers, path)

  if (res.status === 304 && entry) {
    cache.touch(key)
    return { data: entry.data as T, source: 'cache', fetchedAt: Date.now(), etag: entry.etag }
  }

  if (res.ok) {
    const data = (options.text ? await res.text() : await res.json()) as T
    const etag = res.headers.get('etag') ?? undefined
    cache.set(key, data, options.ttl, etag)
    return { data, source: 'live', fetchedAt: Date.now(), etag }
  }

  const resetHeader = Number(res.headers.get('x-ratelimit-reset'))
  const reset = Number.isFinite(resetHeader) && resetHeader > 0 ? resetHeader : undefined

  if (res.status === 403 || res.status === 429) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string }
      detail = body.message ?? ''
    } catch {
      // ignore
    }
    if (entry) {
      return { data: entry.data as T, source: 'stale', fetchedAt: entry.fetchedAt, etag: entry.etag }
    }
    const limited = res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail)
    throw new GitHubError(
      limited ? 429 : 403,
      limited
        ? 'GitHub API rate limit reached. Cached and curated results are shown instead.'
        : detail || 'GitHub rejected the request.',
      reset,
    )
  }

  if (res.status === 404) {
    throw new GitHubError(404, 'Repository or user not found.')
  }

  if (res.status === 401) {
    throw new GitHubError(401, 'The GitHub token is invalid. Check GITHUB_TOKEN in .env.')
  }

  throw new GitHubError(res.status, `GitHub responded with ${res.status}.`)
}

/**
 * Fetch JSON from the GitHub API with deduplication, disk caching,
 * ETag revalidation and stale-on-error behaviour.
 */
export function ghJson<T>(path: string, options: GhOptions): Promise<GhResult<T>> {
  const accept = options.accept ?? 'application/vnd.github+json'
  const key = `json:${path}:${accept}`
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<GhResult<T>>

  const promise = request<T>(path, options).finally(() => inFlight.delete(key))
  inFlight.set(key, promise as Promise<GhResult<unknown>>)
  return promise
}

/** Fetch plain text (README content) directly from raw.githubusercontent.com. */
export async function rawText(url: string, ttl = 6 * 60 * 60 * 1000): Promise<GhResult<string>> {
  const key = `raw:${url}`
  const entry = cache.get(key)
  if (entry && cache.isFresh(entry)) {
    return { data: entry.data as string, source: 'cache', fetchedAt: entry.fetchedAt }
  }

  // Raw content is served by a CDN and does not count against the API quota.
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'text/plain, text/markdown, */*' },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) {
      const text = await res.text()
      if (text.trim().length > 0) {
        cache.set(key, text, ttl)
        return { data: text, source: 'live', fetchedAt: Date.now() }
      }
    }
  } catch {
    // fall through to stale cache
  }

  if (entry) return { data: entry.data as string, source: 'stale', fetchedAt: entry.fetchedAt }
  throw new GitHubError(404, 'README not found.')
}

export function cacheStats() {
  return cache.stats()
}
