import { joinTranslationPieces } from '../../shared/translationChunks.ts'
import { useEffect, useLayoutEffect, useMemo, useRef, type MouseEventHandler } from 'react'
import { useTranslation } from '../context/TranslationContext.tsx'
import { useI18n } from '../i18n/index.ts'
import { splitPassage, translatePassage } from '../lib/translation.ts'
import { TranslationSession } from '../lib/translationSession.ts'
import { collectTranslationPassages, preserveReadingPosition, removeTranslations, showTranslation } from '../lib/translationDom.ts'

/** This sanitized subtree belongs exclusively to the current README. */
export function ImmersiveContent({ html, className = '', onClick }: {
  html: string
  className?: string
  onClick?: MouseEventHandler<HTMLDivElement>
}) {
  const { enabled, target, mode, paused, attempt, report, setPaused } = useTranslation()
  const { t } = useI18n()
  const strings = useRef(t)
  strings.current = t
  const ref = useRef<HTMLDivElement>(null)
  const session = useRef<TranslationSession | null>(null)
  const markup = useMemo(() => ({ __html: html }), [html])

  useLayoutEffect(() => {
    const root = ref.current
    if (root) preserveReadingPosition(root, () => { root.dataset.translationView = mode })
  }, [mode])

  useEffect(() => {
    const root = ref.current
    if (!enabled || !root) return
    const passages = collectTranslationPassages(root)
    const reader = new TranslationSession({
      texts: passages.map((passage) => passage.text),
      translate: async (text, signal) => {
        const chunks = splitPassage(text)
        const translated: string[] = []
        for (const chunk of chunks) translated.push(await translatePassage(chunk, target, signal))
        return joinTranslationPieces(chunks, translated)
      },
      priority: (index) => {
        const rect = passages[index].original.parentElement!.getBoundingClientRect()
        const head = root.closest('.readme-card')?.querySelector('.readme-chrome')?.getBoundingClientRect().bottom ?? 0
        if (rect.bottom > head && rect.top < window.innerHeight) return Math.max(0, rect.top - head)
        return rect.top >= window.innerHeight ? rect.top : window.innerHeight + Math.abs(rect.bottom)
      },
      onStart: (index) => preserveReadingPosition(root, () => {
        const passage = passages[index]
        passage.translated.className = 'translation-result translation-feedback is-loading'
        passage.translated.textContent = strings.current('translation.loadingPassage')
        passage.translated.hidden = false
      }),
      onResult: (index, result) => preserveReadingPosition(root, () => {
        const passage = passages[index]
        passage.translated.className = 'translation-result'
        if (result.trim() === passage.text.trim()) passage.translated.hidden = true
        else showTranslation(passage, result, target)
      }),
      onError: (index) => preserveReadingPosition(root, () => {
        const passage = passages[index]
        passage.original.classList.remove('has-translation')
        passage.translated.className = 'translation-result translation-feedback is-error'
        passage.translated.replaceChildren(document.createTextNode(strings.current('translation.failedPassage') + ' '))
        const retry = document.createElement('button')
        retry.type = 'button'
        retry.className = 'translation-inline-retry'
        retry.textContent = strings.current('common.tryAgain')
        retry.setAttribute('aria-label', strings.current('translation.retryPassage'))
        retry.onclick = () => { setPaused(false); session.current?.retry(index) }
        passage.translated.appendChild(retry)
        passage.translated.hidden = false
      }),
      onProgress: report,
    })
    session.current = reader
    return () => {
      reader.dispose()
      session.current = null
      preserveReadingPosition(root, () => removeTranslations(passages))
      report(null)
    }
  }, [enabled, target, html, report, setPaused])

  useEffect(() => {
    if (paused || mode === 'original') session.current?.pause()
    else session.current?.resume()
  }, [enabled, paused, mode, target, html])

  useEffect(() => { if (attempt > 0) session.current?.retry() }, [attempt])

  return <div ref={ref} className={`${className} immersive-content`} onClick={onClick} dangerouslySetInnerHTML={markup} />
}
