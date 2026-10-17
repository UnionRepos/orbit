import type {
  FeedQuery,
  FeedResponse,
  HealthResponse,
  ReadmeResponse,
  RepoDetail,
  SearchResponse,
  UserResponse,
} from '../../shared/types.ts'

export class ApiError extends Error {
  status: number
  reset?: number
  retryAfter?: number

  constructor(message: string, status: number, reset?: number, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.reset = reset
    this.retryAfter = retryAfter
  }
}

/**
 * Requests started before React mounts (and on hover) live here so the hooks
 * can pick them up instead of waiting for a second round trip.
 */
const PREFETCHED = new Map<string, Promise<unknown>>()
/** One network round trip per URL, shared by every consumer. */
const INFLIGHT = new Map<string, Promise<unknown>>()

function abortError(): Error {
  if (typeof DOMException === 'function') return new DOMException('Aborted', 'AbortError')
  return Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

/** Awaits a shared promise while still honouring this caller's abort signal. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

async function send<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    let reset: number | undefined
    let retryAfter: number | undefined
    try {
      const body = (await res.json()) as {
        error?: string
        reset?: number
        retryAfter?: number
      }
      message = body.error || message
      reset = body.reset
      retryAfter = body.retryAfter
    } catch {
      // non-JSON error
    }
    throw new ApiError(message, res.status, reset, retryAfter)
  }

  return (await res.json()) as T
}

function shared<T>(path: string): Promise<T> {
  const existing = INFLIGHT.get(path) as Promise<T> | undefined
  if (existing) return existing
  const promise = send<T>(path).finally(() => INFLIGHT.delete(path))
  INFLIGHT.set(path, promise)
  return promise
}

function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const prefetched = PREFETCHED.get(path)
  if (prefetched) {
    PREFETCHED.delete(path)
    return abortable(prefetched as Promise<T>, signal)
  }
  return abortable(shared<T>(path), signal)
}

/** Starts a request early; the next `request()` for the same URL reuses it. */
function prefetch<T>(path: string): void {
  if (PREFETCHED.has(path)) return
  const promise = request<T>(path)
  PREFETCHED.set(path, promise)
  promise.catch(() => PREFETCHED.delete(path))
}

export function feedPath(params: FeedQuery, page = 1): string {
  const search = new URLSearchParams({
    channel: params.channel,
    page: String(page),
    perPage: String(params.perPage),
  })
  if (params.q) search.set('q', params.q)
  if (params.language) search.set('language', params.language)
  if (params.topic) search.set('topic', params.topic)
  if (params.minStars) search.set('minStars', String(params.minStars))
  if (params.createdWithin) search.set('createdWithin', String(params.createdWithin))
  if (params.sort && params.sort !== 'best') search.set('sort', params.sort)
  return `/api/feed?${search.toString()}`
}

export function getFeed(params: FeedQuery, page = 1, signal?: AbortSignal): Promise<FeedResponse> {
  return request<FeedResponse>(feedPath(params, page), signal)
}

/**
 * Warms the first page before the component tree mounts, removing the
 * render → effect → fetch waterfall from the critical path.
 */
export function prefetchFeed(params: FeedQuery): void {
  prefetch<FeedResponse>(feedPath(params, 1))
}

export function getRepo(owner: string, repo: string, signal?: AbortSignal): Promise<RepoDetail> {
  return request<RepoDetail>(
    `/api/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    signal,
  )
}

export function getReadme(owner: string, repo: string, signal?: AbortSignal): Promise<ReadmeResponse> {
  return request<ReadmeResponse>(
    `/api/readme/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    signal,
  )
}

export function getUser(login: string, signal?: AbortSignal): Promise<UserResponse> {
  return request<UserResponse>(`/api/user/${encodeURIComponent(login)}`, signal)
}

export function searchAll(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  return request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, signal)
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health', signal)
}
