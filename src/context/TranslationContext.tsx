import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isTranslationLanguage, type TranslationLanguage, type TranslationMode } from '../../shared/translation.ts'
import { useI18n } from '../i18n/index.ts'
import { loadJSON, saveJSON } from '../lib/storage.ts'

interface Activity { pending: number; failed: number; retryAt: number }
interface TranslationContextValue extends Activity {
  enabled: boolean
  target: TranslationLanguage
  mode: TranslationMode
  attempt: number
  setEnabled: (enabled: boolean) => void
  setTarget: (target: TranslationLanguage) => void
  setMode: (mode: TranslationMode) => void
  retry: () => void
  report: (id: string, activity: Activity | null) => void
}
const TranslationContext = createContext<TranslationContextValue | null>(null)
const PREFERENCE_KEY = 'orbit:translation:v1'

export function TranslationProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n()
  const [preferences] = useState(() => loadJSON<{ target?: unknown; mode?: unknown } | null>(PREFERENCE_KEY, {}))
  const [enabled, setEnabled] = useState(false)
  const [target, setTarget] = useState<TranslationLanguage>(
    isTranslationLanguage(preferences?.target) ? preferences.target : locale,
  )
  const [mode, setMode] = useState<TranslationMode>(preferences?.mode === 'translated' ? 'translated' : 'bilingual')
  const [attempt, setAttempt] = useState(0)
  const [activity, setActivity] = useState<Record<string, Activity>>({})
  useEffect(() => { saveJSON(PREFERENCE_KEY, { target, mode }) }, [target, mode])
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const report = useCallback((id: string, next: Activity | null) => setActivity((current) => {
    if (!next && !current[id]) return current
    if (next && current[id]?.pending === next.pending && current[id]?.failed === next.failed && current[id]?.retryAt === next.retryAt) return current
    const updated = { ...current }
    if (next) updated[id] = next
    else delete updated[id]
    return updated
  }), [])
  const value = useMemo<TranslationContextValue>(() => ({
    enabled, target, mode, attempt, setEnabled, setTarget, setMode, retry, report,
    pending: Object.values(activity).reduce((sum, entry) => sum + entry.pending, 0),
    failed: Object.values(activity).reduce((sum, entry) => sum + entry.failed, 0),
    retryAt: Math.max(0, ...Object.values(activity).map((entry) => entry.retryAt)),
  }), [enabled, target, mode, attempt, retry, report, activity])
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>
}

export function useTranslation() {
  const value = useContext(TranslationContext)
  if (!value) throw new Error('useTranslation requires TranslationProvider')
  return value
}
