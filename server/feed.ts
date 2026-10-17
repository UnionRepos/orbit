import type { ChannelId, FeedQuery, RepoSummary } from '../shared/types.ts'
import { getSeed, memo } from './seed-core.ts'

export async function seedRepo(fullName: string): Promise<RepoSummary | undefined> {
  const { byName } = await getSeed()
  return byName.get(fullName.toLowerCase())
}

export async function seedCount(): Promise<number> {
  const { items } = await getSeed()
  return items.length
}

/** Generation timestamp of the curated snapshot, once it is loaded. */
export async function seedGeneratedAt(): Promise<string | null> {
  const { generatedAt } = await getSeed()
  return generatedAt
}

const DAY = 86_400_000

function ageDays(iso: string): number {
  return (Date.now() - Date.parse(iso)) / DAY
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString().slice(0, 10)
}

interface ChannelSpec {
  createdWithin?: number
  pushedWithin?: number
  minStars: number
  maxStars?: number
  goodFirstIssues?: number
  sort: 'stars' | 'updated' | 'forks'
}

export const CHANNEL_SPECS: Record<ChannelId, ChannelSpec> = {
  trending: { createdWithin: 90, minStars: 200, sort: 'stars' },
  rising: { createdWithin: 14, minStars: 25, sort: 'stars' },
  fresh: { pushedWithin: 7, minStars: 3_000, sort: 'updated' },
  gems: { pushedWithin: 60, minStars: 100, maxStars: 2_500, sort: 'updated' },
  first: { pushedWithin: 45, minStars: 100, goodFirstIssues: 3, sort: 'updated' },
  stars: { minStars: 40_000, sort: 'stars' },
}

export function buildSearchQuery(params: FeedQuery): string {
  const spec = CHANNEL_SPECS[params.channel]
  const parts: string[] = []

  if (params.q) {
    parts.push(params.q)
  } else {
    if (spec.createdWithin) parts.push(`created:>=${isoDaysAgo(spec.createdWithin)}`)
    if (spec.pushedWithin) parts.push(`pushed:>=${isoDaysAgo(spec.pushedWithin)}`)
    if (spec.goodFirstIssues) parts.push(`good-first-issues:>=${spec.goodFirstIssues}`)
    parts.push('archived:false')
  }

  const minStars = Math.max(spec.minStars, params.minStars)
  if (minStars > 0) parts.push(`stars:>=${minStars}`)
  if (spec.maxStars && !params.q && minStars <= spec.maxStars) parts.push(`stars:<=${spec.maxStars}`)

  if (params.language) parts.push(`language:"${params.language}"`)
  if (params.topic) parts.push(`topic:${params.topic}`)

  if (params.createdWithin > 0) {
    // The channel's own age window can be narrower than the user's filter.
    const channelAge = spec.createdWithin && !params.q ? spec.createdWithin : params.createdWithin
    const days = Math.min(channelAge, params.createdWithin)
    const qualifier = `created:>=${isoDaysAgo(days)}`
    const existing = parts.findIndex((part) => part.startsWith('created:>='))
    if (existing >= 0) parts[existing] = qualifier
    else parts.push(qualifier)
  }

  return parts.join(' ')
}

export function querySort(params: FeedQuery): { sort?: string; order: 'desc' | 'asc' } {
  const spec = CHANNEL_SPECS[params.channel]
  if (params.sort === 'best') {
    if (params.q) return { order: 'desc' }
    return { sort: spec.sort, order: 'desc' }
  }
  return { sort: params.sort, order: 'desc' }
}

/**
 * Offline/rate-limited fallback: filter the curated snapshot.
 *
 * The channel pool (channel constraints applied) is memoised per channel and
 * day, because it is the expensive part: it walks the whole snapshot and
 * compares ISO timestamps for every repository. The user's own filters are
 * then applied to that smaller pool.
 */
export async function seedFeed(params: FeedQuery): Promise<RepoSummary[]> {
  const spec = CHANNEL_SPECS[params.channel]
  const { items: all } = await getSeed()
  const q = params.q.toLowerCase()

  const pool = memo(`pool:${params.channel}:${Math.floor(Date.now() / DAY)}`, () => {
    const channelFiltered = all.filter((repo) => {
      if (spec.createdWithin && ageDays(repo.createdAt) > spec.createdWithin) return false
      if (spec.pushedWithin && ageDays(repo.pushedAt) > spec.pushedWithin) return false
      if (repo.stars < spec.minStars) return false
      if (spec.maxStars && repo.stars > spec.maxStars) return false
      return true
    })
    return channelFiltered.length >= 4 ? channelFiltered : all
  })

  const items = pool.filter((repo) => {
    if (q) {
      const haystack = `${repo.fullName} ${repo.description ?? ''} ${repo.topics.join(' ')}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (params.language && repo.language !== params.language) return false
    if (params.topic && !repo.topics.includes(params.topic)) return false
    if (params.minStars && repo.stars < params.minStars) return false
    if (params.createdWithin > 0 && ageDays(repo.createdAt) > params.createdWithin) return false
    return true
  })

  const sort = params.sort === 'best' ? spec.sort : params.sort
  return [...items].sort((a, b) => {
    if (sort === 'stars') return b.stars - a.stars
    if (sort === 'forks') return b.forks - a.forks
    if (sort === 'updated') return Date.parse(b.pushedAt) - Date.parse(a.pushedAt)
    return b.heat - a.heat
  })
}
