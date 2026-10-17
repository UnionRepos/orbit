import type { ChannelId, FeedQuery } from '../../shared/types.ts'
import { CHANNELS } from '../../shared/channels.ts'
import type { MessageKey } from '../i18n/core.ts'
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

export const MIN_STAR_OPTIONS: { value: number; labelKey: MessageKey }[] = [
  { value: 0, labelKey: 'minStars.0' },
  { value: 100, labelKey: 'minStars.100' },
  { value: 1000, labelKey: 'minStars.1000' },
  { value: 10000, labelKey: 'minStars.10000' },
  { value: 50000, labelKey: 'minStars.50000' },
]

export const AGE_OPTIONS: { value: number; labelKey: MessageKey }[] = [
  { value: 0, labelKey: 'age.0' },
  { value: 7, labelKey: 'age.7' },
  { value: 30, labelKey: 'age.30' },
  { value: 90, labelKey: 'age.90' },
  { value: 365, labelKey: 'age.365' },
]

export const SORT_OPTIONS: { value: FeedQuery['sort']; labelKey: MessageKey }[] = [
  { value: 'best', labelKey: 'sort.best' },
  { value: 'stars', labelKey: 'sort.stars' },
  { value: 'updated', labelKey: 'sort.updated' },
  { value: 'forks', labelKey: 'sort.forks' },
]
