import { Hono } from 'hono'
import { createTranslationRoutes, TranslationService } from './translation.ts'

/** A private, fixed-purpose relay. It cannot fetch arbitrary caller-provided URLs. */
export function createTranslationRelay(token: string, service = new TranslationService()) {
  if (token.length < 32 || /\s/.test(token)) throw new Error('TRANSLATION_RELAY_TOKEN must contain at least 32 characters without whitespace')
  const app = new Hono()
  app.use('*', async (c, next) => {
    // Compare digests, avoiding an early-exit comparison of secret values.
    const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
    const [expected, actual] = await Promise.all([digest(`Bearer ${token}`), digest(c.req.header('authorization') ?? '')])
    let difference = 0
    for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ actual[index]
    if (difference !== 0) return c.json({ error: 'Unauthorized' }, 401)
    return next()
  })
  app.get('/health', (c) => c.json({ ok: true }))
  app.route('/api/translate', createTranslationRoutes(service))
  return app
}
