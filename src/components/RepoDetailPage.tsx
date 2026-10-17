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
import { RepoCard } from './RepoCard.tsx'
import { EmptyState } from './EmptyState.tsx'
import { DetailSkeleton, ReadmeSkeleton } from './Skeletons.tsx'
import { GithubIcon } from './icons.tsx'

export function RepoDetailPage({ route }: { route: Route }) {
  const owner = route.owner ?? ''
  const repoName = route.repo ?? ''
  const fullName = `${owner}/${repoName}`
  const { isSaved, toggleSave, toast, addRecent, saved } = useOrbit()

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
        setReadmeError((err as ApiError).message || 'The README could not be loaded.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setReadmeLoading(false)
      })

    return () => controller.abort()
  }, [owner, repoName, attempt, fullName, addRecent])

  useEffect(() => {
    document.title = `${repo?.name ?? repoName} · ${owner} · Orbit`
    return () => {
      document.title = 'Orbit — open source, in motion'
    }
  }, [repo?.name, repoName, owner])

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
          <ArrowLeft size={15} /> Back to discover
        </button>
        <EmptyState
          icon={<AlertTriangle size={22} />}
          title="This repository is out of reach"
          description={
            error
              ? `${error.message}${error.reset ? ` The GitHub quota resets in about ${timeUntil(error.reset)}.` : ''}`
              : 'The project may have been renamed, deleted or made private.'
          }
          action={
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => setAttempt((value) => value + 1)}>
                Try again
              </button>
              <button className="btn" onClick={() => navigate('/')}>
                Explore something else
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
    toast(now ? 'Saved to your reading list' : 'Removed from your reading list', now ? 'success' : 'info')
  }

  const copyShare = async () => {
    const ok = await copyText(repo.htmlUrl)
    toast(ok ? 'Repository link copied' : 'Could not copy the link', ok ? 'success' : 'error')
  }

  const stats = [
    {
      icon: <Star size={15} />,
      label: 'Stars',
      value: fullNumber(repo.stars),
      hint: `${starVelocity(repo.starsPerDay)} avg`,
    },
    {
      icon: <GitFork size={15} />,
      label: 'Forks',
      value: compactNumber(repo.forks),
      hint: repo.stars > 0 ? `${Math.round((repo.forks / repo.stars) * 100)}% of stars` : '—',
    },
    {
      icon: <MessageCircle size={15} />,
      label: 'Open issues',
      value: compactNumber(repo.openIssues),
      hint: 'community queue',
    },
    {
      icon: <Eye size={15} />,
      label: 'Watchers',
      value: compactNumber(repo.watchers),
      hint: 'following updates',
    },
    {
      icon: <CalendarDays size={15} />,
      label: 'Created',
      value: dateLabel(repo.createdAt),
      hint: relativeTime(repo.createdAt),
    },
    {
      icon: <Clock3 size={15} />,
      label: 'Last push',
      value: relativeTime(repo.pushedAt),
      hint: dateLabel(repo.pushedAt),
    },
  ]

  return (
    <div className="detail-page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} /> Back to discover
      </button>

      <section className="repo-hero">
        <div className="hero-top">
          <img className="hero-avatar" src={repo.owner.avatarUrl} alt={`${owner} avatar`} />
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
              {detail?.source === 'live' ? 'Live' : detail?.source ?? 'GitHub'}
            </span>
            <a className="btn btn-ghost" href={repo.htmlUrl} target="_blank" rel="noreferrer">
              <GithubIcon size={15} />
              GitHub
              <ArrowUpRight size={13} />
            </a>
          </div>
        </div>

        <p className="hero-description">
          {repo.description || 'This project has not written a description yet.'}
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
            <Star size={15} /> Star on GitHub
          </a>
          <button className={`btn ${savedNow ? 'btn-saved' : ''}`} onClick={saveRepo}>
            {savedNow ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            {savedNow ? 'Saved' : 'Save'}
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
          <button className="btn icon-only" onClick={copyShare} title="Copy repository link">
            <Share2 size={15} />
          </button>
        </div>

        <div className="momentum-row">
          <span className="momentum-chip">
            <TrendingUp size={13} /> {starVelocity(repo.starsPerDay)}
          </span>
          <span className="momentum-copy">average stars per day since launch</span>
          <span className="momentum-meter">
            <span style={{ width: `${repo.heat}%` }} />
          </span>
          <span className="momentum-score">{repo.heat}<small>/100 momentum</small></span>
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
          <span>Some live details (languages, contributors or releases) are temporarily unavailable.</span>
        </div>
      )}

      <div className="detail-body">
        <div className="readme-column">
          <section className="readme-card">
            <header className="readme-head">
              <span className="readme-file">
                <FileText size={15} />
                {readme?.path ?? 'README'}
              </span>
              {readme && (
                <span className="readme-size">
                  {compactNumber(readme.markdown.split(/\s+/).length)} words
                </span>
              )}
              <div className="readme-actions">
                {readme && (
                  <button
                    className="icon-btn"
                    title="Copy raw markdown"
                    onClick={async () => {
                      const ok = await copyText(readme.markdown)
                      toast(ok ? 'README markdown copied' : 'Could not copy', ok ? 'success' : 'error')
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
                  title="View this README on GitHub"
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
                  <strong>README unavailable</strong>
                  <p>{readmeError}</p>
                </div>
                <a className="btn" href={`${repo.htmlUrl}#readme`} target="_blank" rel="noreferrer">
                  Read on GitHub <ArrowUpRight size={13} />
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
                  <Sparkles size={16} /> Related projects
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
                  Explore topic <ArrowUpRight size={13} />
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
                <ListTree size={14} /> On this page
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
              <GithubIcon size={14} /> About
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
                title="View profile"
              >
                <ArrowUpRight size={14} />
              </button>
            </div>
            <dl className="meta-list">
              {repo.license && (
                <div>
                  <dt><Scale size={13} /> License</dt>
                  <dd>{repo.license}</dd>
                </div>
              )}
              <div>
                <dt><Code2 size={13} /> Language</dt>
                <dd>
                  <span className="lang-dot" style={{ background: color }} />
                  {repo.language ?? 'Unknown'}
                </dd>
              </div>
              <div>
                <dt><Package size={13} /> Size</dt>
                <dd>{compactNumber(repo.size)} KB</dd>
              </div>
              <div>
                <dt><CalendarDays size={13} /> Created</dt>
                <dd>{dateLabel(repo.createdAt)}</dd>
              </div>
              <div>
                <dt><Clock3 size={13} /> Updated</dt>
                <dd>{relativeTime(repo.updatedAt)}</dd>
              </div>
              {repo.homepage && (
                <div>
                  <dt><Globe size={13} /> Homepage</dt>
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
                Issues <ArrowUpRight size={12} />
              </a>
              <a href={`${repo.htmlUrl}/pulls`} target="_blank" rel="noreferrer">
                Pulls <ArrowUpRight size={12} />
              </a>
              <a href={`${repo.htmlUrl}/releases`} target="_blank" rel="noreferrer">
                Releases <ArrowUpRight size={12} />
              </a>
            </div>
          </section>

          {languages.length > 0 && (
            <section className="aside-card">
              <h2 className="aside-title">
                <Code2 size={14} /> Languages
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
                <Users size={14} /> Contributors
              </h2>
              <div className="contributor-grid">
                {contributors.slice(0, 12).map((contributor) => (
                  <a
                    key={contributor.login}
                    href={contributor.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={`${contributor.login} · ${contributor.contributions} contributions`}
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
                All contributors <ArrowUpRight size={12} />
              </a>
            </section>
          )}

          <section className="aside-card">
            <h2 className="aside-title">
              <Tag size={14} /> Releases
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
                        {release.prerelease && <em>pre-release</em>}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="aside-empty">No published releases yet.</p>
            )}
          </section>

          <button
            className="aside-cta"
            onClick={() => navigate(repoPath(repo.owner.login, repo.name))}
          >
            <Check size={14} /> You are viewing this project
          </button>
        </aside>
      </div>
    </div>
  )
}
