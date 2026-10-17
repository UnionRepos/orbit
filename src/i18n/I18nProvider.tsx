import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  detectLocale,
  localeMeta,
  LOCALES,
  LOCALE_STORAGE_KEY,
  setActiveLocale,
  translate,
  translatePlural,
  type Locale,
  type MessageKey,
} from './core.ts'

type Vars = Record<string, string | number>

export interface I18nContextValue {
  locale: Locale
  /** The language the switcher would move to. */
  nextLocale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  /** Translate a key for the active locale. */
  t: (key: MessageKey, vars?: Vars) => string
  /** Translate a `singular|plural` key for `count`. */
  tp: (key: MessageKey, count: number, vars?: Vars) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  // Keep non-React helpers (`format.ts`) on the same locale as this render pass.
  // Writing a module scalar during render is idempotent and keeps every child
  // formatting identically without threading the locale through each call site.
  setActiveLocale(locale)

  useEffect(() => {
    document.documentElement.lang = localeMeta(locale).tag
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Persistence is best-effort.
    }
  }, [locale])

  const setLocale = useCallback((next: Locale) => setLocaleState(next), [])

  const value = useMemo<I18nContextValue>(() => {
    const nextLocale = LOCALES.find((entry) => entry.id !== locale)?.id ?? locale
    return {
      locale,
      nextLocale,
      setLocale,
      toggleLocale: () => setLocale(nextLocale),
      t: (key, vars) => translate(locale, key, vars),
      tp: (key, count, vars) => translatePlural(locale, key, count, vars),
    }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
