/**
 * Locale plumbing shared by React and plain helpers.
 *
 * This module is intentionally free of React imports so that pure utilities
 * (`format.ts`) and tests can use translations without pulling in the UI.
 * The active locale lives here and is kept in sync by `I18nProvider`.
 */
import { en } from './en.ts'
import { zh } from './zh.ts'

export type Locale = 'en' | 'zh'

export interface LocaleMeta {
  id: Locale
  /** Name of the language, written in that language. */
  label: string
  /** Compact label for the switcher. */
  short: string
  /** BCP 47 tag handed to Intl. */
  tag: string
}

export const LOCALES: LocaleMeta[] = [
  { id: 'en', label: 'English', short: 'EN', tag: 'en' },
  { id: 'zh', label: '中文', short: '中', tag: 'zh-CN' },
]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_STORAGE_KEY = 'orbit:locale:v1'

export type MessageKey = keyof typeof en

type Vars = Record<string, string | number>

/** Dictionaries keyed by locale. `zh` is checked against `en` at compile time. */
export const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, zh }

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'zh'
}

/** Maps a BCP 47 tag (`zh-Hans-CN`, `en-US`, …) onto a supported locale. */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  const base = tag.toLowerCase().split(/[-_]/)[0]
  if (base === 'zh' || base === 'en') return base
  return null
}

export function localeMeta(locale: Locale): LocaleMeta {
  return LOCALES.find((entry) => entry.id === locale) ?? LOCALES[0]
}

function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') return []
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return [...navigator.languages]
  }
  return navigator.language ? [navigator.language] : []
}

/** Stored preference → browser languages → English. */
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // localStorage can be unavailable in private modes.
  }
  for (const tag of browserLanguages()) {
    const match = normalizeLocale(tag)
    if (match) return match
  }
  return DEFAULT_LOCALE
}

export function intlLocale(locale: Locale = getLocale()): string {
  return localeMeta(locale).tag
}

/** English has two plural forms; Chinese has one. */
function pluralIndex(locale: Locale, count: number): number {
  if (locale === 'en') return count === 1 ? 0 : 1
  return 0
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

function lookup(locale: Locale, key: MessageKey): string | undefined {
  return DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE][key]
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const template = lookup(locale, key)
  if (template === undefined) return key
  return interpolate(template, vars)
}

/**
 * Picks a plural form from a `one|other` template and interpolates it.
 * The count is exposed as `{count}` for convenience.
 */
export function translatePlural(
  locale: Locale,
  key: MessageKey,
  count: number,
  vars?: Vars,
): string {
  const template = lookup(locale, key)
  if (template === undefined) return key
  const variants = template.split('|')
  const selected = variants[Math.min(pluralIndex(locale, count), variants.length - 1)]
  return interpolate(selected, { count, ...vars })
}

let activeLocale: Locale = DEFAULT_LOCALE

export function getLocale(): Locale {
  return activeLocale
}

/**
 * Sets the locale used by non-React helpers (`format.ts`). Called from the
 * provider's render body so children always format with the same locale they
 * render with.
 */
export function setActiveLocale(locale: Locale): void {
  activeLocale = locale
}

/** Shorthand for `translate(getLocale(), …)`, for helpers outside React. */
export function t(key: MessageKey, vars?: Vars): string {
  return translate(activeLocale, key, vars)
}

export function tp(key: MessageKey, count: number, vars?: Vars): string {
  return translatePlural(activeLocale, key, count, vars)
}
