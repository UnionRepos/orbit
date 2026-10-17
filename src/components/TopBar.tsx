import { useEffect, useRef, useState } from 'react'
import {
  Command,
  Info,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react'
import { useOrbit } from '../context/OrbitContext.tsx'
import { feedPath, navigate, type Route } from '../lib/router.ts'

export function TopBar({ route }: { route: Route }) {
  const { saved, openPalette, theme, toggleTheme } = useOrbit()
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
        <button className="brand" onClick={() => navigate('/')} aria-label="Orbit home">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-orbit" />
            <span className="brand-core" />
          </span>
          <span className="brand-text">
            <span className="brand-name">Orbit</span>
            <span className="brand-tag">An open-source directory</span>
          </span>
        </button>

        <nav className="primary-nav" aria-label="Primary">
          <a href="#/" aria-current={route.name === 'feed' ? 'page' : undefined}>Discover</a>
          <a href="#/saved" aria-current={route.name === 'saved' ? 'page' : undefined}>
            Reading list <span className="nav-count">{saved.length}</span>
          </a>
        </nav>

        <form className="global-search" onSubmit={submit} role="search">
          <Search size={16} className="search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search repositories…"
            aria-label="Search GitHub projects"
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
              aria-label="Clear search"
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
          <button
            className="palette-trigger"
            onClick={openPalette}
            title="Open command menu (⌘K / Ctrl+K)"
            aria-label="Open command menu"
          >
            <Command size={15} />
            <kbd>⌘K</kbd>
          </button>

          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            className="icon-btn about-link"
            onClick={() => navigate('/about')}
            title="About Orbit"
            aria-label="About Orbit"
          >
            <Info size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
