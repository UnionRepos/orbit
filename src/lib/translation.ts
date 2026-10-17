import type { ReadmePassage, ReadmeTranslationEvent, TranslationLanguage } from '../../shared/translation.ts'
import { splitTranslationText } from '../../shared/translationChunks.ts'

export class TranslationRequestError extends Error {
  status: number
  retryAfter: number
  constructor(status: number, retryAfter = 0) {
    super('Translation request failed')
    this.status = status
    this.retryAfter = retryAfter
  }
}

// Completed passages survive navigation and stream reconnects in this tab.
const cache = new Map<string, { text: string; expires: number }>()
const key = (text: string, target: TranslationLanguage) => JSON.stringify([target, text])

export function cachedTranslation(text: string, target: TranslationLanguage): string | undefined {
  const entry = cache.get(key(text, target))
  return entry && entry.expires > Date.now() ? entry.text : undefined
}

export function decodeTranslationEvent(data: string): ReadmeTranslationEvent {
  const event = JSON.parse(data) as ReadmeTranslationEvent
  if (!event || typeof event !== 'object') throw new TranslationRequestError(502)
  if (event.type === 'done' || event.type === 'ping') return event
  if ((event.type === 'waiting' || event.type === 'unavailable') && Number.isFinite(event.retryAt) && event.retryAt >= 0) return event
  if ((event.type === 'start' || event.type === 'failed') && Number.isInteger(event.index)) return event
  if (event.type === 'result' && Number.isInteger(event.index) && typeof event.text === 'string' && event.text.trim()) return event
  throw new TranslationRequestError(502)
}

/** One incremental README request. The server owns chunking, pacing and retries. */
export async function requestReadmeTranslation(
  passages: ReadmePassage[], target: TranslationLanguage, signal: AbortSignal,
  emit: (event: ReadmeTranslationEvent) => void,
): Promise<void> {
  signal.throwIfAborted()
  const missing: ReadmePassage[] = []
  for (const passage of passages) {
    const hit = cachedTranslation(passage.text, target)
    if (hit !== undefined) emit({ type: 'result', index: passage.index, text: hit })
    else missing.push(passage)
  }
  if (!missing.length) { emit({ type: 'done' }); return }
  const requested = new Map(missing.map((passage) => [passage.index, passage.text]))
  const delivered = new Set<number>()
  const controller = new AbortController()
  const combined = AbortSignal.any([signal, controller.signal])
  const firstByteTimeout = setTimeout(() => controller.abort(new DOMException('Translation timed out', 'TimeoutError')), 45_000)
  let response: Response
  try {
    response = await fetch('/api/translate/readme', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ target, passages: missing }), signal: combined,
    })
  } finally { clearTimeout(firstByteTimeout) }
  if (!response.ok) {
    const timeout = setTimeout(() => controller.abort(), 5000)
    let body: { retryAfter?: number }
    try { body = await response.json().catch(() => ({})) as { retryAfter?: number } } finally { clearTimeout(timeout) }
    throw new TranslationRequestError(response.status, body.retryAfter ?? (Number(response.headers.get('retry-after')) || 0))
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new TranslationRequestError(502)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminal = false
  try {
    while (true) {
      // Heartbeats cover provider cooldowns; only an actually silent stream times out.
      const idleTimeout = setTimeout(() => controller.abort(new DOMException('Translation stream timed out', 'TimeoutError')), 45_000)
      let chunk: ReadableStreamReadResult<Uint8Array>
      try { chunk = await reader.read() } finally { clearTimeout(idleTimeout) }
      signal.throwIfAborted()
      buffer = (buffer + decoder.decode(chunk.value, { stream: !chunk.done })).replace(/\r\n/g, '\n')
      if (buffer.length > 2_000_000) throw new TranslationRequestError(502)
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        const event = decodeTranslationEvent(data)
        if ('index' in event && !requested.has(event.index)) throw new TranslationRequestError(502)
        if (event.type === 'result') {
          if (delivered.has(event.index)) continue
          delivered.add(event.index)
          cache.set(key(requested.get(event.index)!, target), { text: event.text, expires: Date.now() + 24 * 60 * 60 * 1000 })
          while (cache.size > 512) cache.delete(cache.keys().next().value!)
        }
        if (event.type === 'done') {
          const accounted = delivered.size
          // Missing results must be explicitly marked failed, never silently completed.
          if (accounted !== requested.size) throw new TranslationRequestError(502)
          terminal = true
        }
        if (event.type === 'failed') delivered.add(event.index)
        if (event.type === 'unavailable') terminal = true
        if (event.type !== 'ping') emit(event)
      }
      if (chunk.done) break
    }
    if (!terminal) throw new TranslationRequestError(502)
  } finally {
    controller.abort()
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function splitPassage(text: string, limit = 1200): string[] {
  return splitTranslationText(text.trim(), limit)
}
