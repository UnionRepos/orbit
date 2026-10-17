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
import { useI18n } from '../i18n/index.ts'
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
  const { t } = useI18n()
  const [showAllLanguages, setShowAllLanguages] = useState(false)
  const languages = showAllLanguages ? LANGUAGES : LANGUAGES.slice(0, 6)
  const rate = health?.rate
  const ratio = rate && rate.limit > 0 ? rate.remaining / rate.limit : 1
  const low = ratio < 0.25

  return (
    <div className={`filter-panel ${variant === 'sheet' ? 'sheet-panel' : ''}`}>
      {variant === 'sheet' && (
        <div className="sheet-head">
          <h2>{t('filter.refine')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('filter.close')}>
            <X size={18} />
          </button>
        </div>
      )}

      <section className="filter-section">
        <div className="section-label">{t('filter.discover')}</div>
        <nav className="channel-nav" aria-label={t('filter.channelsAria')}>
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
                <span className="channel-label">{t(`channel.${channel.id}.label`)}</span>
                {active && <span className="channel-pip" />}
              </button>
            )
          })}
        </nav>
      </section>

      <section className="filter-section">
        <div className="section-label">{t('filter.library')}</div>
        <div className="library-nav">
          <button
            className={`library-btn ${saved.length ? 'has-items' : ''}`}
            onClick={() => {
              navigate('/saved')
              onClose?.()
            }}
          >
            <Bookmark size={15} />
            {t('filter.readingList')}
            <span className="library-count">{saved.length}</span>
          </button>
          <button className="library-btn" onClick={openPalette}>
            <Command size={15} />
            {t('filter.commandMenu')}
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
            {t('filter.how')}
          </button>
        </div>
      </section>

      <section className="filter-section">
        <div className="section-label">{t('filter.language')}</div>
        <div className="language-list">
          <button
            className={`language-btn ${!params.language ? 'active' : ''}`}
            aria-pressed={!params.language}
            onClick={() => onChange({ language: null })}
          >
            <span className="lang-dot all" />
            {t('filter.allLanguages')}
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
            {showAllLanguages ? t('filter.fewer') : t('filter.all', { count: LANGUAGES.length })}
          </button>
        )}
      </section>

      <details className="advanced-filters" key={`${params.minStars}-${params.createdWithin}-${params.topic}`} open={!!(params.minStars || params.createdWithin || params.topic)}>
        <summary>{t('filter.more')} <ChevronDown size={14} /></summary>
        <div className="advanced-filter-content">
      <section className="filter-section">
        <div className="section-label">{t('filter.minStars')}</div>
        <div className="segmented">
          {MIN_STAR_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={params.minStars === option.value ? 'active' : ''}
              onClick={() => onChange({ minStars: option.value || null })}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="filter-section">
        <div className="section-label">{t('filter.created')}</div>
        <div className="segmented wrap">
          {AGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={params.createdWithin === option.value ? 'active' : ''}
              onClick={() => onChange({ createdWithin: option.value || null })}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="filter-section">
        <div className="section-label">{t('filter.topics')}</div>
        <div className="topic-filter-grid">
          {TOPICS.map((topic) => (
            <button
              key={topic.id}
              className={`topic-filter ${params.topic === topic.id ? 'active' : ''}`}
              onClick={() => onChange({ topic: params.topic === topic.id ? null : topic.id })}
            >
              <span className="topic-dot" style={{ background: topic.color }} />
              {t(`topic.${topic.id}.label`)}
            </button>
          ))}
        </div>
      </section>

        </div>
      </details>

      <button className="quota-card" onClick={refreshHealth} title={t('filter.quotaTitle')}>
        <div className="quota-head">
          <span>
            <Activity size={13} /> {t('filter.quota')}
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
            ? t('filter.authenticated')
            : t('filter.quotaFoot', { time: rate ? timeUntil(rate.reset) : '—' })}
        </span>
      </button>
    </div>
  )
}
