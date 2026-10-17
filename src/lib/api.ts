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

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
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

export function getFeed(params: FeedQuery, page = 1, signal?: AbortSignal): Promise<FeedResponse> {
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
  return request<FeedResponse>(`/api/feed?${search.toString()}`, signal)
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
