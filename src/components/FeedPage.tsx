import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  Filter,
  Info,
  RefreshCw,
  SearchX,
  SlidersHorizontal,
  ArrowUpRight,
  X,
} from 'lucide-react'
import type { ChannelId } from '../../shared/types.ts'
import { CHANNELS } from '../../shared/channels.ts'
import { useOrbit } from '../context/OrbitContext.tsx'
import { useI18n } from '../i18n/index.ts'
import { useFeed } from '../hooks/useFeed.ts'
import { useScrollRestore } from '../hooks/useScrollRestore.ts'
import { useDialogFocus, useInView } from '../hooks/useUtils.ts'
import { feedParamsFromRoute, patchFeedQuery, SORT_OPTIONS } from '../lib/feed.ts'
import { compactNumber, fullNumber, relativeTime, timeUntil } from '../lib/format.ts'
import { feedPath, navigate, repoPath, type Route } from '../lib/router.ts'
import { routeScrollKey } from '../lib/scrollMemory.ts'
import { EmptyState } from './EmptyState.tsx'
import { FeedAside } from './FeedAside.tsx'
import { ChannelIcon, FilterPanel } from './FilterPanel.tsx'
import { RepoCard } from './RepoCard.tsx'
import { FeedSkeleton } from './Skeletons.tsx'

type FilterPatch = Record<string, string | number | null>

export function FeedPage({ route }: { route: Route }) {
  const params = useMemo(() => feedParamsFromRoute(route), [route])
  const feed = useFeed(params)
  const { saved, toast } = useOrbit()
  const { t, tp } = useI18n()
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetRef = useDialogFocus<HTMLDivElement>(sheetOpen)
  const meta = feed.meta
  const scrollKey = useMemo(() => routeScrollKey(route), [route])

  // Keep the discovery list scrolled where the user left it when they come
  // back from a project page. Only the first page is fetched on mount, so the
  // restore may need to pull further pages to reach a deep offset.
  const restoreFeed = useMemo(
    () => ({ hasMore: feed.hasMore, loadMore: feed.loadMore }),
    [feed.hasMore, feed.loadMore],
  )
  useScrollRestore(scrollKey, feed.status !== 'loading', restoreFeed)

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetOpen(false)
    }
    document.body.classList.add('sheet-open')
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('sheet-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [sheetOpen])

  const apply = useCallback(
    (patch: FilterPatch) => {
      const next = patchFeedQuery(route.query, patch)
      navigate(feedPath(next), { replace: true })
    },
    [route.query],
  )

  const goChannel = useCallback(
    (nextChannel: ChannelId) => {
      apply({ channel: nextChannel, q: null })
    },
    [apply],
  )

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; patch: FilterPatch }[] = []
    if (params.language) {
      chips.push({ key: 'language', label: params.language, patch: { language: null } })
    }
    if (params.topic) {
      const topic = params.topic.replace(/-/g, ' ')
      chips.push({ key: 'topic', label: `#${topic}`, patch: { topic: null } })
    }
    if (params.minStars) {
      chips.push({
        key: 'minStars',
        label: t('feed.chip.stars', { count: compactNumber(params.minStars) }),
        patch: { minStars: null },
      })
    }
    if (params.createdWithin) {
      chips.push({
        key: 'createdWithin',
        label: t('feed.chip.created', { count: params.createdWithin }),
        patch: { createdWithin: null },
      })
    }
    if (params.q) {
      chips.push({ key: 'q', label: `“${params.q}”`, patch: { q: null } })
    }
    return chips
  }, [params, t])

  const sentinel = useInView<HTMLDivElement>(
    feed.loadMore,
    feed.hasMore && !feed.loadingMore && feed.status === 'ready',
  )

  const title = params.q ? t('feed.resultsFor', { q: params.q }) : t(`channel.${params.channel}.label`)
  const description = params.q
    ? t('feed.searchDescription')
    : t(`channel.${params.channel}.description`)

  function surprise() {
    if (feed.items.length === 0) {
      toast(t('feed.nothingLoaded'), 'info')
      return
    }
    const pick = feed.items[Math.floor(Math.random() * feed.items.length)]
    navigate(repoPath(pick.owner.login, pick.name))
  }

  function resetFilters() {
    apply({ language: null, topic: null, minStars: null, createdWithin: null, q: null, sort: null })
  }

  const resultsLabel = meta
    ? meta.total > 1000
      ? t('feed.resultsCapped', { count: fullNumber(meta.total) })
      : tp('feed.results', meta.total)
    : t('feed.searching')

  return (
    <div className="feed-layout">
      <aside className="filter-rail">
        <FilterPanel params={params} onChange={apply} onNavigateChannel={goChannel} />
      </aside>

      <main className="feed-main">
        <div className="mobile-channel-bar">
          <div className="mobile-channels">
            {CHANNELS.map((item) => (
              <button
                key={item.id}
                className={params.channel === item.id && !params.q ? 'active' : ''}
                style={{ '--channel': item.accent } as React.CSSProperties}
                onClick={() => goChannel(item.id)}
              >
                <ChannelIcon icon={item.icon} size={14} />
                {t(`channel.${item.id}.short`)}
              </button>
            ))}
          </div>
          <button className="filter-trigger" onClick={() => setSheetOpen(true)}>
            <SlidersHorizontal size={15} />
            {t('feed.filters')}
            {activeFilters.length > 0 && <span>{activeFilters.length}</span>}
          </button>
        </div>

        <header className="feed-header">
          <div className="eyebrow">
            {params.q ? t('feed.searchEyebrow') : t('feed.eyebrow')}
            {params.language && <span className="eyebrow-sep">·</span>}
            {params.language && <span>{params.language}</span>}
            {params.topic && <span className="eyebrow-sep">·</span>}
            {params.topic && <span>#{params.topic}</span>}
          </div>
          <div className="feed-heading-row">
            <h1>{title}</h1>
            <button className="discovery-random" onClick={surprise} disabled={!feed.items.length}>
              {t('feed.detour')} <ArrowUpRight size={16} />
            </button>
          </div>
          <p className="feed-description">{description}</p>

          <div className="feed-meta">
            <span className="feed-total">{resultsLabel}</span>
            {meta && (
              <>
                <span className="meta-sep">·</span>
                <span>
                  {t('feed.updated', { time: relativeTime(new Date(meta.fetchedAt).toISOString()) })}
                </span>
                <span className="meta-sep">·</span>
                <span className={`source-inline source-${meta.source}`}>
                  <span className="source-dot" />
                  {t(`feed.source.${meta.source}`)}
                </span>
              </>
            )}
          </div>
        </header>

        <div className="feed-toolbar">
          <div className="feed-toolbar-left">
            {activeFilters.length > 0 ? (
              <div className="active-filters">
                {activeFilters.map((chip) => (
                  <button
                    key={chip.key}
                    className="filter-chip"
                    onClick={() => apply(chip.patch)}
                    title={t('feed.chip.remove', { label: chip.label })}
                    aria-label={t('feed.chip.remove', { label: chip.label })}
                  >
                    {chip.label}
                    <X size={12} />
                  </button>
                ))}
                <button className="clear-filters" onClick={resetFilters}>
                  {t('feed.clearAll')}
                </button>
              </div>
            ) : (
              <span className="toolbar-hint">
                {params.q ? t('feed.searchResults') : t('feed.explore')}
              </span>
            )}
          </div>

          <div className="feed-toolbar-right">
            <label className="sort-select">
              <ArrowUpDown size={13} />
              <select
                value={params.sort}
                onChange={(event) =>
                  apply({ sort: event.target.value === 'best' ? null : event.target.value })
                }
                aria-label={t('feed.sortAria')}
              >
                {SORT_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </label>
            <button
              className="toolbar-btn icon-only"
              onClick={feed.refresh}
              disabled={feed.refreshing}
              title={t('feed.refreshTitle')}
              aria-label={t('feed.refreshAria')}
            >
              <RefreshCw size={14} className={feed.refreshing ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        {feed.error && (
          <div className="alert-card">
            <AlertTriangle size={18} />
            <div className="alert-body">
              <strong>{t('feed.errorTitle')}</strong>
              <p>{feed.error.message}</p>
              {feed.error.reset ? (
                <span className="alert-meta">
                  {t('feed.errorQuota', { time: timeUntil(feed.error.reset) })}
                </span>
              ) : null}
            </div>
            <button onClick={feed.refresh} disabled={feed.refreshing}>
              {t('feed.retry')}
            </button>
          </div>
        )}

        {meta?.note && !feed.error && (
          <div className="notice-card">
            <Info size={15} />
            <span>{meta.note}</span>
          </div>
        )}

        {feed.status === 'loading' && <FeedSkeleton count={6} />}

        {feed.status === 'error' && feed.items.length === 0 && !feed.error && (
          <EmptyState
            icon={<AlertTriangle size={22} />}
            title={t('feed.emptyErrorTitle')}
            description={t('feed.emptyErrorBody')}
            action={
              <button className="btn btn-primary" onClick={feed.refresh}>
                <RefreshCw size={14} /> {t('common.tryAgain')}
              </button>
            }
          />
        )}

        {feed.status === 'ready' && feed.items.length === 0 && (
          <EmptyState
            icon={<SearchX size={22} />}
            title={t('feed.emptyTitle')}
            description={t('feed.emptyBody')}
            action={
              <button className="btn btn-primary" onClick={resetFilters}>
                <Filter size={14} /> {t('feed.resetFilters')}
              </button>
            }
          />
        )}

        {feed.items.length > 0 && (
          <div className="feed-list">
            {feed.items.map((repo, index) => (
              <RepoCard
                key={repo.fullName}
                repo={repo}
                rank={index + 1}
              />
            ))}
          </div>
        )}

        {feed.status === 'ready' && feed.items.length > 0 && (
          <div className="load-more" ref={sentinel}>
            {feed.hasMore ? (
              <button onClick={feed.loadMore} disabled={feed.loadingMore}>
                {feed.loadingMore ? (
                  <>
                    <RefreshCw size={14} className="spinning" /> {t('feed.loadingMore')}
                  </>
                ) : (
                  <>{t('feed.loadMore')}</>
                )}
              </button>
            ) : (
              <span>
                {t('feed.end')} {saved.length > 0 && t('feed.endSaved')}
              </span>
            )}
          </div>
        )}
      </main>

      <FeedAside
        params={params}
        onChange={apply}
      />

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="filter-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={t('feed.sheetAria')} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <FilterPanel
              params={params}
              onChange={apply}
              onNavigateChannel={goChannel}
              onClose={() => setSheetOpen(false)}
              variant="sheet"
            />
            <button className="btn btn-primary sheet-done" onClick={() => setSheetOpen(false)}>
              {t('feed.showProjects', { count: meta ? compactNumber(meta.total) : '' })}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
