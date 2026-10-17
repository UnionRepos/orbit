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
import { TranslatedText } from './ImmersiveContent.tsx'
import { useOrbit } from '../context/OrbitContext.tsx'
import { useI18n } from '../i18n/index.ts'
import { compactNumber, fullNumber, relativeTime, starVelocity } from '../lib/format.ts'
import { preloadRepoPage } from '../lib/preload.ts'
import { cacheRepo } from '../lib/repoCache.ts'
import { feedPath, navigate, repoPath, userPath } from '../lib/router.ts'

interface RepoCardProps {
  repo: RepoSummary
  rank?: number
  variant?: 'feed' | 'grid'
}

export function RepoCard({ repo, rank, variant = 'feed' }: RepoCardProps) {
  const { isSaved, toggleSave, toast } = useOrbit()
  const { t } = useI18n()
  const saved = isSaved(repo.fullName)
  const color = languageColor(repo.language)
  const ageDays = (Date.now() - Date.parse(repo.createdAt)) / 86_400_000

  function onSave(event: React.MouseEvent) {
    event.stopPropagation()
    const nowSaved = toggleSave(repo)
    toast(
      nowSaved ? t('card.savedToast', { name: repo.name }) : t('card.removedToast', { name: repo.name }),
      nowSaved ? 'success' : 'info',
    )
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
          <button className="avatar-btn" onClick={onOwner} title={t('card.viewUser', { login: repo.owner.login })} aria-label={t('card.viewUser', { login: repo.owner.login })}>
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
              <a
                className="repo-name"
                href={`#${repoPath(repo.owner.login, repo.name)}`}
                onClick={() => cacheRepo(repo)}
                onPointerEnter={preloadRepoPage}
                onFocus={preloadRepoPage}
              >
                {repo.name}
              </a>
              <ExternalButton repo={repo} />
              {repo.archived && <span className="badge badge-muted">{t('card.archived')}</span>}
              {!repo.archived && ageDays < 30 && <span className="badge badge-new">{t('card.new')}</span>}
            </h3>
          </div>

          <button
            className={`save-btn ${saved ? 'saved' : ''}`}
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? t('card.unsaveAria', { name: repo.name }) : t('card.saveAria', { name: repo.name })}
            title={saved ? t('card.unsaveTitle') : t('card.saveTitle')}
          >
            {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          </button>
        </header>

        {repo.description ? (
          <TranslatedText text={repo.description} className="card-description" />
        ) : (
          <p className="card-description muted-italic">{t('card.noDescription')}</p>
        )}

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
            <span className="metric language" title={repo.language ?? t('common.unknown')}>
              <span className="lang-dot" style={{ background: color }} />
              {repo.language ?? t('common.unknown')}
            </span>
            <span className="metric" title={t('card.starsTitle', { count: fullNumber(repo.stars) })}>
              <Star size={13} />
              {compactNumber(repo.stars)}
            </span>
            <span className="metric" title={t('card.forksTitle', { count: fullNumber(repo.forks) })}>
              <GitFork size={13} />
              {compactNumber(repo.forks)}
            </span>
            <span className="metric hide-small" title={t('card.lastPushTitle', { time: relativeTime(repo.pushedAt) })}>
              {t('card.updated', { time: relativeTime(repo.pushedAt) })}
            </span>
          </div>

          <div className="card-trend">
            <span className="velocity" title={t('card.velocityTitle')}>
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
  const { t } = useI18n()
  return (
    <a
      className="repo-external"
      href={repo.htmlUrl}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(event) => event.stopPropagation()}
      title={t('card.openGithub')}
      aria-label={t('card.openGithubAria', { name: repo.fullName })}
    >
      <ArrowUpRight size={14} />
    </a>
  )
}
