export type ChannelId = 'trending' | 'rising' | 'fresh' | 'gems' | 'first' | 'stars'

export interface RepoOwner {
  login: string
  avatarUrl: string
  type: string
  htmlUrl: string
}

export interface RepoSummary {
  id: number
  name: string
  fullName: string
  owner: RepoOwner
  description: string | null
  htmlUrl: string
  homepage: string | null
  stars: number
  forks: number
  openIssues: number
  watchers: number
  language: string | null
  topics: string[]
  license: string | null
  createdAt: string
  updatedAt: string
  pushedAt: string
  archived: boolean
  fork: boolean
  defaultBranch: string
  size: number
  starsPerDay: number
  heat: number
}

export interface LanguageStat {
  name: string
  bytes: number
  percent: number
  color: string
}

export interface Contributor {
  login: string
  avatarUrl: string
  htmlUrl: string
  contributions: number
}

export interface Release {
  tagName: string
  name: string
  publishedAt: string | null
  htmlUrl: string
  prerelease: boolean
}

export interface RepoDetail {
  repo: RepoSummary
  languages: LanguageStat[]
  contributors: Contributor[]
  releases: Release[]
  partial: boolean
  source: DataSource
  rate: RateInfo
}

export type DataSource = 'live' | 'cache' | 'stale' | 'seed'

export interface RateInfo {
  limit: number
  remaining: number
  reset: number
  resource: 'core' | 'search'
}

export interface FeedResponse {
  items: RepoSummary[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  query: string
  source: DataSource
  fetchedAt: number
  rate: RateInfo
  channel: ChannelId
  hasToken: boolean
  note?: string
}

export interface ReadmeResponse {
  markdown: string
  path: string
  htmlUrl: string | null
  source: DataSource
}

export interface UserProfile {
  login: string
  name: string | null
  avatarUrl: string
  htmlUrl: string
  bio: string | null
  company: string | null
  blog: string | null
  location: string | null
  twitter: string | null
  followers: number
  following: number
  publicRepos: number
  createdAt: string
  type: string
}

export interface UserResponse {
  user: UserProfile
  repos: RepoSummary[]
  rate: RateInfo
  source: DataSource
}

export interface SearchResponse {
  repos: RepoSummary[]
  user: UserProfile | null
  rate: RateInfo
  source: DataSource
}

export interface HealthResponse {
  ok: boolean
  hasToken: boolean
  rate: RateInfo
  cache: { entries: number; bytes: number }
  uptime: number
  version: string
}

export interface FeedQuery {
  channel: ChannelId
  q: string
  language: string
  topic: string
  minStars: number
  createdWithin: number
  sort: 'best' | 'stars' | 'updated' | 'forks'
  page: number
  perPage: number
}
