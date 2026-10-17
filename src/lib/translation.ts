import { splitTranslationText } from '../../shared/translationChunks.ts'
import {
  TRANSLATION_MAX_BATCH,
  TRANSLATION_MAX_TOTAL,
  type TranslationLanguage,
  type TranslationResponse,
} from '../../shared/translation.ts'

export class TranslationRequestError extends Error {
  status: number
  retryAfter: number
  constructor(status: number, retryAfter = 0) {
    super('Translation request failed')
    this.status = status
    this.retryAfter = retryAfter
  }
}

interface Job {
  text: string
  target: TranslationLanguage
  signal: AbortSignal
  resolve: (text: string) => void
  reject: (reason: unknown) => void
}

const cache = new Map<string, { text: string; expires: number }>()
let queue: Job[] = []
let active = 0
let timer: ReturnType<typeof setTimeout> | undefined
const cacheKey = (text: string, target: TranslationLanguage) => JSON.stringify([target, text])

/** Coalesce visible passages across components; at most two requests at once. */
export function translatePassage(text: string, target: TranslationLanguage, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.reject(signal.reason)
  if (!text.trim()) return Promise.resolve(text)
  const key = cacheKey(text, target)
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.text)
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    queue.push({
      text, target, signal,
      resolve: (value) => { signal.removeEventListener('abort', onAbort); resolve(value) },
      reject: (reason) => { signal.removeEventListener('abort', onAbort); reject(reason) },
    })
    schedule()
  })
}

function schedule() {
  if (!timer && queue.length && active < 2) timer = setTimeout(() => { timer = undefined; drain() }, 35)
}

function drain() {
  queue = queue.filter((job) => !job.signal.aborted)
  while (active < 2 && queue.length) {
    const first = queue.shift()!
    const batch = [first]
    let length = first.text.length
    for (let index = 0; index < queue.length && batch.length < TRANSLATION_MAX_BATCH;) {
      const job = queue[index]
      if (job.target === first.target && length + job.text.length <= TRANSLATION_MAX_TOTAL) {
        batch.push(...queue.splice(index, 1))
        length += job.text.length
      } else index++
    }
    active++
    void sendBatch(batch).finally(() => { active--; schedule() })
  }
}

async function sendBatch(jobs: Job[]) {
  const controller = new AbortController()
  const cancelIfUnused = () => { if (jobs.every((job) => job.signal.aborted)) controller.abort() }
  jobs.forEach((job) => job.signal.addEventListener('abort', cancelIfUnused))
  const texts = [...new Set(jobs.map((job) => job.text))]
  try {
    cancelIfUnused()
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ target: jobs[0].target, texts }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(50_000)]),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { retryAfter?: number }
      throw new TranslationRequestError(response.status, body.retryAfter ?? 0)
    }
    const payload = await response.json() as TranslationResponse
    if (!Array.isArray(payload.translations) || payload.translations.length !== texts.length ||
        payload.translations.some((text) => typeof text !== 'string' || !text.trim())) {
      throw new TranslationRequestError(502)
    }
    texts.forEach((text, index) => cache.set(cacheKey(text, jobs[0].target), {
      text: payload.translations[index], expires: Date.now() + 24 * 60 * 60 * 1000,
    }))
    while (cache.size > 512) cache.delete(cache.keys().next().value!)
    jobs.forEach((job) => { if (!job.signal.aborted) job.resolve(payload.translations[texts.indexOf(job.text)]) })
  } catch (error) {
    jobs.forEach((job) => job.reject(error))
  } finally {
    jobs.forEach((job) => job.signal.removeEventListener('abort', cancelIfUnused))
  }
}

/** The same lossless byte-aware boundaries are enforced again at the proxy. */
export function splitPassage(text: string, limit = 1200): string[] {
  return splitTranslationText(text.trim(), limit)
}
