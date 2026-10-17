import { useState } from 'react'
import {
  Activity,
  Bookmark,
  Flame,
  Gem,
  HeartHandshake,
  Info,
  Command,
  ChevronDown,
  Star,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import type { ChannelId, FeedQuery } from '../../shared/types.ts'
import { CHANNELS } from '../../shared/channels.ts'
import { LANGUAGE_FILTERS, TOPIC_FILTERS, languageColor } from '../../shared/languages.ts'
import { useOrbit } from '../context/OrbitContext.tsx'
import { AGE_OPTIONS, MIN_STAR_OPTIONS } from '../lib/feed.ts'
import { timeUntil } from '../lib/format.ts'
import { navigate } from '../lib/router.ts'

const LANGUAGES = [...new Set(LANGUAGE_FILTERS)]
const TOPICS = TOPIC_FILTERS.slice(0, 8)

export function ChannelIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  switch (icon) {
    case 'flame':
      return <Flame size={size} />
    case 'trending':
      return <TrendingUp size={size} />
    case 'zap':
      return <Zap size={size} />
    case 'gem':
      return <Gem size={size} />
    case 'heart':
      return <HeartHandshake size={size} />
    default:
      return <Star size={size} />
  }
}

interface FilterPanelProps {
  params: FeedQuery
  onChange: (patch: Record<string, string | number | null>) => void
  onNavigateChannel: (channel: ChannelId) => void
  onClose?: () => void
  variant?: 'rail' | 'sheet'
}

export function FilterPanel({
  params,
  onChange,
  onNavigateChannel,
  onClose,
  variant = 'rail',
}: FilterPanelProps) {
  const { saved, health, refreshHealth, openPalette } = useOrbit()
  const [showAllLanguages, setShowAllLanguages] = useState(false)
  const languages = showAllLanguages ? LANGUAGES : LANGUAGES.slice(0, 6)
  const rate = health?.rate
  const ratio = rate && rate.limit > 0 ? rate.remaining / rate.limit : 1
  const low = ratio < 0.25

  return (
    <div className={`filter-panel ${variant === 'sheet' ? 'sheet-panel' : ''}`}>
      {variant === 'sheet' && (
        <div className="sheet-head">
          <h2>Refine the feed</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close filters">
            <X size={18} />
          </button>
        </div>
      )}

      <section className="filter-section">
        <div className="section-label">Discover</div>
        <nav className="channel-nav" aria-label="Discovery channels">
          {CHANNELS.map((channel) => {
            const active = params.channel === channel.id && !params.q
            return (
              <button
                key={channel.id}
                className={`channel-btn ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                style={{ '--channel': channel.accent } as React.CSSProperties}
                onClick={() => {
                  onNavigateChannel(channel.id)
                  onClose?.()
                }}
              >
                <span className="channel-icon">
                  <ChannelIcon icon={channel.icon} />
                </span>
                <span className="channel-label">{channel.label}</span>
                {active && <span className="channel-pip" />}
              </button>
            )
          })}
        </nav>
      </section>

      <section className="filter-section">
        <div className="section-label">Library</div>
        <div className="library-nav">
          <button
            className={`library-btn ${saved.length ? 'has-items' : ''}`}
            onClick={() => {
              navigate('/saved')
              onClose?.()
            }}
          >
            <Bookmark size={15} />
            Reading list
            <span className="library-count">{saved.length}</span>
          </button>
          <button className="library-btn" onClick={openPalette}>
            <Command size={15} />
            Command menu
            <kbd>⌘K</kbd>
          </button>
          <button
            className="library-btn"
            onClick={() => {
              navigate('/about')
              onClose?.()
            }}
          >
            <Info size={15} />
            How Orbit works
          </button>
        </div>
      </section>

      <section className="filter-section">
        <div className="section-label">Language</div>
        <div className="language-list">
          <button
            className={`language-btn ${!params.language ? 'active' : ''}`}
            aria-pressed={!params.language}
            onClick={() => onChange({ language: null })}
          >
            <span className="lang-dot all" />
            All languages
          </button>
          {languages.map((language) => (
            <button
              key={language}
              className={`language-btn ${params.language === language ? 'active' : ''}`}
              aria-pressed={params.language === language}
              onClick={() =>
                onChange({ language: params.language === language ? null : language })
              }
            >
              <span className="lang-dot" style={{ background: languageColor(language) }} />
              {language}
            </button>
          ))}
        </div>
        {LANGUAGES.length > 6 && (
          <button
            className="show-more"
            aria-expanded={showAllLanguages}
            onClick={() => setShowAllLanguages((value) => !value)}
          >
            {showAllLanguages ? 'Show fewer' : `Show all ${LANGUAGES.length}`}
          </button>
        )}
      </section>

      <details className="advanced-filters" key={`${params.minStars}-${params.createdWithin}-${params.topic}`} open={!!(params.minStars || params.createdWithin || params.topic)}>
        <summary>More filters <ChevronDown size={14} /></summary>
        <div className="advanced-filter-content">
      <section className="filter-section">
        <div className="section-label">Minimum stars</div>
        <div className="segmented">
          {MIN_STAR_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={params.minStars === option.value ? 'active' : ''}
              onClick={() => onChange({ minStars: option.value || null })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="filter-section">
        <div className="section-label">Created</div>
        <div className="segmented wrap">
          {AGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={params.createdWithin === option.value ? 'active' : ''}
              onClick={() => onChange({ createdWithin: option.value || null })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="filter-section">
        <div className="section-label">Topics</div>
        <div className="topic-filter-grid">
          {TOPICS.map((topic) => (
            <button
              key={topic.id}
              className={`topic-filter ${params.topic === topic.id ? 'active' : ''}`}
              onClick={() => onChange({ topic: params.topic === topic.id ? null : topic.id })}
            >
              <span className="topic-dot" style={{ background: topic.color }} />
              {topic.label}
            </button>
          ))}
        </div>
      </section>

        </div>
      </details>

      <button className="quota-card" onClick={refreshHealth} title="Refresh API quota">
        <div className="quota-head">
          <span>
            <Activity size={13} /> GitHub quota
          </span>
          <span className={low ? 'quota-low' : ''}>
            {rate ? `${rate.remaining}/${rate.limit}` : '…'}
          </span>
        </div>
        <span className="quota-bar">
          <span
            className={low ? 'low' : ''}
            style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }}
          />
        </span>
        <span className="quota-foot">
          {health?.hasToken
            ? 'Authenticated with GitHub'
            : `Resets in ${rate ? timeUntil(rate.reset) : '—'} · add a token for 5,000/h`}
        </span>
      </button>
    </div>
  )
}
