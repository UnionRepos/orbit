import { ArrowUpRight, Bookmark, Clock3, Command } from 'lucide-react'
import type { FeedQuery } from '../../shared/types.ts'
import { TOPIC_FILTERS } from '../../shared/languages.ts'
import { useOrbit } from '../context/OrbitContext.tsx'
import { relativeTime } from '../lib/format.ts'
import { navigate, repoPath } from '../lib/router.ts'
import { cacheRepo } from '../lib/repoCache.ts'

interface FeedAsideProps {
  params: FeedQuery
  onChange: (patch: Record<string, string | number | null>) => void
}

export function FeedAside({ params, onChange }: FeedAsideProps) {
  const { saved, recent, openPalette } = useOrbit()

  return (
    <aside className="feed-aside" aria-label="More ways to explore">
      <section className="directory-note">
        <span className="directory-note-mark" aria-hidden="true">↗</span>
        <h2>Made in the open.<br />Worth a closer look.</h2>
        <p>Find your next dependency, weekend project, or place to contribute.</p>
        <a href="#/about">A little about Orbit <ArrowUpRight size={14} /></a>
      </section>

      <section className="rail-card">
        <div className="rail-head">
          <h2 className="section-label">Browse by topic</h2>
          <span className="aside-count">{TOPIC_FILTERS.length}</span>
        </div>
        <div className="rail-topics">
          {TOPIC_FILTERS.map((topic) => (
            <button
              key={topic.id}
              className={`rail-topic ${params.topic === topic.id ? 'active' : ''}`}
              aria-pressed={params.topic === topic.id}
              onClick={() => onChange({ topic: params.topic === topic.id ? null : topic.id })}
            >
              {topic.label}<ArrowUpRight size={13} />
            </button>
          ))}
        </div>
      </section>

      <section className="rail-card reading-card">
        <Bookmark size={20} strokeWidth={1.5} />
        <h2>A list for later.</h2>
        <p>{saved.length ? `${saved.length} saved project${saved.length === 1 ? '' : 's'}, ready when you are.` : 'Keep the projects that catch your eye. Your reading list stays on this device.'}</p>
        <a href="#/saved">Open reading list <ArrowUpRight size={14} /></a>
      </section>

      {recent.length > 0 && (
        <section className="rail-card">
          <div className="rail-head">
            <h2 className="section-label">Recently viewed</h2>
            <Clock3 size={14} className="rail-head-icon" />
          </div>
          <div className="recent-list">
            {recent.slice(0, 3).map((entry) => (
              <button className="recent-item" key={entry.repo.fullName} onClick={() => {
                cacheRepo(entry.repo)
                navigate(repoPath(entry.repo.owner.login, entry.repo.name))
              }}>
                <img src={entry.repo.owner.avatarUrl} alt="" loading="lazy" />
                <span className="recent-name"><strong>{entry.repo.name}</strong><small>{entry.repo.owner.login}</small></span>
                <span className="recent-time">{relativeTime(new Date(entry.viewedAt).toISOString())}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button className="aside-command" onClick={openPalette}>
        <Command size={14} /> Go anywhere <kbd>⌘K</kbd>
      </button>
      <p className="rail-footer">Independent. Open source. <a href="#/about">About Orbit</a></p>
    </aside>
  )
}
