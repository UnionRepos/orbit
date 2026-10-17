/** Public text only; interface localization is handled separately by src/i18n. */
export const TRANSLATION_LANGUAGES = [
  { code: 'zh', name: '简体中文', prompt: 'Simplified Chinese' },
  { code: 'en', name: 'English', prompt: 'English' },
  { code: 'ja', name: '日本語', prompt: 'Japanese' },
  { code: 'ko', name: '한국어', prompt: 'Korean' },
  { code: 'fr', name: 'Français', prompt: 'French' },
  { code: 'de', name: 'Deutsch', prompt: 'German' },
  { code: 'es', name: 'Español', prompt: 'Spanish' },
  { code: 'ru', name: 'Русский', prompt: 'Russian' },
] as const

export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number]['code']
export type TranslationMode = 'bilingual' | 'translated'
export const TRANSLATION_MAX_TEXT = 2400
export const TRANSLATION_MAX_BATCH = 6
export const TRANSLATION_MAX_TOTAL = 6000

export function isTranslationLanguage(value: unknown): value is TranslationLanguage {
  return TRANSLATION_LANGUAGES.some((language) => language.code === value)
}

export interface TranslationRequest {
  target: TranslationLanguage
  texts: string[]
}

export interface TranslationResponse {
  translations: string[]
  provider: 'bilibili-index-translate'
}
