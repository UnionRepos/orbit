import type {
  Contributor,
  LanguageStat,
  Release,
  RepoSummary,
  UserProfile,
} from '../shared/types.ts'
import { languageColor } from '../shared/languages.ts'

export interface GhRepo {
  id: number
  name: string
  full_name: string
  owner: {
    login: string
    avatar_url: string
    type?: string
    html_url: string
  }
  description: string | null
  html_url: string
  homepage: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  watchers_count: number
  language: string | null
  topics?: string[]
  license: { spdx_id?: string | null; name?: string | null } | null
  created_at: string
  updated_at: string
  pushed_at: string | null
  archived: boolean
  fork: boolean
  default_branch: string
  size: number
}

export interface GhUser {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
  bio: string | null
  company: string | null
  blog: string | null
  location: string | null
  twitter_username: string | null
  followers: number
  following: number
  public_repos: number
  created_at: string
  type: string
}

export interface GhContributor {
  login: string
  avatar_url: string
  html_url: string
  contributions: number
}

export interface GhRelease {
  tag_name: string
  name: string | null
  published_at: string | null
  html_url: string
  prerelease: boolean
}

const DAY = 86_400_000

export function toRepoSummary(raw: GhRepo): RepoSummary {
  const createdDays = Math.max(1, (Date.now() - Date.parse(raw.created_at)) / DAY)
  const starsPerDay = raw.stargazers_count / createdDays
  const pushedDays = Math.max(0, (Date.now() - Date.parse(raw.pushed_at ?? raw.updated_at)) / DAY)

  // A transparent 0-100 "momentum" score blending reach, freshness and velocity.
  const reach = Math.min(1, Math.log10(raw.stargazers_count + 1) / 5.5)
  const recency = Math.exp(-pushedDays / 21)
  const velocity = Math.min(1, starsPerDay / 40)
  const forks = Math.min(0.5, raw.forks_count / Math.max(1, raw.stargazers_count))
  const heat = Math.round(
    100 * Math.min(1, reach * 0.5 + recency * 0.3 + velocity * 0.15 + forks * 0.1),
  )

  const starsRounded = starsPerDay >= 10 ? Math.round(starsPerDay) : Math.round(starsPerDay * 10) / 10

  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    owner: {
      login: raw.owner.login,
      avatarUrl: raw.owner.avatar_url,
      type: raw.owner.type ?? 'User',
      htmlUrl: raw.owner.html_url,
    },
    description: raw.description,
    htmlUrl: raw.html_url,
    homepage: raw.homepage || null,
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    openIssues: raw.open_issues_count,
    watchers: raw.watchers_count,
    language: raw.language,
    topics: (raw.topics ?? []).slice(0, 8),
    license: raw.license?.spdx_id && raw.license.spdx_id !== 'NOASSERTION'
      ? raw.license.spdx_id
      : raw.license?.name ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    pushedAt: raw.pushed_at ?? raw.updated_at,
    archived: raw.archived,
    fork: raw.fork,
    defaultBranch: raw.default_branch,
    size: raw.size,
    starsPerDay: starsRounded,
    heat,
  }
}

export function toUserProfile(raw: GhUser): UserProfile {
  return {
    login: raw.login,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    htmlUrl: raw.html_url,
    bio: raw.bio,
    company: raw.company,
    blog: raw.blog,
    location: raw.location,
    twitter: raw.twitter_username,
    followers: raw.followers,
    following: raw.following,
    publicRepos: raw.public_repos,
    createdAt: raw.created_at,
    type: raw.type,
  }
}

export function toLanguages(raw: Record<string, number>): LanguageStat[] {
  const total = Object.values(raw).reduce((sum, bytes) => sum + bytes, 0)
  if (!total) return []
  return Object.entries(raw)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({
      name,
      bytes,
      percent: Math.round((bytes / total) * 1000) / 10,
      color: languageColor(name),
    }))
}

export function toContributors(raw: GhContributor[]): Contributor[] {
  return raw
    .filter((c) => c && c.login)
    .slice(0, 14)
    .map((c) => ({
      login: c.login,
      avatarUrl: c.avatar_url,
      htmlUrl: c.html_url,
      contributions: c.contributions,
    }))
}

export function toReleases(raw: GhRelease[]): Release[] {
  return raw.slice(0, 6).map((r) => ({
    tagName: r.tag_name,
    name: r.name || r.tag_name,
    publishedAt: r.published_at,
    htmlUrl: r.html_url,
    prerelease: Boolean(r.prerelease),
  }))
}
