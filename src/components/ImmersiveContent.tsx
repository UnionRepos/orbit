import { joinTranslationPieces } from '../../shared/translationChunks.ts'
import { useEffect, useId, useMemo, useRef, type MouseEventHandler } from 'react'
import { useTranslation } from '../context/TranslationContext.tsx'
import { splitPassage, translatePassage, TranslationRequestError } from '../lib/translation.ts'
import { collectTranslationPassages, escapeTranslationText, removeTranslations, showTranslation, type TranslationPassage } from '../lib/translationDom.ts'

/** Owns a sanitized HTML subtree. React never reconciles the inserted translation nodes. */
export function ImmersiveContent({ html, className = '', onClick }: {
  html: string
  className?: string
  onClick?: MouseEventHandler<HTMLDivElement>
}) {
  const { enabled, target, mode, attempt, report } = useTranslation()
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const markup = useMemo(() => ({ __html: html }), [html])

  useEffect(() => {
    const root = ref.current
    if (!enabled || !root) return
    const controller = new AbortController()
    const passages = collectTranslationPassages(root)
    const activity = { pending: 0, failed: 0, retryAt: 0 }
    const scheduled = new Set<TranslationPassage>()
    const publish = () => { if (!controller.signal.aborted) report(id, { ...activity }) }
    const translate = async (passage: TranslationPassage) => {
      if (scheduled.has(passage) || controller.signal.aborted) return
      scheduled.add(passage)
      activity.pending++
      passage.original.classList.add('translation-pending')
      publish()
      try {
        const chunks = splitPassage(passage.text)
        const translated: string[] = []
        // Keep long paragraphs ordered and avoid a burst of requests for one block.
        for (const chunk of chunks) translated.push(await translatePassage(chunk, target, controller.signal))
        if (controller.signal.aborted) return
        const result = joinTranslationPieces(chunks, translated)
        if (result.trim() !== passage.text.trim()) showTranslation(passage, result, target)
      } catch (error) {
        if (controller.signal.aborted) return
        activity.failed++
        if (error instanceof TranslationRequestError && error.retryAfter > 0) {
          activity.retryAt = Math.max(activity.retryAt, Date.now() + error.retryAfter * 1000)
        }
      } finally {
        activity.pending--
        passage.original.classList.remove('translation-pending')
        publish()
      }
    }
    let observer: IntersectionObserver | undefined
    if (typeof IntersectionObserver === 'function') {
      const groups = new Map<Element, TranslationPassage[]>()
      passages.forEach((passage) => {
        const node = passage.original.parentElement!
        groups.set(node, [...(groups.get(node) ?? []), passage])
      })
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          observer?.unobserve(entry.target)
          groups.get(entry.target)?.forEach((passage) => { void translate(passage) })
        })
      }, { rootMargin: '240px 0px' })
      groups.forEach((_passages, element) => observer!.observe(element))
    } else passages.forEach((passage) => { void translate(passage) })

    return () => {
      controller.abort()
      observer?.disconnect()
      removeTranslations(passages)
      report(id, null)
    }
  }, [enabled, target, attempt, html, id, report])

  return <div ref={ref} className={`${className} immersive-content translation-mode-${mode}`} onClick={onClick} dangerouslySetInnerHTML={markup} />
}

export function TranslatedText({ text, className }: { text: string; className: string }) {
  return <ImmersiveContent html={escapeTranslationText(text)} className={className} />
}
