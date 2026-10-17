import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isTranslationLanguage, type TranslationLanguage, type TranslationMode } from '../../shared/translation.ts'
import type { TranslationProgress } from '../lib/translationSession.ts'
import { loadJSON, saveJSON } from '../lib/storage.ts'

export type TranslationView = TranslationMode | 'original'
interface TranslationContextValue extends TranslationProgress {
  enabled: boolean
  target: TranslationLanguage
  mode: TranslationView
  paused: boolean
  panelOpen: boolean
  attempt: number
  setEnabled: (enabled: boolean) => void
  setTarget: (target: TranslationLanguage) => void
  setMode: (mode: TranslationView) => void
  setPaused: (paused: boolean) => void
  setPanelOpen: (open: boolean) => void
  retry: () => void
  report: (activity: TranslationProgress | null) => void
}
const TranslationContext = createContext<TranslationContextValue | null>(null)
const PREFERENCE_KEY = 'orbit:translation:v1'
const EMPTY: TranslationProgress = { total: 0, completed: 0, pending: 0, failed: 0, retryAt: 0, status: 'idle' }

/** Mounted inside one README, so leaving it cancels work and resets activation. */
export function TranslationProvider({ children, defaultTarget = 'zh' }: { children: ReactNode; defaultTarget?: TranslationLanguage }) {
  const [preferences] = useState(() => loadJSON<{ target?: unknown; mode?: unknown } | null>(PREFERENCE_KEY, {}))
  const [enabled, setEnabled] = useState(false)
  const [target, setTarget] = useState<TranslationLanguage>(isTranslationLanguage(preferences?.target) ? preferences.target : defaultTarget)
  const [mode, setModeState] = useState<TranslationView>(preferences?.mode === 'translated' ? 'translated' : 'bilingual')
  const [paused, setPaused] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [activity, setActivity] = useState<TranslationProgress>(EMPTY)
  // Original is a temporary reading view, not a preference for the next README.
  const setMode = useCallback((next: TranslationView) => {
    setModeState(next)
  }, [])
  useEffect(() => {
    if (enabled && mode !== 'original') saveJSON(PREFERENCE_KEY, { target, mode })
  }, [enabled, target, mode])
  const retry = useCallback(() => { setPaused(false); setAttempt((value) => value + 1) }, [])
  const report = useCallback((next: TranslationProgress | null) => setActivity(next ?? EMPTY), [])
  const value = useMemo<TranslationContextValue>(() => ({
    enabled, target, mode, paused, panelOpen, attempt, setEnabled, setTarget, setMode, setPaused, setPanelOpen, retry, report, ...activity,
  }), [enabled, target, mode, paused, panelOpen, attempt, setMode, retry, report, activity])
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>
}

export function useTranslation() {
  const value = useContext(TranslationContext)
  if (!value) throw new Error('useTranslation requires TranslationProvider')
  return value
}
