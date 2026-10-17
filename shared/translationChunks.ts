/** Keep chunks small enough for output expansion in the public 4K-token service. */
export const TRANSLATION_CHUNK_CHARS = 1200
export const TRANSLATION_CHUNK_BYTES = 1800

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

/** Lossless boundaries: never cut a Unicode code point or protected inline node. */
export function splitTranslationText(
  text: string,
  maxChars = TRANSLATION_CHUNK_CHARS,
  maxBytes = TRANSLATION_CHUNK_BYTES,
): string[] {
  if (!Number.isFinite(maxChars) || maxChars < 64 || !Number.isFinite(maxBytes) || maxBytes < 64) {
    throw new RangeError('Translation chunk limits must be at least 64.')
  }
  const chunks: string[] = []
  let current = ''
  let bytes = 0
  // A placeholder is one indivisible unit, even at a recursive retry boundary.
  const units = text.match(/⟪ORBIT_\d+⟫|[\s\S]/gu) ?? []
  for (const unit of units) {
    const size = utf8Length(unit)
    if (current && (current.length + unit.length > maxChars || bytes + size > maxBytes)) {
      // Prefer a nearby sentence/paragraph boundary, then a word boundary.
      const preferred = [...current.matchAll(/(?:\n+|[.!?。！？](?:\s+|(?=[^\x00-\x7f])))/g)].at(-1)
      const word = current.lastIndexOf(' ') + 1
      const end = preferred ? preferred.index! + preferred[0].length : word
      if (end >= current.length / 2) {
        chunks.push(current.slice(0, end))
        current = current.slice(end)
        bytes = utf8Length(current)
      } else {
        chunks.push(current)
        current = ''
        bytes = 0
      }
    }
    current += unit
    bytes += size
  }
  if (current) chunks.push(current)
  return chunks
}

/** Restore source separators stripped by model output; avoid joining Latin words. */
export function joinTranslationPieces(sources: string[], translations: string[]): string {
  let result = translations[0] ?? ''
  for (let index = 1; index < translations.length; index++) {
    const left = sources[index - 1].match(/\s+$/)?.[0] ?? ''
    const right = sources[index].match(/^\s+/)?.[0] ?? ''
    const whitespace = left + right
    const previous = Array.from(result).at(-1) ?? ''
    const next = Array.from(translations[index])[0] ?? ''
    const joinsWords = /[\p{L}\p{N}.!?]/u.test(previous) && /[\p{L}\p{N}]/u.test(next) &&
      !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(previous + next)
    const separator = /\s$/.test(result) || /^\s/.test(translations[index]) ? '' : whitespace || (joinsWords ? ' ' : '')
    result += separator + translations[index]
  }
  return result
}
