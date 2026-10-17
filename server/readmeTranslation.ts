import { isTranslationLanguage, type ReadmeTranslationEvent, type ReadmeTranslationRequest } from '../shared/translation.ts'
import { joinTranslationPieces, splitTranslationText } from '../shared/translationChunks.ts'
import { fitsTranslationBudget, translationQualityIssue } from './translationQuality.ts'
import { TranslationError, TranslationQualityError, TranslationService, translationPrompt } from './translation.ts'
import { waitForTranslation } from './translationGate.ts'

export function parseReadmeTranslation(value: unknown): ReadmeTranslationRequest | null {
  if (!value || typeof value !== 'object') return null
  const { target, passages } = value as Record<string, unknown>
  if (!isTranslationLanguage(target) || !Array.isArray(passages) || !passages.length || passages.length > 1200) return null
  const seen = new Set<number>()
  let total = 0
  for (const passage of passages) {
    if (!passage || typeof passage !== 'object') return null
    const { index, text } = passage as Record<string, unknown>
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= 1200 || seen.has(index as number) ||
      typeof text !== 'string' || !text.trim() || text.length > 250_000) return null
    seen.add(index as number)
    total += text.length
    if (total > 250_000) return null
  }
  return { target, passages: passages as ReadmeTranslationRequest['passages'] }
}

/** One server workflow, one provider lane, incremental validated results. */
export async function translateReadme(
  request: ReadmeTranslationRequest,
  service: TranslationService,
  signal: AbortSignal,
  emit: (event: ReadmeTranslationEvent) => Promise<void>,
  sleep = waitForTranslation,
) {
  const { target, passages } = request
  const pieces = passages.flatMap((passage) => splitTranslationText(passage.text).map((text, part) => ({ index: passage.index, text, part })))
  const results = new Map<number, Map<number, string>>()
  const failed = new Set<number>()
  const started = new Set<number>()
  const source = new Map(passages.map((passage) => [passage.index, splitTranslationText(passage.text)]))
  let consecutiveFailures = 0
  let qualityFailures = 0

  const publish = async (piece: typeof pieces[number], text: string) => {
    const prior = results.get(piece.index) ?? new Map<number, string>()
    prior.set(piece.part, text)
    results.set(piece.index, prior)
    const originals = source.get(piece.index)!
    if (prior.size === originals.length && !failed.has(piece.index)) {
      const translated = joinTranslationPieces(originals, originals.map((_text, part) => prior.get(part)!))
      const issue = translationQualityIssue(originals.join(''), translated)
      if (issue) {
        service.forget(originals, target)
        throw new TranslationQualityError(issue)
      }
      qualityFailures = 0
      await emit({ type: 'result', index: piece.index, text: translated })
    }
  }

  const translate = async (batch: typeof pieces): Promise<string[]> => {
    // Retry a transient failure here, once per batch, rather than per browser task.
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      try {
        const output = await service.translate({ target, texts: batch.map((piece) => piece.text) }, signal, { maxDepth: 1, maxCalls: 8 })
        consecutiveFailures = 0
        return output
      } catch (error) {
        if (signal.aborted) throw signal.reason
        if (error instanceof TranslationQualityError) throw error
        consecutiveFailures++
        if (attempt >= 2 || consecutiveFailures >= 3) throw error
        const delay = error instanceof TranslationError && error.retryAfter ? error.retryAfter * 1000 : 1500 * 2 ** attempt
        await emit({ type: 'waiting', retryAt: Date.now() + delay })
        await sleep(delay, signal)
      }
    }
  }

  let cursor = 0
  while (cursor < pieces.length) {
    signal.throwIfAborted()
    const batch: typeof pieces = []
    while (cursor < pieces.length && batch.length < 6) {
      const piece = pieces[cursor]
      if (failed.has(piece.index)) { cursor++; continue }
      const candidate = [...batch.map((entry) => entry.text), piece.text]
      if (batch.length && !fitsTranslationBudget(translationPrompt(candidate, target), candidate)) break
      batch.push(piece)
      cursor++
    }
    if (!batch.length) continue
    for (const piece of batch) if (!started.has(piece.index)) {
      started.add(piece.index)
      await emit({ type: 'start', index: piece.index })
    }
    try {
      const translated = await translate(batch)
      for (let index = 0; index < batch.length; index++) await publish(batch[index], translated[index])
    } catch (error) {
      if (signal.aborted) throw signal.reason
      if (!(error instanceof TranslationQualityError)) {
        const delay = error instanceof TranslationError && error.retryAfter ? error.retryAfter * 1000 : 15_000
        await emit({ type: 'unavailable', retryAt: Date.now() + delay })
        return // Keep the rest queued, never manufacture dozens of failed passages.
      }
      // Isolate malformed passages; validated pieces are already cached by the service.
      for (const piece of batch) {
        if (failed.has(piece.index)) continue
        try { await publish(piece, (await translate([piece]))[0]) } catch (failure) {
          if (signal.aborted) throw signal.reason
          if (!(failure instanceof TranslationQualityError)) {
            await emit({ type: 'unavailable', retryAt: Date.now() + (failure instanceof TranslationError && failure.retryAfter ? failure.retryAfter * 1000 : 15_000) })
            return
          }
          failed.add(piece.index)
          await emit({ type: 'failed', index: piece.index })
          if (++qualityFailures >= 3) {
            await emit({ type: 'unavailable', retryAt: Date.now() + 15_000 })
            return
          }
        }
      }
    }
  }
  await emit({ type: 'done' })
}
