import { utf8Length } from '../shared/translationChunks.ts'

/** Deployment limits of the free endpoint, not the model's self-hosted limits. */
export const INDEX_OUTPUT_TOKENS = 4096
export const INDEX_CONTEXT_TOKENS = 16384
const CONTEXT_RESERVE = 512
const OUTPUT_BUDGET = INDEX_OUTPUT_TOKENS - 1024

/** UTF-8 bytes are a conservative input-token bound; output expansion is estimated. */
export function fitsTranslationBudget(prompt: string, texts: string[]): boolean {
  const outputEstimate = texts.reduce((sum, text) => sum + Math.ceil(utf8Length(text) * 1.5) + 32, 0)
  return outputEstimate <= OUTPUT_BUDGET &&
    utf8Length(prompt) + INDEX_OUTPUT_TOKENS + CONTEXT_RESERVE <= INDEX_CONTEXT_TOKENS
}

export interface TranslationUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

function prose(text: string): string {
  return text.replace(/⟪ORBIT_\d+⟫/g, '').replace(/https?:\/\/\S+/g, '')
}

/** Script-aware size proxy; raw character ratios penalize English → Chinese. */
function informationSize(text: string): number {
  let size = 0
  for (const character of prose(text)) {
    if (/\p{Script=Han}/u.test(character)) size += 3
    else if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character)) size += 2
    else if (/[\p{L}\p{N}]/u.test(character)) size++
  }
  return size
}

/** Repeated n-grams catch spaced and unspaced loops without costly backtracking. */
function repetition(text: string): number {
  const characters = Array.from(prose(text).toLocaleLowerCase().replace(/\s+/g, ' '))
  if (characters.length < 48) return 0
  const width = 12
  const total = characters.length - width + 1
  const grams = new Set<string>()
  for (let index = 0; index < total; index++) grams.add(characters.slice(index, index + width).join(''))
  return 1 - grams.size / total
}

/** These are conservative failure signals, not a proof of semantic completeness. */
export function translationQualityIssue(source: string, translated: string): string | null {
  const sourceSize = informationSize(source)
  const outputSize = informationSize(translated)
  if (sourceSize >= 120 && outputSize < sourceSize * 0.18) return 'abnormal-compression'
  if (sourceSize >= 120 && outputSize > sourceSize * 6) return 'abnormal-expansion'
  const outputRepetition = repetition(translated)
  if (outputRepetition > 0.6 && outputRepetition > repetition(source) + 0.2) return 'repetition-loop'
  return null
}

export function translationUsageIssue(usage: TranslationUsage | undefined, source: string): string | null {
  if (!usage) return null
  const { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total } = usage
  // A stop flag at the cap is not evidence that the model finished the document.
  if (typeof completion === 'number' && completion >= INDEX_OUTPUT_TOKENS - 64) return 'output-limit'
  if ((typeof total === 'number' && total >= INDEX_CONTEXT_TOKENS - 64) ||
      (typeof prompt === 'number' && prompt + INDEX_OUTPUT_TOKENS + CONTEXT_RESERVE > INDEX_CONTEXT_TOKENS)) return 'context-limit'
  if (typeof prompt === 'number' && prompt >= 512 && typeof completion === 'number' &&
      informationSize(source) >= 300 && completion / prompt < 0.08) return 'token-compression'
  return null
}
