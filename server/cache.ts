export interface CacheEntry {
  data: unknown
  fetchedAt: number
  ttl: number
  etag?: string
}

/**
 * Optional persistence backend. The Node server attaches a file-backed one;
 * the Cloudflare Worker runs without a backend and simply keeps a per-isolate
 * in-memory cache (plus `Cache-Control` headers for the edge cache).
 */
export interface CacheStorage {
  load(): Record<string, CacheEntry> | null
  save(entries: Record<string, CacheEntry>): void
  bytes(): number
}

const MAX_ENTRIES = 500

/**
 * Tiny TTL cache that keeps GitHub responses warm and preserves ETags so
 * conditional requests can be answered with a free 304.
 */
export class JsonCache {
  private entries = new Map<string, CacheEntry>()
  private storage: CacheStorage | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private hitCount = 0
  private missCount = 0

  attachStorage(storage: CacheStorage) {
    this.storage = storage
    const stored = storage.load()
    if (!stored) return
    for (const [key, entry] of Object.entries(stored)) {
      if (entry && typeof entry.fetchedAt === 'number' && 'data' in entry) {
        this.entries.set(key, entry)
      }
    }
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (entry) this.hitCount++
    else this.missCount++
    return entry
  }

  isFresh(entry: CacheEntry): boolean {
    return Date.now() - entry.fetchedAt < entry.ttl
  }

  set(key: string, data: unknown, ttl: number, etag?: string) {
    this.entries.set(key, { data, fetchedAt: Date.now(), ttl, etag })
    if (this.entries.size > MAX_ENTRIES) {
      const sorted = [...this.entries.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
      for (const [oldKey] of sorted.slice(0, this.entries.size - MAX_ENTRIES)) {
        this.entries.delete(oldKey)
      }
    }
    this.scheduleFlush()
  }

  touch(key: string, ttl?: number) {
    const entry = this.entries.get(key)
    if (!entry) return
    entry.fetchedAt = Date.now()
    if (ttl) entry.ttl = ttl
    this.scheduleFlush()
  }

  private scheduleFlush() {
    if (this.timer || !this.storage) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, 1200)
    this.timer.unref?.()
  }

  flush() {
    if (!this.storage) return
    const entries: Record<string, CacheEntry> = {}
    for (const [key, entry] of this.entries) entries[key] = entry
    this.storage.save(entries)
  }

  stats() {
    let bytes = 0
    try {
      bytes = this.storage?.bytes() ?? 0
    } catch {
      // ignore storage issues
    }
    return { entries: this.entries.size, bytes, hits: this.hitCount, misses: this.missCount }
  }
}
