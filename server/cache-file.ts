import fs from 'node:fs'
import path from 'node:path'
import type { CacheEntry, CacheStorage } from './cache.ts'

const VERSION = 1

interface StoredFile {
  version: number
  entries: Record<string, CacheEntry>
}

/** Disk-backed cache storage, used by the Node server only. */
export class FileCacheStorage implements CacheStorage {
  private file: string

  constructor(file: string) {
    this.file = file
  }

  load(): Record<string, CacheEntry> | null {
    try {
      if (!fs.existsSync(this.file)) return null
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoredFile
      if (parsed.version !== VERSION || !parsed.entries) return null
      return parsed.entries
    } catch {
      // A corrupt cache should never take the API down.
      return null
    }
  }

  save(entries: Record<string, CacheEntry>) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const payload: StoredFile = { version: VERSION, entries }
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(payload))
      fs.renameSync(tmp, this.file)
    } catch {
      // Ignore disk issues (read-only filesystems, etc.)
    }
  }

  bytes(): number {
    try {
      if (!fs.existsSync(this.file)) return 0
      return fs.statSync(this.file).size
    } catch {
      return 0
    }
  }
}
