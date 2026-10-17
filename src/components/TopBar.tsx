import { useEffect, useRef, useState } from 'react'
import {
  Command,
  Download,
  Info,
  Languages,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react'
import { useOrbit } from '../context/OrbitContext.tsx'
import { localeMeta, useI18n } from '../i18n/index.ts'
import { useInstallPrompt } from '../hooks/usePwa.ts'
import { feedPath, navigate, type Route } from '../lib/router.ts'

export function TopBar({ route }: { route: Route }) {
  const { saved, openPalette, theme, toggleTheme, toast } = useOrbit()
  const { t, toggleLocale, nextLocale } = useI18n()
  const { canInstall, promptInstall } = useInstallPrompt()
  const [value, setValue] = useState(route.name === 'feed' ? route.query.get('q') ?? '' : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(route.name === 'feed' ? route.query.get('q') ?? '' : '')
  }, [route])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.cmdk-panel'))
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const q = value.trim()
    const next = new URLSearchParams(route.name === 'feed' ? route.query : undefined)
    if (q) next.set('q', q)
    else next.delete('q')
    next.delete('page')
    navigate(feedPath(next))
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" onClick={() => navigate('/')} aria-label={t('topbar.home')}>
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-orbit" />
            <span className="brand-core" />
          </span>
          <span className="brand-text">
            <span className="brand-name">Orbit</span>
            <span className="brand-tag">{t('topbar.tagline')}</span>
          </span>
        </button>

        <nav className="primary-nav" aria-label={t('topbar.nav')}>
          <a href="#/" aria-current={route.name === 'feed' ? 'page' : undefined}>
            {t('topbar.discover')}
          </a>
          <a href="#/saved" aria-current={route.name === 'saved' ? 'page' : undefined}>
            {t('topbar.readingList')} <span className="nav-count">{saved.length}</span>
          </a>
        </nav>

        <form className="global-search" onSubmit={submit} role="search">
          <Search size={16} className="search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('topbar.searchPlaceholder')}
            aria-label={t('topbar.searchAria')}
            spellCheck={false}
          />
          {value ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => {
                setValue('')
                if (route.name === 'feed' && route.query.has('q')) {
                  const next = new URLSearchParams(route.query)
                  next.delete('q')
                  next.delete('page')
                  navigate(feedPath(next))
                }
                inputRef.current?.focus()
              }}
              aria-label={t('topbar.clearSearch')}
            >
              <X size={14} />
            </button>
          ) : (
            <span className="search-hint">
              <kbd>/</kbd>
            </span>
          )}
        </form>

        <div className="topbar-actions">
          {canInstall && (
            <button
              className="icon-btn install-btn"
              onClick={async () => {
                const outcome = await promptInstall()
                if (outcome === 'accepted') toast(t('pwa.installed'), 'success')
              }}
              title={t('pwa.installAria')}
              aria-label={t('pwa.installAria')}
            >
              <Download size={18} />
            </button>
          )}

          <button
            className="icon-btn lang-btn"
            onClick={toggleLocale}
            title={t('topbar.languageAria')}
            aria-label={t('topbar.languageAria')}
          >
            <Languages size={15} aria-hidden="true" />
            <span>{localeMeta(nextLocale).short}</span>
          </button>

          <button
            className="palette-trigger"
            onClick={openPalette}
            title={t('topbar.commandTitle')}
            aria-label={t('topbar.commandAria')}
          >
            <Command size={15} />
            <kbd>⌘K</kbd>
          </button>

          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('topbar.themeToLight') : t('topbar.themeToDark')}
            aria-label={theme === 'dark' ? t('topbar.themeToLight') : t('topbar.themeToDark')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            className="icon-btn about-link"
            onClick={() => navigate('/about')}
            title={t('topbar.about')}
            aria-label={t('topbar.about')}
          >
            <Info size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
