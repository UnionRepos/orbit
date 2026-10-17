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
import { CHANNELS, channelMeta } from '../../shared/channels.ts'
import { useOrbit } from '../context/OrbitContext.tsx'
import { useFeed } from '../hooks/useFeed.ts'
import { useDialogFocus, useInView } from '../hooks/useUtils.ts'
import { feedParamsFromRoute, patchFeedQuery, SORT_OPTIONS } from '../lib/feed.ts'
import { compactNumber, fullNumber, relativeTime, timeUntil } from '../lib/format.ts'
import { feedPath, navigate, repoPath, type Route } from '../lib/router.ts'
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
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetRef = useDialogFocus<HTMLDivElement>(sheetOpen)
  const meta = feed.meta
  const channel = channelMeta(params.channel)

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
      navigate(feedPath(next), { replace: true, scroll: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
        label: `${compactNumber(params.minStars)}+ stars`,
        patch: { minStars: null },
      })
    }
    if (params.createdWithin) {
      chips.push({
        key: 'createdWithin',
        label: `created in ${params.createdWithin}d`,
        patch: { createdWithin: null },
      })
    }
    if (params.q) {
      chips.push({ key: 'q', label: `“${params.q}”`, patch: { q: null } })
    }
    return chips
  }, [params])

  const sentinel = useInView<HTMLDivElement>(
    feed.loadMore,
    feed.hasMore && !feed.loadingMore && feed.status === 'ready',
  )

  const title = params.q ? `Results for “${params.q}”` : channel.label
  const description = params.q
    ? 'Repositories matching your search. Narrow the results with language and topic filters.'
    : channel.description

  function surprise() {
    if (feed.items.length === 0) {
      toast('Nothing loaded yet — give the feed a moment.', 'info')
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
      ? `${fullNumber(meta.total)} projects (first 1,000 searchable)`
      : `${fullNumber(meta.total)} project${meta.total === 1 ? '' : 's'}`
    : 'Searching GitHub…'

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
                {item.short}
              </button>
            ))}
          </div>
          <button className="filter-trigger" onClick={() => setSheetOpen(true)}>
            <SlidersHorizontal size={15} />
            Filters
            {activeFilters.length > 0 && <span>{activeFilters.length}</span>}
          </button>
        </div>

        <header className="feed-header">
          <div className="eyebrow">
            {params.q ? 'Search' : 'The open-source directory'}
            {params.language && <span className="eyebrow-sep">·</span>}
            {params.language && <span>{params.language}</span>}
            {params.topic && <span className="eyebrow-sep">·</span>}
            {params.topic && <span>#{params.topic}</span>}
          </div>
          <div className="feed-heading-row">
            <h1>{title}</h1>
            <button className="discovery-random" onClick={surprise} disabled={!feed.items.length}>
              Take a detour <ArrowUpRight size={16} />
            </button>
          </div>
          <p className="feed-description">{description}</p>

          <div className="feed-meta">
            <span className="feed-total">{resultsLabel}</span>
            {meta && (
              <>
                <span className="meta-sep">·</span>
                <span>
                  updated {relativeTime(new Date(meta.fetchedAt).toISOString())}
                </span>
                <span className="meta-sep">·</span>
                <span className={`source-inline source-${meta.source}`}>
                  <span className="source-dot" />
                  {{ live: 'Live from GitHub', cache: 'Cached results', stale: 'Offline snapshot', seed: 'Curated collection' }[meta.source]}
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
                    title={`Remove ${chip.label} filter`}
                    aria-label={`Remove ${chip.label} filter`}
                  >
                    {chip.label}
                    <X size={12} />
                  </button>
                ))}
                <button className="clear-filters" onClick={resetFilters}>
                  Clear all
                </button>
              </div>
            ) : (
              <span className="toolbar-hint">
                {params.q ? 'Search results' : 'Explore repositories'}
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
                aria-label="Sort projects"
              >
                {SORT_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </label>
            <button
              className="toolbar-btn icon-only"
              onClick={feed.refresh}
              disabled={feed.refreshing}
              title="Refresh this feed"
              aria-label="Refresh feed"
            >
              <RefreshCw size={14} className={feed.refreshing ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        {feed.error && (
          <div className="alert-card">
            <AlertTriangle size={18} />
            <div className="alert-body">
              <strong>GitHub is temporarily unavailable</strong>
              <p>{feed.error.message}</p>
              {feed.error.reset ? (
                <span className="alert-meta">
                  Quota resets in about {timeUntil(feed.error.reset)}. Cached and curated results
                  stay available.
                </span>
              ) : null}
            </div>
            <button onClick={feed.refresh} disabled={feed.refreshing}>
              Retry
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
            title="The feed could not load"
            description="Something interrupted the GitHub request. Try again or revisit a saved project."
            action={
              <button className="btn btn-primary" onClick={feed.refresh}>
                <RefreshCw size={14} /> Try again
              </button>
            }
          />
        )}

        {feed.status === 'ready' && feed.items.length === 0 && (
          <EmptyState
            icon={<SearchX size={22} />}
            title="No projects match this combination"
            description="Loosen the star count, pick a different language, or clear the topics to cast a wider net."
            action={
              <button className="btn btn-primary" onClick={resetFilters}>
                <Filter size={14} /> Reset filters
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
                    <RefreshCw size={14} className="spinning" /> Loading more projects…
                  </>
                ) : (
                  <>Load more projects</>
                )}
              </button>
            ) : (
              <span>
                You’ve reached the end of this feed. {saved.length > 0 && 'Your reading list is waiting.'}
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
          <div className="filter-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label="Filter projects" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <FilterPanel
              params={params}
              onChange={apply}
              onNavigateChannel={goChannel}
              onClose={() => setSheetOpen(false)}
              variant="sheet"
            />
            <button className="btn btn-primary sheet-done" onClick={() => setSheetOpen(false)}>
              Show {meta ? compactNumber(meta.total) : ''} projects
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
