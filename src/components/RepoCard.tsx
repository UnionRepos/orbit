import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  GitFork,
  Star,
  TrendingUp,
} from 'lucide-react'
import type { RepoSummary } from '../../shared/types.ts'
import { languageColor } from '../../shared/languages.ts'
import { useOrbit } from '../context/OrbitContext.tsx'
import { compactNumber, relativeTime, starVelocity } from '../lib/format.ts'
import { cacheRepo } from '../lib/repoCache.ts'
import { feedPath, navigate, repoPath, userPath } from '../lib/router.ts'

interface RepoCardProps {
  repo: RepoSummary
  rank?: number
  variant?: 'feed' | 'grid'
}

export function RepoCard({ repo, rank, variant = 'feed' }: RepoCardProps) {
  const { isSaved, toggleSave, toast } = useOrbit()
  const saved = isSaved(repo.fullName)
  const color = languageColor(repo.language)
  const ageDays = (Date.now() - Date.parse(repo.createdAt)) / 86_400_000

  function onSave(event: React.MouseEvent) {
    event.stopPropagation()
    const nowSaved = toggleSave(repo)
    toast(nowSaved ? `Saved ${repo.name} to your reading list` : `Removed ${repo.name}`, nowSaved ? 'success' : 'info')
  }

  function onTopic(event: React.MouseEvent, topic: string) {
    event.stopPropagation()
    navigate(feedPath(new URLSearchParams({ topic })))
  }

  function onOwner(event: React.MouseEvent) {
    event.stopPropagation()
    navigate(userPath(repo.owner.login))
  }

  return (
    <article
      className={`repo-card ${variant === 'grid' ? 'grid-card' : ''}`}
    >
      {rank !== undefined && variant === 'feed' && (
        <span className={`rank ${rank <= 3 ? 'top' : ''}`} aria-hidden="true">
          {String(rank).padStart(2, '0')}
        </span>
      )}

      <div className="card-main">
        <header className="card-head">
          <button className="avatar-btn" onClick={onOwner} title={`View ${repo.owner.login}`} aria-label={`View ${repo.owner.login}`}>
            <img
              src={repo.owner.avatarUrl}
              alt=""
              loading="lazy"
              width={40}
              height={40}
            />
          </button>

          <div className="card-title">
            <button className="owner-link" onClick={onOwner}>
              {repo.owner.login}
            </button>
            <h3>
              <a className="repo-name" href={`#${repoPath(repo.owner.login, repo.name)}`} onClick={() => cacheRepo(repo)}>{repo.name}</a>
              <ExternalButton repo={repo} />
              {repo.archived && <span className="badge badge-muted">Archived</span>}
              {!repo.archived && ageDays < 30 && <span className="badge badge-new">New</span>}
            </h3>
          </div>

          <button
            className={`save-btn ${saved ? 'saved' : ''}`}
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${repo.name} from reading list` : `Save ${repo.name} to reading list`}
            title={saved ? 'Remove from reading list' : 'Save to reading list'}
          >
            {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          </button>
        </header>

        <p className="card-description">
          {repo.description || <span className="muted-italic">No description provided.</span>}
        </p>

        {repo.topics.length > 0 && (
          <div className="topic-row">
            {repo.topics.slice(0, 3).map((topic) => (
              <button className="topic-pill" key={topic} onClick={(event) => onTopic(event, topic)}>
                {topic}
              </button>
            ))}
            {repo.topics.length > 3 && (
              <span className="topic-more">+{repo.topics.length - 3}</span>
            )}
          </div>
        )}

        <footer className="card-footer">
          <div className="card-metrics">
            <span className="metric language" title={repo.language ?? 'Unknown language'}>
              <span className="lang-dot" style={{ background: color }} />
              {repo.language ?? 'Unknown'}
            </span>
            <span className="metric" title={`${repo.stars.toLocaleString()} stars`}>
              <Star size={13} />
              {compactNumber(repo.stars)}
            </span>
            <span className="metric" title={`${repo.forks.toLocaleString()} forks`}>
              <GitFork size={13} />
              {compactNumber(repo.forks)}
            </span>
            <span className="metric hide-small" title={`Last push ${relativeTime(repo.pushedAt)}`}>
              Updated {relativeTime(repo.pushedAt)}
            </span>
          </div>

          <div className="card-trend">
            <span className="velocity" title="Average stars gained per day since the project was created">
              <TrendingUp size={13} />
              {starVelocity(repo.starsPerDay)}
            </span>
          </div>
        </footer>
      </div>
    </article>
  )
}

function ExternalButton({ repo }: { repo: RepoSummary }) {
  return (
    <a
      className="repo-external"
      href={repo.htmlUrl}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(event) => event.stopPropagation()}
      title="Open on GitHub"
      aria-label={`Open ${repo.fullName} on GitHub`}
    >
      <ArrowUpRight size={14} />
    </a>
  )
}
