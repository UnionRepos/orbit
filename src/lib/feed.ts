import type { ChannelId, FeedQuery } from '../../shared/types.ts'
import { CHANNELS } from '../../shared/channels.ts'
import type { Route } from './router.ts'

const CHANNEL_IDS = new Set(CHANNELS.map((channel) => channel.id))
const SORTS = new Set<FeedQuery['sort']>(['best', 'stars', 'updated', 'forks'])

export function feedParamsFromRoute(route: Route): FeedQuery {
  const qp = route.query
  const channelParam = qp.get('channel') ?? 'trending'
  const sortParam = qp.get('sort') ?? 'best'
  const minStars = Number(qp.get('minStars')) || 0
  const createdWithin = Number(qp.get('createdWithin')) || 0

  return {
    channel: (CHANNEL_IDS.has(channelParam as ChannelId) ? channelParam : 'trending') as ChannelId,
    q: (qp.get('q') ?? '').slice(0, 160),
    language: qp.get('language') ?? '',
    topic: qp.get('topic') ?? '',
    minStars: minStars > 0 ? minStars : 0,
    createdWithin: createdWithin > 0 ? createdWithin : 0,
    sort: (SORTS.has(sortParam as FeedQuery['sort']) ? sortParam : 'best') as FeedQuery['sort'],
    page: 1,
    perPage: 12,
  }
}

export function patchFeedQuery(
  query: URLSearchParams,
  patch: Record<string, string | number | null | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(query)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '' || value === 0) next.delete(key)
    else next.set(key, String(value))
  }
  return next
}

export const MIN_STAR_OPTIONS = [
  { value: 0, label: 'Any' },
  { value: 100, label: '100+' },
  { value: 1000, label: '1k+' },
  { value: 10000, label: '10k+' },
  { value: 50000, label: '50k+' },
]

export const AGE_OPTIONS = [
  { value: 0, label: 'Any time' },
  { value: 7, label: 'Past week' },
  { value: 30, label: 'Past month' },
  { value: 90, label: 'Past 3 months' },
  { value: 365, label: 'Past year' },
]

export const SORT_OPTIONS: { value: FeedQuery['sort']; label: string }[] = [
  { value: 'best', label: 'Best match' },
  { value: 'stars', label: 'Most stars' },
  { value: 'updated', label: 'Recently active' },
  { value: 'forks', label: 'Most forked' },
]
