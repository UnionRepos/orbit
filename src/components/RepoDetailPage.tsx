import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Check,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  GitFork,
  Globe,
  ListTree,
  MessageCircle,
  Package,
  Scale,
  Share2,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { FeedQuery, ReadmeResponse, RepoDetail, RepoSummary } from '../../shared/types.ts'
import { languageColor } from '../../shared/languages.ts'
import { getFeed, getReadme, getRepo, type ApiError } from '../lib/api.ts'
import { copyText } from '../lib/clipboard.ts'
import {
  compactNumber,
  dateLabel,
  fullNumber,
  hostname,
  relativeTime,
  starVelocity,
  timeUntil,
} from '../lib/format.ts'
import { renderMarkdown } from '../lib/markdown.ts'
import { cacheRepo, cachedRepo } from '../lib/repoCache.ts'
import { navigate, repoPath, userPath, type Route } from '../lib/router.ts'
import { useOrbit } from '../context/OrbitContext.tsx'
import { useI18n } from '../i18n/index.ts'
import { RepoCard } from './RepoCard.tsx'
import { EmptyState } from './EmptyState.tsx'
import { DetailSkeleton, ReadmeSkeleton } from './Skeletons.tsx'
import { GithubIcon } from './icons.tsx'

export function RepoDetailPage({ route }: { route: Route }) {
  const owner = route.owner ?? ''
  const repoName = route.repo ?? ''
  const fullName = `${owner}/${repoName}`
  const { isSaved, toggleSave, toast, addRecent, saved } = useOrbit()
  const { t } = useI18n()

  const fallback =
    cachedRepo(fullName) ??
    saved.find((entry) => entry.repo.fullName.toLowerCase() === fullName.toLowerCase())?.repo

  const [repo, setRepo] = useState<RepoSummary | null>(fallback ?? null)
  const [detail, setDetail] = useState<RepoDetail | null>(null)
  const [readme, setReadme] = useState<ReadmeResponse | null>(null)
  const [readmeError, setReadmeError] = useState<string | null>(null)
  const [readmeLoading, setReadmeLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(!fallback)
  const [attempt, setAttempt] = useState(0)
  const [similar, setSimilar] = useState<RepoSummary[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const known = cachedRepo(fullName)
    if (known) setRepo(known)
    else setRepo(null)
    if (!known) setLoading(true)
    setError(null)
    setDetail(null)
    setReadme(null)
    setReadmeError(null)
    setReadmeLoading(true)
    setSimilar([])

    getRepo(owner, repoName, controller.signal)
      .then((result) => {
        setDetail(result)
        setRepo(result.repo)
        cacheRepo(result.repo)
        addRecent(result.repo)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (!known) setError(err as ApiError)
        setLoading(false)
      })

    getReadme(owner, repoName, controller.signal)
      .then((result) => setReadme(result))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setReadmeError((err as ApiError).message || t('detail.readmeError'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setReadmeLoading(false)
      })

    return () => controller.abort()
  }, [owner, repoName, attempt, fullName, addRecent, t])

  useEffect(() => {
    document.title = `${repo?.name ?? repoName} · ${owner} · Orbit`
    return () => {
      document.title = t('app.title.feed')
    }
  }, [repo?.name, repoName, owner, t])

  const similarKey = repo?.topics[0] ?? repo?.language ?? ''
  useEffect(() => {
    if (!repo || !similarKey) return
    const controller = new AbortController()
    const qualifier = repo.topics[0] ? `topic:${repo.topics[0]}` : `language:"${repo.language}"`
    const params: FeedQuery = {
      channel: 'trending',
      q: qualifier,
      language: '',
      topic: '',
      minStars: 0,
      createdWithin: 0,
      sort: 'stars',
      page: 1,
      perPage: 6,
    }
    getFeed(params, 1, controller.signal)
      .then((result) => {
        setSimilar(
          result.items
            .filter((item) => item.fullName.toLowerCase() !== repo.fullName.toLowerCase())
            .slice(0, 4),
        )
      })
      .catch(() => setSimilar([]))
    return () => controller.abort()
  }, [repo, similarKey])

  const rendered = useMemo(
    () => (readme ? renderMarkdown(readme.markdown, fullName) : null),
    [readme, fullName],
  )

  const onMarkdownClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (href?.startsWith('#')) {
      event.preventDefault()
      const id = decodeURIComponent(href.slice(1))
      const element = document.getElementById(id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [])

  if (loading && !repo) return <DetailSkeleton />

  if (!repo) {
    return (
      <div className="page-narrow">
        <button className="back-link" onClick={() => navigate('/')}>
          <ArrowLeft size={15} /> {t('common.back')}
        </button>
        <EmptyState
          icon={<AlertTriangle size={22} />}
          title={t('detail.notFoundTitle')}
          description={
            error
              ? error.reset
                ? t('detail.notFoundQuota', { message: error.message, time: timeUntil(error.reset) })
                : error.message
              : t('detail.notFoundBody')
          }
          action={
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => setAttempt((value) => value + 1)}>
                {t('common.tryAgain')}
              </button>
              <button className="btn" onClick={() => navigate('/')}>
                {t('detail.exploreElsewhere')}
              </button>
            </div>
          }
        />
      </div>
    )
  }

  const savedNow = isSaved(repo.fullName)
  const color = languageColor(repo.language)
  const languages = detail?.languages ?? []
  const contributors = detail?.contributors ?? []
  const releases = detail?.releases ?? []

  const saveRepo = () => {
    const now = toggleSave(repo)
    toast(now ? t('detail.savedToast') : t('detail.unsavedToast'), now ? 'success' : 'info')
  }

  const copyShare = async () => {
    const ok = await copyText(repo.htmlUrl)
    toast(ok ? t('detail.linkCopied') : t('detail.copyLinkFailed'), ok ? 'success' : 'error')
  }

  const stats = [
    {
      icon: <Star size={15} />,
      label: t('detail.statStars'),
      value: fullNumber(repo.stars),
      hint: t('detail.statVelocity', { velocity: starVelocity(repo.starsPerDay) }),
    },
    {
      icon: <GitFork size={15} />,
      label: t('detail.statForks'),
      value: compactNumber(repo.forks),
      hint:
        repo.stars > 0
          ? t('detail.statForksHint', { percent: Math.round((repo.forks / repo.stars) * 100) })
          : '—',
    },
    {
      icon: <MessageCircle size={15} />,
      label: t('detail.statIssues'),
      value: compactNumber(repo.openIssues),
      hint: t('detail.statIssuesHint'),
    },
    {
      icon: <Eye size={15} />,
      label: t('detail.statWatchers'),
      value: compactNumber(repo.watchers),
      hint: t('detail.statWatchersHint'),
    },
    {
      icon: <CalendarDays size={15} />,
      label: t('detail.statCreated'),
      value: dateLabel(repo.createdAt),
      hint: relativeTime(repo.createdAt),
    },
    {
      icon: <Clock3 size={15} />,
      label: t('detail.statPushed'),
      value: relativeTime(repo.pushedAt),
      hint: dateLabel(repo.pushedAt),
    },
  ]

  return (
    <div className="detail-page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} /> {t('common.back')}
      </button>

      <section className="repo-hero">
        <div className="hero-top">
          <img className="hero-avatar" src={repo.owner.avatarUrl} alt={t('detail.avatarAlt', { login: owner })} />
          <div className="hero-title">
            <button className="hero-owner" onClick={() => navigate(userPath(repo.owner.login))}>
              {repo.owner.login}
              <ArrowUpRight size={12} />
            </button>
            <h1>{repo.name}</h1>
          </div>
          <div className="hero-top-actions">
            <span className={`source-pill source-${detail?.source ?? 'live'}`}>
              <span className="source-dot" />
              {detail?.source === 'live' ? t('detail.live') : detail?.source ?? 'GitHub'}
            </span>
            <a className="btn btn-ghost" href={repo.htmlUrl} target="_blank" rel="noreferrer">
              <GithubIcon size={15} />
              GitHub
              <ArrowUpRight size={13} />
            </a>
          </div>
        </div>

        <p className="hero-description">
          {repo.description || t('detail.descriptionMissing')}
        </p>

        {repo.topics.length > 0 && (
          <div className="hero-topics">
            {repo.topics.map((topic) => (
              <button
                key={topic}
                className="topic-pill"
                onClick={() =>
                  navigate(`/?topic=${encodeURIComponent(topic)}`)
                }
              >
                {topic}
              </button>
            ))}
          </div>
        )}

        <div className="hero-actions">
          <a className="btn btn-primary" href={repo.htmlUrl} target="_blank" rel="noreferrer">
            <Star size={15} /> {t('detail.star')}
          </a>
          <button className={`btn ${savedNow ? 'btn-saved' : ''}`} onClick={saveRepo}>
            {savedNow ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            {savedNow ? t('detail.saved') : t('detail.save')}
          </button>
          {repo.homepage && (
            <a
              className="btn"
              href={repo.homepage.startsWith('http') ? repo.homepage : `https://${repo.homepage}`}
              target="_blank"
              rel="noreferrer"
            >
              <Globe size={15} />
              {hostname(repo.homepage)}
              <ArrowUpRight size={12} />
            </a>
          )}
          <button className="btn icon-only" onClick={copyShare} title={t('detail.copyLink')}>
            <Share2 size={15} />
          </button>
        </div>

        <div className="momentum-row">
          <span className="momentum-chip">
            <TrendingUp size={13} /> {starVelocity(repo.starsPerDay)}
          </span>
          <span className="momentum-copy">{t('detail.velocityCopy')}</span>
          <span className="momentum-meter">
            <span style={{ width: `${repo.heat}%` }} />
          </span>
          <span className="momentum-score">{repo.heat}<small>{t('detail.momentum')}</small></span>
        </div>
      </section>

      <section className="stat-grid">
        {stats.map((stat) => (
          <div className="stat-tile" key={stat.label}>
            <span className="stat-icon">{stat.icon}</span>
            <span className="stat-label">{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.hint}</small>
          </div>
        ))}
      </section>

      {detail?.partial && (
        <div className="notice-card">
          <AlertTriangle size={15} />
          <span>{t('detail.partial')}</span>
        </div>
      )}

      <div className="detail-body">
        <div className="readme-column">
          <section className="readme-card">
            <header className="readme-head">
              <span className="readme-file">
                <FileText size={15} />
                {readme?.path ?? t('detail.readme')}
              </span>
              {readme && (
                <span className="readme-size">
                  {t('detail.words', { count: compactNumber(readme.markdown.split(/\s+/).length) })}
                </span>
              )}
              <div className="readme-actions">
                {readme && (
                  <button
                    className="icon-btn"
                    title={t('detail.copyRaw')}
                    onClick={async () => {
                      const ok = await copyText(readme.markdown)
                      toast(ok ? t('detail.rawCopied') : t('detail.copyFailed'), ok ? 'success' : 'error')
                    }}
                  >
                    <Copy size={14} />
                  </button>
                )}
                <a
                  className="icon-btn"
                  href={readme?.htmlUrl ?? `${repo.htmlUrl}#readme`}
                  target="_blank"
                  rel="noreferrer"
                  title={t('detail.viewReadme')}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </header>

            {readmeLoading && <ReadmeSkeleton />}

            {!readmeLoading && readmeError && (
              <div className="readme-error">
                <FileText size={20} />
                <div>
                  <strong>{t('detail.readmeUnavailable')}</strong>
                  <p>{readmeError}</p>
                </div>
                <a className="btn" href={`${repo.htmlUrl}#readme`} target="_blank" rel="noreferrer">
                  {t('detail.readOnGithub')} <ArrowUpRight size={13} />
                </a>
              </div>
            )}

            {!readmeLoading && rendered && (
              <div
                className="markdown-body"
                onClick={onMarkdownClick}
                // markdown-it is configured with html:false, so raw HTML is never passed through.
                dangerouslySetInnerHTML={{ __html: rendered.html }}
              />
            )}
          </section>

          {similar.length > 0 && (
            <section className="similar-section">
              <div className="similar-head">
                <h2>
                  <Sparkles size={16} /> {t('detail.related')}
                </h2>
                <button
                  className="link-btn"
                  onClick={() =>
                    navigate(
                      repo.topics[0]
                        ? `/?topic=${encodeURIComponent(repo.topics[0])}`
                        : '/',
                    )
                  }
                >
                  {t('detail.exploreTopic')} <ArrowUpRight size={13} />
                </button>
              </div>
              <div className="similar-grid">
                {similar.map((item) => (
                  <RepoCard key={item.fullName} repo={item} variant="grid" />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="detail-aside">
          {rendered && rendered.toc.filter((item) => item.level <= 3).length > 1 && (
            <section className="aside-card toc-card">
              <h2 className="aside-title">
                <ListTree size={14} /> {t('detail.toc')}
              </h2>
              <nav className="toc">
                {rendered.toc
                  .filter((item) => item.level <= 3)
                  .slice(0, 14)
                  .map((item) => (
                    <button
                      key={item.id}
                      className={`toc-link level-${item.level}`}
                      onClick={() => {
                        document.getElementById(item.id)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        })
                      }}
                    >
                      {item.text}
                    </button>
                  ))}
              </nav>
            </section>
          )}

          <section className="aside-card">
            <h2 className="aside-title">
              <GithubIcon size={14} /> {t('detail.about')}
            </h2>
            <div className="owner-row">
              <img src={repo.owner.avatarUrl} alt="" loading="lazy" />
              <div>
                <button onClick={() => navigate(userPath(repo.owner.login))}>
                  {repo.owner.login}
                </button>
                <small>{repo.owner.type}</small>
              </div>
              <button
                className="owner-view"
                onClick={() => navigate(userPath(repo.owner.login))}
                title={t('detail.viewProfile')}
              >
                <ArrowUpRight size={14} />
              </button>
            </div>
            <dl className="meta-list">
              {repo.license && (
                <div>
                  <dt><Scale size={13} /> {t('detail.license')}</dt>
                  <dd>{repo.license}</dd>
                </div>
              )}
              <div>
                <dt><Code2 size={13} /> {t('detail.language')}</dt>
                <dd>
                  <span className="lang-dot" style={{ background: color }} />
                  {repo.language ?? t('common.unknown')}
                </dd>
              </div>
              <div>
                <dt><Package size={13} /> {t('detail.size')}</dt>
                <dd>{compactNumber(repo.size)} KB</dd>
              </div>
              <div>
                <dt><CalendarDays size={13} /> {t('detail.created')}</dt>
                <dd>{dateLabel(repo.createdAt)}</dd>
              </div>
              <div>
                <dt><Clock3 size={13} /> {t('detail.updated')}</dt>
                <dd>{relativeTime(repo.updatedAt)}</dd>
              </div>
              {repo.homepage && (
                <div>
                  <dt><Globe size={13} /> {t('detail.homepage')}</dt>
                  <dd>
                    <a href={repo.homepage.startsWith('http') ? repo.homepage : `https://${repo.homepage}`} target="_blank" rel="noreferrer">
                      {hostname(repo.homepage)}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            <div className="quick-links">
              <a href={`${repo.htmlUrl}/issues`} target="_blank" rel="noreferrer">
                {t('detail.issues')} <ArrowUpRight size={12} />
              </a>
              <a href={`${repo.htmlUrl}/pulls`} target="_blank" rel="noreferrer">
                {t('detail.pulls')} <ArrowUpRight size={12} />
              </a>
              <a href={`${repo.htmlUrl}/releases`} target="_blank" rel="noreferrer">
                {t('detail.releases')} <ArrowUpRight size={12} />
              </a>
            </div>
          </section>

          {languages.length > 0 && (
            <section className="aside-card">
              <h2 className="aside-title">
                <Code2 size={14} /> {t('detail.languages')}
              </h2>
              <div className="language-bar">
                {languages.slice(0, 8).map((language) => (
                  <span
                    key={language.name}
                    style={{ background: language.color, width: `${Math.max(language.percent, 1.5)}%` }}
                    title={`${language.name} ${language.percent}%`}
                  />
                ))}
              </div>
              <ul className="language-legend">
                {languages.slice(0, 6).map((language) => (
                  <li key={language.name}>
                    <span className="lang-dot" style={{ background: language.color }} />
                    <span>{language.name}</span>
                    <strong>{language.percent}%</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {contributors.length > 0 && (
            <section className="aside-card">
              <h2 className="aside-title">
                <Users size={14} /> {t('detail.contributors')}
              </h2>
              <div className="contributor-grid">
                {contributors.slice(0, 12).map((contributor) => (
                  <a
                    key={contributor.login}
                    href={contributor.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={t('detail.contributions', {
                      login: contributor.login,
                      count: contributor.contributions,
                    })}
                  >
                    <img src={contributor.avatarUrl} alt={contributor.login} loading="lazy" />
                  </a>
                ))}
              </div>
              <a
                className="aside-link"
                href={`${repo.htmlUrl}/graphs/contributors`}
                target="_blank"
                rel="noreferrer"
              >
                {t('detail.allContributors')} <ArrowUpRight size={12} />
              </a>
            </section>
          )}

          <section className="aside-card">
            <h2 className="aside-title">
              <Tag size={14} /> {t('detail.releases')}
            </h2>
            {releases.length > 0 ? (
              <ul className="release-list">
                {releases.slice(0, 4).map((release) => (
                  <li key={release.tagName}>
                    <a href={release.htmlUrl} target="_blank" rel="noreferrer">
                      <span className="release-tag">
                        <Tag size={11} /> {release.tagName}
                      </span>
                      <span className="release-name">{release.name}</span>
                      <span className="release-meta">
                        {relativeTime(release.publishedAt)}
                        {release.prerelease && <em>{t('detail.preRelease')}</em>}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="aside-empty">{t('detail.noReleases')}</p>
            )}
          </section>

          <button
            className="aside-cta"
            onClick={() => navigate(repoPath(repo.owner.login, repo.name))}
          >
            <Check size={14} /> {t('detail.viewing')}
          </button>
        </aside>
      </div>
    </div>
  )
}
