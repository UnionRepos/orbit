import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { initNodeRuntime } from './node-runtime.ts'

initNodeRuntime()

const [{ app }, { config }, { seedCount }] = await Promise.all([
  import('./app.ts'),
  import('./config.ts'),
  import('./feed.ts'),
])

const dist = path.resolve(process.cwd(), 'dist')

if (fs.existsSync(dist)) {
  app.use('*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
} else {
  app.get('/', (c) =>
    c.text('Orbit API is running. Run `npm run dev` for the app or `npm run build` first.'),
  )
}

const port = Number(process.env.PORT) || 8787

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`\n  ✦ Orbit is live at http://localhost:${info.port}`)
  console.log(`    token: ${config.token ? 'configured' : 'not set (60 req/h core, 10/min search)'}`)
  console.log(`    curated fallback repos: ${seedCount()}\n`)
})
