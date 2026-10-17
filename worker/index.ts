import { app } from '../server/app.ts'
import { configureEnvironment } from '../server/config.ts'

/**
 * Cloudflare Workers entry point. `/api/*` is routed here by
 * `assets.run_worker_first` in wrangler.jsonc; every other path is served
 * straight from the static asset bundle.
 */
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  GITHUB_TOKEN?: string
  GH_TOKEN?: string
  [key: string]: unknown
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    configureEnvironment(env)

    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, env)
    }
    return env.ASSETS.fetch(request)
  },
}
