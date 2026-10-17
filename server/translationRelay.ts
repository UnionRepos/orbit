export interface TranslationRelayEnvironment {
  TRANSLATION_RELAY_URL?: string
  TRANSLATION_RELAY_TOKEN?: string
}

/** Forward only Orbit's translation routes to an administrator-owned Node relay. */
export async function forwardTranslation(
  request: Request, env: TranslationRelayEnvironment, fetcher: typeof fetch = fetch,
): Promise<Response | null> {
  if (!env.TRANSLATION_RELAY_URL) return null
  const path = new URL(request.url).pathname
  if (request.method !== 'POST' || !['/api/translate', '/api/translate/readme'].includes(path)) return null
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Use the same-origin translation endpoint.' }, { status: 403 })
  let endpoint: URL
  try {
    endpoint = new URL(env.TRANSLATION_RELAY_URL)
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.origin === new URL(request.url).origin || !env.TRANSLATION_RELAY_TOKEN || env.TRANSLATION_RELAY_TOKEN.length < 32) throw new Error('Invalid relay configuration')
  } catch {
    console.error('[translation] Configure an HTTPS relay URL and a relay token')
    return Response.json({ error: 'Translation connection is unavailable.', code: 'translation-connection' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  endpoint.pathname = path
  endpoint.search = ''
  endpoint.hash = ''
  const headers = new Headers({
    'Content-Type': 'application/json', Accept: request.headers.get('accept') ?? 'application/json',
    Authorization: `Bearer ${env.TRANSLATION_RELAY_TOKEN}`,
  })
  try {
    const response = await fetcher(endpoint, { method: 'POST', headers, body: request.body, signal: request.signal, redirect: 'manual', duplex: 'half' } as RequestInit)
    // Credentials and relay-specific headers never reach the browser.
    const outgoing = new Headers({ 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    for (const key of ['content-type', 'retry-after']) {
      const value = response.headers.get(key)
      if (value) outgoing.set(key, value)
    }
    if ((response.status >= 300 && response.status < 400) || [401, 403, 404, 412].includes(response.status)) {
      console.error('[translation] Relay connection rejected', { status: response.status })
      await response.body?.cancel()
      return Response.json({ error: 'Translation connection is unavailable.', code: 'translation-connection' }, { status: 503, headers: outgoing })
    }
    return new Response(response.body, { status: response.status, headers: outgoing })
  } catch (error) {
    if (request.signal.aborted) throw error
    console.warn('[translation] Relay connection failed', error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError' })
    return Response.json({ error: 'Translation service is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
