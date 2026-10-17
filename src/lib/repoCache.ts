import type { RepoSummary } from '../../shared/types.ts'

const cache = new Map<string, RepoSummary>()

export function cacheRepo(repo: RepoSummary) {
  cache.set(repo.fullName.toLowerCase(), repo)
}

export function cacheRepos(repos: RepoSummary[]) {
  for (const repo of repos) cacheRepo(repo)
}

export function cachedRepo(fullName: string): RepoSummary | undefined {
  return cache.get(fullName.toLowerCase())
}
