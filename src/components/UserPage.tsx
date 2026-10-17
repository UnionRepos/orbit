import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Building2,
  CalendarDays,
  Link2,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react'
import type { UserProfile, UserResponse } from '../../shared/types.ts'
import { getUser, type ApiError } from '../lib/api.ts'
import { useI18n } from '../i18n/index.ts'
import { compactNumber, dateLabel, monthYear } from '../lib/format.ts'
import { cacheRepos } from '../lib/repoCache.ts'
import { navigate, userPath, type Route } from '../lib/router.ts'
import { EmptyState } from './EmptyState.tsx'
import { RepoCard } from './RepoCard.tsx'
import { GithubIcon } from './icons.tsx'

export function UserPage({ route }: { route: Route }) {
  const login = route.login ?? ''
  const [data, setData] = useState<UserResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const { t } = useI18n()

  useEffect(() => {
    if (!login) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    getUser(login, controller.signal)
      .then((result) => {
        setData(result)
        cacheRepos(result.repos)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err as ApiError)
        setLoading(false)
      })
    return () => controller.abort()
  }, [login, attempt])

  useEffect(() => {
    if (!login) return
    document.title = `${login} · Orbit`
    return () => {
      document.title = t('app.title.feed')
    }
  }, [login, t])

  if (loading) {
    return (
      <div className="profile-page">
        <div className="skeleton skeleton-line w-20" />
        <div className="skeleton skeleton-profile" />
        <div className="profile-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="skeleton skeleton-repo" key={index} />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="page-narrow">
        <button className="back-link" onClick={() => navigate('/')}>
          <ArrowLeft size={15} /> {t('common.back')}
        </button>
        <EmptyState
          icon={<AlertTriangle size={22} />}
          title={t('user.loadFailed', { login })}
          description={error?.message ?? t('user.unavailable')}
          action={
            <button className="btn btn-primary" onClick={() => setAttempt((value) => value + 1)}>
              <RefreshCw size={14} /> {t('common.tryAgain')}
            </button>
          }
        />
      </div>
    )
  }

  const user = data.user
  const totalStars = data.repos.reduce((sum, repo) => sum + repo.stars, 0)

  return (
    <div className="profile-page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} /> {t('common.back')}
      </button>

      <section className="profile-hero">
        <span className="profile-glow" aria-hidden="true" />
        <img className="profile-avatar" src={user.avatarUrl} alt={t('user.avatarAlt', { login: user.login })} />
        <div className="profile-main">
          <div className="profile-eyebrow">
            {user.type === 'Organization' ? t('user.eyebrowOrg') : t('user.eyebrowDev')}
          </div>
          <h1>{user.name ?? user.login}</h1>
          <button className="profile-login" onClick={() => navigate(userPath(user.login))}>
            @{user.login}
          </button>
          {user.bio && <p className="profile-bio">{user.bio}</p>}

          <div className="profile-badges">
            {user.company && (
              <span>
                <Building2 size={13} /> {user.company}
              </span>
            )}
            {user.location && (
              <span>
                <MapPin size={13} /> {user.location}
              </span>
            )}
            {user.blog && (
              <a
                href={user.blog.startsWith('http') ? user.blog : `https://${user.blog}`}
                target="_blank"
                rel="noreferrer"
              >
                <Link2 size={13} /> {user.blog.replace(/^https?:\/\//, '')}
              </a>
            )}
            {user.twitter && (
              <a
                href={`https://twitter.com/${user.twitter}`}
                target="_blank"
                rel="noreferrer"
              >
                <AtSign size={13} /> @{user.twitter}
              </a>
            )}
            <span>
              <CalendarDays size={13} /> {t('user.joined', { date: monthYear(user.createdAt) })}
            </span>
          </div>
        </div>

        <div className="profile-actions">
          <a className="btn btn-primary" href={user.htmlUrl} target="_blank" rel="noreferrer">
            <GithubIcon size={15} /> {t('user.follow')}
          </a>
          <button className="btn" onClick={() => navigate('/')}>
            {t('user.keepBrowsing')}
          </button>
        </div>
      </section>

      <section className="profile-stats">
        <div>
          <strong>{compactNumber(user.followers)}</strong>
          <span>{t('user.statFollowers')}</span>
        </div>
        <div>
          <strong>{compactNumber(user.following)}</strong>
          <span>{t('user.statFollowing')}</span>
        </div>
        <div>
          <strong>{compactNumber(user.publicRepos)}</strong>
          <span>{t('user.statRepos')}</span>
        </div>
        <div>
          <strong>{compactNumber(totalStars)}</strong>
          <span>{t('user.statStars')}</span>
        </div>
        <div>
          <strong>{dateLabel(user.createdAt)}</strong>
          <span>{t('user.statJoined')}</span>
        </div>
      </section>

      <section className="profile-repos">
        <div className="profile-section-head">
          <h2>
            <Sparkles size={16} /> {t('user.popular')}
          </h2>
          <span>
            <Users size={13} /> {t('user.strongest')}
          </span>
        </div>

        {data.repos.length > 0 ? (
          <div className="profile-grid">
            {data.repos.map((repo) => (
              <RepoCard key={repo.fullName} repo={repo} variant="grid" />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<GithubIcon size={22} />}
            title={t('user.emptyTitle')}
            description={t('user.emptyBody', { login: user.login })}
            action={
              <a className="btn" href={user.htmlUrl} target="_blank" rel="noreferrer">
                {t('user.visit')} <ArrowUpRight size={13} />
              </a>
            }
          />
        )}
      </section>

      <p className="profile-source">
        {data.source === 'live' ? t('user.sourceLive') : t('user.sourceCached')}
      </p>
    </div>
  )
}

export type { UserProfile }
