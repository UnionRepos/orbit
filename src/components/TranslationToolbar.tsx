import { useEffect, useId, useMemo, useState } from 'react'
import { ChevronDown, Languages, LoaderCircle, Pause, Play, RotateCcw, Check } from 'lucide-react'
import { TRANSLATION_LANGUAGES, type TranslationLanguage } from '../../shared/translation.ts'
import { useTranslation, type TranslationView } from '../context/TranslationContext.tsx'
import { useI18n } from '../i18n/index.ts'
import { Dropdown } from './Dropdown.tsx'
import type { DropdownOption } from '../lib/dropdown.ts'

/** One compact entry point, next to the README's copy and external-link actions. */
export function TranslationButton() {
  const { t } = useI18n()
  const { enabled, setEnabled, target, setTarget, panelOpen, setPanelOpen, pending } = useTranslation()
  const languageOptions = useMemo<DropdownOption<TranslationLanguage>[]>(
    () => TRANSLATION_LANGUAGES.map((language) => ({ value: language.code, label: language.name })), [],
  )
  return <div className="readme-translate-action">
    <Dropdown className="translation-select" label={t('translation.target')} value={target} options={languageOptions} onChange={setTarget} align="end" minWidth={180} />
    <button type="button" className={`btn readme-translate-button ${enabled ? 'is-active' : ''}`}
      aria-expanded={panelOpen} title={t('translation.buttonHint')} onClick={() => {
        if (!enabled) setEnabled(true)
        setPanelOpen(!enabled || !panelOpen)
      }}>
      {pending > 0 ? <LoaderCircle size={14} className="spinning" aria-hidden="true" /> : <Languages size={14} aria-hidden="true" />}
      <span>{enabled ? t('translation.buttonActive') : t('translation.start')}</span>
      {enabled && <ChevronDown size={12} aria-hidden="true" />}
    </button>
  </div>
}

/** Kept in the sticky README chrome so views and progress remain within reach. */
export function TranslationToolbar() {
  const { t } = useI18n()
  const { enabled, panelOpen, mode, setMode, paused, setPaused, total, completed, pending, failed, retryAt, status, retry } = useTranslation()
  const [now, setNow] = useState(Date.now)
  const tabsId = useId()
  useEffect(() => {
    setNow(Date.now())
    if (retryAt <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  if (!enabled) return null
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const complete = completed === total
  const percent = total ? Math.round(completed / total * 100) : 100
  const views: { value: TranslationView; label: string }[] = [
    { value: 'original', label: t('translation.original') },
    { value: 'bilingual', label: t('translation.bilingual') },
    { value: 'translated', label: t('translation.translated') },
  ]
  return <div className="readme-translation-panel" hidden={!panelOpen}>
    <div className="readme-translation-settings">
      <div className="translation-views" role="group" aria-label={t('translation.display')} id={tabsId}>
        {views.map((view) => <button key={view.value} type="button" aria-pressed={mode === view.value} onClick={() => setMode(view.value)}>{view.label}</button>)}
      </div>
      <div className="translation-session-actions">
        {(failed > 0 || status === 'unavailable') && <button className="translation-retry" disabled={wait > 0} onClick={retry}>
          <RotateCcw size={12} aria-hidden="true" />{wait > 0 ? t('translation.wait', { seconds: wait }) : status === 'unavailable' ? t('translation.reconnect') : t('translation.retryFailed')}
        </button>}
        {total - completed - failed > 0 && mode !== 'original' && status !== 'unavailable' && <button className="translation-pause" onClick={() => setPaused(!paused)}>
          {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}{paused ? t('translation.resume') : t('translation.pause')}
        </button>}
      </div>
    </div>
    <div className="translation-progress-copy" role="status" aria-live="polite" aria-atomic="true">
      <span>{complete ? <Check size={12} aria-hidden="true" /> : pending > 0 && !paused && mode !== 'original' ? <LoaderCircle size={12} className="spinning" aria-hidden="true" /> : null}
        {complete ? total === 0 ? t('translation.empty') : t('translation.complete') : mode === 'original' ? t('translation.originalPaused') : paused ? t('translation.paused') : status === 'unavailable' ? t('translation.serviceUnavailable') : wait > 0 ? t('translation.recovering', { seconds: wait }) : t('translation.progress', { done: completed, total })}
        {failed > 0 && <span className="translation-failure-count">{t('translation.failedCount', { count: failed })}</span>}
      </span>
      <span className="translation-percent">{percent}%</span>
    </div>
    <div className="translation-progress-track" role="progressbar" aria-label={t('translation.progressAria')} aria-valuenow={total ? completed : 1} aria-valuemin={0} aria-valuemax={Math.max(1, total)}><span style={{ width: `${percent}%` }} /></div>
    <p className="translation-caption">{t('translation.privacy')} <a href="https://github.com/bilibili/Index-Translate" target="_blank" rel="noreferrer">Bilibili Index-Translate</a></p>
  </div>
}
