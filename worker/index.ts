import { app } from '../server/app.ts'
import { setBackgroundScheduler } from '../server/background.ts'
import { configureEnvironment } from '../server/config.ts'
import { ensureSeedProvider, type SeedPayload } from '../server/seed-core.ts'

/**
 * Cloudflare Workers entry point. `/api/*` is routed here by
 * `assets.run_worker_first` in wrangler.jsonc; every other path is served
 * straight from the static asset bundle.
 *
 * The curated snapshot is fetched from the asset bundle instead of being
 * bundled into the Worker script: it is only downloaded when GitHub actually
 * fails, which keeps the script (and therefore isolate startup) small.
 */
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  GITHUB_TOKEN?: string
  GH_TOKEN?: string
  [key: string]: unknown
}

interface ExecutionContext {
  waitUntil(task: Promise<unknown>): void
}

const SEED_PATH = 'https://orbit.internal/seed.json'

async function loadSeed(env: Env): Promise<SeedPayload> {
  const response = await env.ASSETS.fetch(new Request(SEED_PATH))
  if (!response.ok) throw new Error(`seed snapshot unavailable (${response.status})`)
  return response.text()
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    configureEnvironment(env)
    ensureSeedProvider(() => loadSeed(env))
    if (ctx) setBackgroundScheduler((task) => ctx.waitUntil(task))

    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, env)
    }
    return env.ASSETS.fetch(request)
  },
}
