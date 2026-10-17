import type { RepoSummary } from '../shared/types.ts'

const memo = new Map<string, { repo: RepoSummary; at: number }>()
const LIMIT = 400

export function rememberRepo(repo: RepoSummary) {
  memo.delete(repo.fullName.toLowerCase())
  memo.set(repo.fullName.toLowerCase(), { repo, at: Date.now() })
  if (memo.size > LIMIT) {
    const oldest = memo.keys().next().value
    if (oldest) memo.delete(oldest)
  }
}

export function recallRepo(fullName: string): RepoSummary | undefined {
  return memo.get(fullName.toLowerCase())?.repo
}
