import { useLayoutEffect, useRef, type MouseEventHandler } from 'react'
import { ArrowUpRight, Copy, ExternalLink, FileText } from 'lucide-react'
import type { ReadmeResponse } from '../../shared/types.ts'
import { TranslationProvider } from '../context/TranslationContext.tsx'
import { useOrbit } from '../context/OrbitContext.tsx'
import { useI18n } from '../i18n/index.ts'
import { copyText } from '../lib/clipboard.ts'
import { compactNumber } from '../lib/format.ts'
import type { RenderedMarkdown } from '../lib/markdown.ts'
import { ImmersiveContent } from './ImmersiveContent.tsx'
import { ReadmeSkeleton } from './Skeletons.tsx'
import { TranslationButton, TranslationToolbar } from './TranslationToolbar.tsx'

interface ReadmeReaderProps {
  readme: ReadmeResponse | null
  rendered: RenderedMarkdown | null
  loading: boolean
  error: string | null
  repoHtmlUrl: string
  onClick: MouseEventHandler<HTMLDivElement>
}

export function ReadmeReader(props: ReadmeReaderProps) {
  const { locale } = useI18n()
  const text = props.rendered?.html.replace(/<[^>]*>/g, '') ?? ''
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length
  const letters = (text.match(/\p{L}/gu) ?? []).length
  const defaultTarget = locale === 'zh' || han < letters * 0.2 ? 'zh' : 'en'
  return <TranslationProvider key={props.readme ? 'loaded' : 'loading'} defaultTarget={defaultTarget}>
    <ReadmeDocument {...props} />
  </TranslationProvider>
}

function ReadmeDocument({ readme, rendered, loading, error, repoHtmlUrl, onClick }: ReadmeReaderProps) {
  const { t } = useI18n()
  const { toast } = useOrbit()
  const cardRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const topbar = document.querySelector<HTMLElement>('.topbar')
    if (!topbar) return
    const sync = () => cardRef.current?.style.setProperty('--reader-top-offset', `${Math.ceil(topbar.getBoundingClientRect().height)}px`)
    sync()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null
    observer?.observe(topbar)
    window.addEventListener('resize', sync)
    return () => { observer?.disconnect(); window.removeEventListener('resize', sync) }
  }, [])
  const ready = !loading && !error && !!readme && !!rendered
  return <section ref={cardRef} className="readme-card">
    <div className="readme-chrome">
      <header className="readme-head">
        <span className="readme-file"><FileText size={15} />{readme?.path ?? t('detail.readme')}</span>
        {readme && <span className="readme-size">{t('detail.words', { count: compactNumber(readme.markdown.split(/\s+/).length) })}</span>}
        <div className="readme-actions">
          {ready && <TranslationButton />}
          {readme && <button className="icon-btn" title={t('detail.copyRaw')} aria-label={t('detail.copyRaw')} onClick={async () => {
            const ok = await copyText(readme.markdown)
            toast(ok ? t('detail.rawCopied') : t('detail.copyFailed'), ok ? 'success' : 'error')
          }}><Copy size={14} /></button>}
          <a className="icon-btn" href={readme?.htmlUrl ?? `${repoHtmlUrl}#readme`} target="_blank" rel="noreferrer" title={t('detail.viewReadme')} aria-label={t('detail.viewReadme')}><ExternalLink size={14} /></a>
        </div>
      </header>
      {ready && <TranslationToolbar />}
    </div>
    {loading && <ReadmeSkeleton />}
    {!loading && error && <div className="readme-error">
      <FileText size={20} />
      <div><strong>{t('detail.readmeUnavailable')}</strong><p>{error}</p></div>
      <a className="btn" href={`${repoHtmlUrl}#readme`} target="_blank" rel="noreferrer">{t('detail.readOnGithub')} <ArrowUpRight size={13} /></a>
    </div>}
    {!loading && rendered && !error && <ImmersiveContent className="markdown-body" html={rendered.html} onClick={onClick} />}
  </section>
}
