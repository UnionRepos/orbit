import { useCallback, useEffect, useRef, useState } from 'react'
import type { FeedQuery, FeedResponse, RepoSummary } from '../../shared/types.ts'
import { getFeed, type ApiError } from '../lib/api.ts'
import { cacheRepos } from '../lib/repoCache.ts'

export interface FeedState {
  items: RepoSummary[]
  meta: FeedResponse | null
  status: 'loading' | 'ready' | 'error'
  error: ApiError | null
  loadingMore: boolean
  refreshing: boolean
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}

export function useFeed(params: FeedQuery): FeedState {
  const key = JSON.stringify(params)
  const [items, setItems] = useState<RepoSummary[]>([])
  const [meta, setMeta] = useState<FeedResponse | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<ApiError | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const requestId = useRef(0)
  const paramsRef = useRef(params)
  paramsRef.current = params

  useEffect(() => {
    const id = ++requestId.current
    const controller = new AbortController()
    setStatus('loading')
    setError(null)
    setItems([])
    setMeta(null)

    getFeed(params, 1, controller.signal)
      .then((result) => {
        if (id !== requestId.current) return
        cacheRepos(result.items)
        setItems(result.items)
        setMeta(result)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || id !== requestId.current) return
        setError(err as ApiError)
        setStatus('error')
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const loadMore = useCallback(async () => {
    if (!meta?.hasMore || loadingMore || status !== 'ready') return
    const id = requestId.current
    setLoadingMore(true)
    try {
      const next = await getFeed(paramsRef.current, meta.page + 1)
      if (id !== requestId.current) return
      cacheRepos(next.items)
      setItems((current) => {
        const seen = new Set(current.map((repo) => repo.fullName))
        return [...current, ...next.items.filter((repo) => !seen.has(repo.fullName))]
      })
      setMeta(next)
    } catch (err) {
      if (id === requestId.current) setError(err as ApiError)
    } finally {
      if (id === requestId.current) setLoadingMore(false)
    }
  }, [meta, loadingMore, status])

  const refresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    const id = ++requestId.current
    try {
      const result = await getFeed(paramsRef.current, 1)
      if (id !== requestId.current) return
      cacheRepos(result.items)
      setItems(result.items)
      setMeta(result)
      setStatus('ready')
      setError(null)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setRefreshing(false)
    }
  }, [refreshing])

  return {
    items,
    meta,
    status,
    error,
    loadingMore,
    refreshing,
    hasMore: Boolean(meta?.hasMore),
    loadMore,
    refresh,
  }
}
