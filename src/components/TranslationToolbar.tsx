import { useEffect, useState } from 'react'
import { Languages, LoaderCircle, RotateCcw } from 'lucide-react'
import { TRANSLATION_LANGUAGES, type TranslationLanguage, type TranslationMode } from '../../shared/translation.ts'
import { useTranslation } from '../context/TranslationContext.tsx'
import { useI18n } from '../i18n/index.ts'

export function TranslationToolbar() {
  const { t } = useI18n()
  const { enabled, setEnabled, target, setTarget, mode, setMode, pending, failed, retryAt, retry } = useTranslation()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!failed || retryAt <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [failed, retryAt])
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000))

  return (
    <section className={`translation-toolbar ${enabled ? 'is-enabled' : ''}`} aria-label={t('translation.title')}>
      <div className="translation-controls">
        <span className="translation-label"><Languages size={16} aria-hidden="true" />{t('translation.title')}</span>
        <label className="translation-select">
          <span className="sr-only">{t('translation.target')}</span>
          <select value={target} onChange={(event) => setTarget(event.target.value as TranslationLanguage)}>
            {TRANSLATION_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
          </select>
        </label>
        <label className="translation-select">
          <span className="sr-only">{t('translation.display')}</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as TranslationMode)}>
            <option value="bilingual">{t('translation.bilingual')}</option>
            <option value="translated">{t('translation.translated')}</option>
          </select>
        </label>
        <button className={`btn translation-toggle ${enabled ? '' : 'btn-primary'}`} aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>
          {enabled ? t('translation.original') : t('translation.start')}
        </button>
      </div>
      <div className="translation-caption">
        <span>{t('translation.privacy')} <a href="https://github.com/bilibili/Index-Translate" target="_blank" rel="noreferrer">Bilibili Index-Translate</a></span>
        <span className="translation-status" role="status" aria-live="polite">
          {enabled && pending > 0 && <><LoaderCircle size={12} className="spinning" aria-hidden="true" />{t('translation.pending', { count: pending })}</>}
          {enabled && failed > 0 && <>
            <span>{t('translation.failed')}</span>
            <button className="translation-retry" disabled={wait > 0} onClick={retry}>
              <RotateCcw size={12} aria-hidden="true" />{wait > 0 ? t('translation.wait', { seconds: wait }) : t('common.tryAgain')}
            </button>
          </>}
          {enabled && pending === 0 && failed === 0 && <span>{t('translation.ready')}</span>}
        </span>
      </div>
    </section>
  )
}
