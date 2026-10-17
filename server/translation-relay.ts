import { serve } from '@hono/node-server'
import { createTranslationRelay } from './translationRelayApp.ts'

const app = createTranslationRelay(process.env.TRANSLATION_RELAY_TOKEN ?? '')
const port = Number(process.env.PORT) || 8791
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, () => {
  console.log(`Orbit translation relay listening on port ${port}`)
})
