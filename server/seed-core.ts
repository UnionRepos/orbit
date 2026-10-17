import type { RepoSummary } from '../shared/types.ts'
import { toRepoSummary, type GhRepo } from './map.ts'

/**
 * The curated fallback snapshot, loaded on demand.
 *
 * The snapshot is ~1.2 MB of JSON. It used to be a static import, which meant
 * every cold Worker isolate had to download, parse and map ~1500 repositories
 * before it could answer a single request — even though the snapshot is only
 * needed when GitHub itself cannot be reached. The data now lives behind a
 * provider that is called on first use:
 *
 *  - the Worker fetches `seed.json` from the static asset bundle (so the data
 *    is not part of the Worker script at all),
 *  - the Node server and tests hand over the bundled JSON directly.
 *
 * Both paths end up in the same memoised index, so the cost is paid at most
 * once per isolate and only when the fallback is actually needed.
 */

export interface SeedFile {
  generatedAt?: string
  source?: string
  items?: GhRepo[]
}

/** Raw snapshot: either the parsed file or the JSON text to parse. */
export type SeedPayload = SeedFile | string

export type SeedProvider = () => Promise<SeedPayload>

export interface SeedIndex {
  items: RepoSummary[]
  /** Lower-cased `owner/name` lookup. */
  byName: Map<string, RepoSummary>
  generatedAt: string | null
}

const EMPTY: SeedIndex = { items: [], byName: new Map(), generatedAt: null }

let provider: SeedProvider | null = null
let index: SeedIndex | null = null
let loading: Promise<SeedIndex> | null = null
/** After a failed load, wait before trying again instead of hammering assets. */
let retryAfter = 0

const RETRY_DELAY_MS = 30_000

function parse(payload: SeedPayload): SeedFile {
  return typeof payload === 'string' ? (JSON.parse(payload) as SeedFile) : payload
}

function build(payload: SeedPayload): SeedIndex {
  const parsed = parse(payload)
  const items = (parsed.items ?? []).map(toRepoSummary)
  const byName = new Map<string, RepoSummary>()
  for (const repo of items) byName.set(repo.fullName.toLowerCase(), repo)
  return { items, byName, generatedAt: parsed.generatedAt ?? null }
}

/** Registers where the snapshot comes from and drops any cached index. */
export function setSeedProvider(next: SeedProvider | null): void {
  provider = next
  index = null
  loading = null
  retryAfter = 0
}

/** Registers a provider only once, so per-request calls keep the cached index. */
export function ensureSeedProvider(next: SeedProvider): void {
  if (!provider) provider = next
}

/** True once the snapshot has been loaded (useful for diagnostics). */
export function isSeedLoaded(): boolean {
  return index !== null
}

/** Loads (and caches) the curated snapshot. Resolves empty when unconfigured. */
export function getSeed(): Promise<SeedIndex> {
  if (index) return Promise.resolve(index)
  if (loading) return loading
  if (!provider || Date.now() < retryAfter) return Promise.resolve(EMPTY)

  const source = provider
  loading = source()
    .then(build)
    .then((ready) => {
      index = ready
      return ready
    })
    .catch((error: unknown) => {
      // A broken snapshot must not take the API down, and a snapshot that is
      // temporarily unavailable must not be cached away forever either.
      console.error('[orbit] seed snapshot unavailable', error)
      retryAfter = Date.now() + RETRY_DELAY_MS
      return EMPTY
    })
    .finally(() => {
      loading = null
    })

  return loading
}

/** Small bounded memo used for the derived seed views (per channel/sort). */
const MEMO = new Map<string, unknown>()
const MEMO_LIMIT = 24

export function memo<T>(key: string, build: () => T): T {
  if (MEMO.has(key)) return MEMO.get(key) as T
  const value = build()
  if (MEMO.size >= MEMO_LIMIT) {
    const oldest = MEMO.keys().next().value
    if (oldest !== undefined) MEMO.delete(oldest)
  }
  MEMO.set(key, value)
  return value
}

/** Test-only: forget memoised views and the loaded snapshot. */
export function resetSeedMemo(): void {
  MEMO.clear()
  index = null
  loading = null
  retryAfter = 0
}
