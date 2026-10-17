import type { RepoSummary } from '../shared/types.ts'
import type { GhRepo } from './map.ts'
import { toRepoSummary } from './map.ts'
// Imported as a module (not read from disk) so the same code runs on Node and
// on Cloudflare Workers, where there is no filesystem.
import snapshot from './seed.json' with { type: 'json' }

export interface SeedFile {
  generatedAt?: string
  source?: string
  items?: GhRepo[]
}

const parsed = snapshot as unknown as SeedFile

export const seedGeneratedAt: string | null = parsed.generatedAt ?? null

export const seedItems: RepoSummary[] = (parsed.items ?? []).map(toRepoSummary)
