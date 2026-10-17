import type { Plugin } from 'vite'

/**
 * Mounts the Hono API inside Vite's dev server so a single process serves both
 * the frontend and the GitHub proxy during development.
 */
export function orbitApiPlugin(): Plugin {
  return {
    name: 'orbit-api',
    configureServer(server) {
      let listener: ((req: unknown, res: unknown) => void) | undefined
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/')) {
          next()
          return
        }
        const run = async () => {
          if (!listener) {
            const [{ getRequestListener }, { initNodeRuntime }, { app }] = await Promise.all([
              import('@hono/node-server'),
              import('./node-runtime.ts'),
              // Registers the bundled snapshot as the fallback feed source.
              import('./seed-node.ts').then(async () => import('./app.ts')),
            ])
            initNodeRuntime()
            listener = getRequestListener(app.fetch) as unknown as (req: unknown, res: unknown) => void
          }
          listener(req, res)
        }
        run().catch((error) => {
          console.error('[orbit api]', error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'API middleware failed' }))
          }
        })
      })
    },
  }
}
