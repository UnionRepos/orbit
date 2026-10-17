import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  Command,
  Flame,
  Gem,
  Home,
  Info,
  Languages,
  Loader2,
  Moon,
  Search,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useOrbit } from '../context/OrbitContext.tsx'
import { localeMeta, useI18n } from '../i18n/index.ts'
import { searchAll } from '../lib/api.ts'
import { useDebounced, useDialogFocus } from '../hooks/useUtils.ts'
import { compactNumber } from '../lib/format.ts'
import { cacheRepo } from '../lib/repoCache.ts'
import { navigate, repoPath, userPath } from '../lib/router.ts'
import type { SearchResponse } from '../../shared/types.ts'

interface PaletteItem {
  id: string
  group: string
  label: string
  hint?: string
  icon?: ReactNode
  avatar?: string
  run: () => void
}

function Highlight({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim()
  if (!trimmed) return <>{text}</>
  const index = text.toLowerCase().indexOf(trimmed.toLowerCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + trimmed.length)}</mark>
      {text.slice(index + trimmed.length)}
    </>
  )
}

export function CommandPalette() {
  const { paletteOpen, closePalette, saved, recent, theme, toggleTheme, health } = useOrbit()
  const { t, nextLocale, toggleLocale } = useI18n()
  const dialogRef = useDialogFocus<HTMLDivElement>(paletteOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [remote, setRemote] = useState<SearchResponse | null>(null)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debounced = useDebounced(query, 260)

  useEffect(() => {
    if (!paletteOpen) return
    setQuery('')
    setActive(0)
    setRemote(null)
    document.body.classList.add('palette-open')
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => {
      window.clearTimeout(timer)
      document.body.classList.remove('palette-open')
    }
  }, [paletteOpen])

  useEffect(() => {
    const trimmed = debounced.trim()
    if (!paletteOpen || trimmed.length < 2) {
      setRemote(null)
      setRemoteLoading(false)
      return
    }
    const controller = new AbortController()
    setRemoteLoading(true)
    searchAll(trimmed, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRemote(result)
      })
      .catch(() => {
        if (!controller.signal.aborted) setRemote(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setRemoteLoading(false)
      })
    return () => controller.abort()
  }, [debounced, paletteOpen])

  const items = useMemo<PaletteItem[]>(() => {
    const search = query.trim().toLowerCase()
    const nav: PaletteItem[] = [
      { id: 'feed', group: t('palette.goTo'), label: t('palette.discover'), hint: t('palette.discoverHint'), icon: <Home size={15} />, run: () => navigate('/') },
      { id: 'trending', group: t('palette.goTo'), label: t('palette.trending'), hint: t('palette.trendingHint'), icon: <Flame size={15} />, run: () => navigate('/?channel=trending') },
      { id: 'rising', group: t('palette.goTo'), label: t('palette.rising'), hint: t('palette.risingHint'), icon: <TrendingUp size={15} />, run: () => navigate('/?channel=rising') },
      { id: 'fresh', group: t('palette.goTo'), label: t('palette.active'), hint: t('palette.activeHint'), icon: <Zap size={15} />, run: () => navigate('/?channel=fresh') },
      { id: 'gems', group: t('palette.goTo'), label: t('palette.gems'), hint: t('palette.gemsHint'), icon: <Gem size={15} />, run: () => navigate('/?channel=gems') },
      { id: 'saved', group: t('palette.goTo'), label: t('palette.readingList'), hint: t('palette.readingHint', { count: saved.length }), icon: <Bookmark size={15} />, run: () => navigate('/saved') },
      { id: 'about', group: t('palette.goTo'), label: t('filter.how'), hint: t('palette.aboutHint'), icon: <Info size={15} />, run: () => navigate('/about') },
      {
        id: 'theme',
        group: t('palette.prefs'),
        label: theme === 'dark' ? t('topbar.themeToLight') : t('topbar.themeToDark'),
        icon: theme === 'dark' ? <Moon size={15} /> : <Star size={15} />,
        run: toggleTheme,
      },
      {
        id: 'language',
        group: t('palette.prefs'),
        label: `${t('topbar.languageAria')} · ${localeMeta(nextLocale).label}`,
        hint: localeMeta(nextLocale).short,
        icon: <Languages size={15} />,
        run: toggleLocale,
      },
    ]

    const matchedNav = search
      ? nav.filter((item) => `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(search))
      : nav

    const matchedSaved = saved
      .filter((entry) =>
        search
          ? `${entry.repo.fullName} ${entry.repo.description ?? ''} ${entry.repo.topics.join(' ')}`
              .toLowerCase()
              .includes(search)
          : true,
      )
      .slice(0, search ? 5 : 4)
      .map<PaletteItem>((entry) => ({
        id: `saved-${entry.repo.fullName}`,
        group: t('palette.readingList'),
        label: entry.repo.fullName,
        hint: entry.note
          ? t('palette.hintNote', { stars: compactNumber(entry.repo.stars) })
          : t('palette.hintLanguage', {
              stars: compactNumber(entry.repo.stars),
              language: entry.repo.language ?? t('common.unknown'),
            }),
        avatar: entry.repo.owner.avatarUrl,
        run: () => {
          cacheRepo(entry.repo)
          navigate(repoPath(entry.repo.owner.login, entry.repo.name))
        },
      }))

    const recentItems = !search
      ? recent.slice(0, 3).map<PaletteItem>((entry) => ({
          id: `recent-${entry.repo.fullName}`,
          group: t('palette.recent'),
          label: entry.repo.fullName,
          hint: entry.repo.language ?? undefined,
          avatar: entry.repo.owner.avatarUrl,
          run: () => {
            cacheRepo(entry.repo)
            navigate(repoPath(entry.repo.owner.login, entry.repo.name))
          },
        }))
      : []

    const remoteRepos =
      search && remote
        ? remote.repos.slice(0, 6).map<PaletteItem>((repo) => ({
            id: `repo-${repo.fullName}`,
            group: t('palette.repos'),
            label: repo.fullName,
            hint: t('palette.hintLanguage', {
              stars: compactNumber(repo.stars),
              language: repo.language ?? t('common.unknown'),
            }),
            avatar: repo.owner.avatarUrl,
            run: () => {
              cacheRepo(repo)
              navigate(repoPath(repo.owner.login, repo.name))
            },
          }))
        : []

    const remoteUser: PaletteItem[] =
      search && remote?.user
        ? [
            {
              id: `user-${remote.user.login}`,
              group: t('palette.people'),
              label: `@${remote.user.login}`,
              hint: remote.user.name ?? t('palette.hintFollowers', { count: compactNumber(remote.user.followers) }),
              avatar: remote.user.avatarUrl,
              run: () => navigate(userPath(remote.user!.login)),
            },
          ]
        : []

    const searchAction: PaletteItem[] = search
      ? [
          {
            id: 'search-github',
            group: t('palette.search'),
            label: t('palette.searchAll', { query: query.trim() }),
            hint: t('palette.searchAllHint'),
            icon: <Search size={15} />,
            run: () => navigate(`/?q=${encodeURIComponent(query.trim())}`),
          },
        ]
      : []

    return [...matchedNav, ...searchAction, ...remoteUser, ...remoteRepos, ...matchedSaved, ...recentItems]
  }, [query, saved, recent, remote, theme, toggleTheme, toggleLocale, nextLocale, t])

  useEffect(() => {
    setActive(0)
  }, [query, saved.length, remote])

  useEffect(() => {
    if (!paletteOpen) return
    const node = listRef.current?.querySelector<HTMLElement>(`.cmdk-item[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, paletteOpen])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!paletteOpen) return null

  function runItem(item: PaletteItem) {
    closePalette()
    window.setTimeout(() => item.run(), 20)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (items.length ? (current + 1) % items.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (items.length ? (current - 1 + items.length) % items.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[active]
      if (item) runItem(item)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closePalette()
    }
  }

  let lastGroup = ''

  return (
    <div className="cmdk-backdrop" onMouseDown={closePalette}>
      <div
        className="cmdk-panel"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.aria')}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="cmdk-search">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.searchAria')}
            spellCheck={false}
          />
          {remoteLoading ? (
            <Loader2 size={16} className="spinning" />
          ) : (
            <kbd>esc</kbd>
          )}
        </div>

        <div className="cmdk-list" ref={listRef}>
          {items.length === 0 && (
            <div className="cmdk-empty">
              <Search size={20} />
              <p>{t('palette.empty')}</p>
            </div>
          )}

          {items.map((item, index) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.id}>
                {showGroup && <div className="cmdk-group">{item.group}</div>}
                <button
                  data-index={index}
                  className={`cmdk-item ${index === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runItem(item)}
                >
                  <span className="cmdk-item-icon">
                    {item.avatar ? (
                      <img src={item.avatar} alt="" loading="lazy" />
                    ) : (
                      item.icon ?? <Command size={15} />
                    )}
                  </span>
                  <span className="cmdk-item-text">
                    <span className="cmdk-item-label">
                      <Highlight text={item.label} query={query} />
                    </span>
                    {item.hint && <span className="cmdk-item-hint">{item.hint}</span>}
                  </span>
                  <span className="cmdk-item-enter">
                    {index === active ? <ArrowUpRight size={14} /> : null}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        <footer className="cmdk-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t('palette.navigate')}
          </span>
          <span>
            <kbd>↵</kbd> {t('palette.open')}
          </span>
          <span>
            <kbd>esc</kbd> {t('palette.close')}
          </span>
          <span className="cmdk-status">
            <Star size={12} /> {t('palette.saved', { count: saved.length })}
            {health?.hasToken ? ` · ${t('palette.authenticated')}` : ''}
          </span>
        </footer>
      </div>
    </div>
  )
}
