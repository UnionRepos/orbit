import path from 'node:path'
import { FileCacheStorage } from './cache-file.ts'
import { configureEnvironment } from './config.ts'
import { cache } from './github.ts'

let initialised = false

/**
 * Node-only bootstrap: loads `.env`, reads the GitHub token from `process.env`
 * and attaches the disk cache. The Cloudflare Worker never calls this.
 */
export function initNodeRuntime() {
  if (initialised) return
  initialised = true

  const root = process.cwd()

  try {
    process.loadEnvFile(path.join(root, '.env'))
  } catch {
    // .env is optional
  }

  configureEnvironment(process.env)

  const cacheFile = process.env.ORBIT_CACHE_FILE || path.join(root, '.orbit-cache', 'cache.json')
  cache.attachStorage(new FileCacheStorage(cacheFile))
}
