import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Command,
  Database,
  Flame,
  Gauge,
  Keyboard,
  Layers,
  Lock,
  RefreshCw,
  Server,
  BookOpen,
  Zap,
} from 'lucide-react'
import { useOrbit } from '../context/OrbitContext.tsx'
import { compactNumber, timeUntil } from '../lib/format.ts'
import { GithubIcon } from './icons.tsx'
import { navigate } from '../lib/router.ts'

const FEATURES = [
  {
    icon: <Flame size={18} />,
    title: 'Six discovery channels',
    body: 'Browse new, active, and established projects, or find repositories welcoming their first contributors.',
  },
  {
    icon: <Gauge size={18} />,
    title: 'Project momentum',
    body: 'Every project gets a transparent 0–100 momentum score and a stars-per-day velocity, blending reach, freshness and fork activity.',
  },
  {
    icon: <BookOpen size={18} />,
    title: 'Read documentation here',
    body: 'Markdown is rendered safely in-app with generated tables of contents, relative image resolution and copy-ready raw source.',
  },
  {
    icon: <Bookmark size={18} />,
    title: 'A reading list with notes',
    body: 'Save projects locally, jot down why they matter, export the list as JSON. No account, no tracking, no syncing surprises.',
  },
  {
    icon: <Command size={18} />,
    title: 'Keyboard-first navigation',
    body: 'Press ⌘K from anywhere to search GitHub, jump between channels, open saved work or switch themes without reaching for the mouse.',
  },
  {
    icon: <ShieldIcon />,
    title: 'Available offline',
    body: 'Cached results and a curated collection keep the directory available when GitHub cannot be reached.',
  },
]

function ShieldIcon() {
  return <Lock size={18} />
}

export function AboutPage() {
  const { health, refreshHealth } = useOrbit()
  const rate = health?.rate

  return (
    <div className="about-page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} /> Back to discover
      </button>

      <section className="about-hero">
        <div className="eyebrow">
          About Orbit
        </div>
        <h1>A place to explore open source.</h1>
        <p>
          Orbit is an independent directory of GitHub projects. Browse by language and topic,
          read the documentation, and save projects you want to come back to.
        </p>
        <div className="about-hero-actions">
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            <Flame size={15} /> Explore the feed
          </button>
          <a
            className="btn"
            href="https://docs.github.com/en/rest"
            target="_blank"
            rel="noreferrer"
          >
            <GithubIcon size={15} /> GitHub REST API <ArrowUpRight size={12} />
          </a>
        </div>
      </section>

      <section className="about-status">
        <div className="about-status-head">
          <h2>
            <Server size={16} /> Live system status
          </h2>
          <button className="link-btn" onClick={refreshHealth}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        <div className="status-grid">
          <div>
            <span>GitHub token</span>
            <strong className={health?.hasToken ? 'ok' : 'warn'}>
              {health?.hasToken ? 'Configured' : 'Not set'}
            </strong>
            <small>{health?.hasToken ? '5,000 core requests/hour' : '60 core · 10 search/min'}</small>
          </div>
          <div>
            <span>API quota</span>
            <strong>
              {rate ? `${rate.remaining}/${rate.limit}` : '—'}
            </strong>
            <small>{rate ? `resets in ${timeUntil(rate.reset)}` : 'checking…'}</small>
          </div>
          <div>
            <span>Disk cache</span>
            <strong>{health ? `${compactNumber(health.cache.entries)} entries` : '—'}</strong>
            <small>{health ? `${(health.cache.bytes / 1024).toFixed(0)} KB warm responses` : '—'}</small>
          </div>
          <div>
            <span>Version</span>
            <strong>Orbit {health?.version ?? '0.1.0'}</strong>
            <small>React · Vite · Hono</small>
          </div>
        </div>
      </section>

      <section className="about-features">
        <div className="about-section-head">
          <div className="eyebrow">
            <Layers size={12} /> What is inside
          </div>
          <h2>Tools for finding your next project</h2>
        </div>
        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-flow">
        <div className="about-section-head">
          <div className="eyebrow">
            <Database size={12} /> Under the hood
          </div>
          <h2>One cache-friendly API hop</h2>
          <p>
            The browser never talks to GitHub directly. A small Hono service normalises responses,
            deduplicates in-flight requests, stores ETags and falls back to stale data when the
            quota runs dry.
          </p>
        </div>
        <div className="flow-steps">
          <div className="flow-step">
            <span>01</span>
            <strong>React UI</strong>
            <p>Feed, filters and deep links live in the URL so every view is shareable.</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span>02</span>
            <strong>Hono proxy</strong>
            <p>Validates input, maps GitHub payloads and serves the production build.</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span>03</span>
            <strong>GitHub REST</strong>
            <p>Conditional requests return 304s that do not count against your quota.</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span>04</span>
            <strong>Warm cache</strong>
            <p>Memory + disk survive restarts; a curated snapshot covers outages.</p>
          </div>
        </div>
      </section>

      <section className="about-setup">
        <div className="about-setup-copy">
          <div className="eyebrow">
            <Zap size={12} /> Go further
          </div>
          <h2>Bring your own token</h2>
          <p>
            Anonymous GitHub access is fine for browsing, but a token lifts the ceiling to 5,000
            core requests and 30 searches per minute. Orbit only needs read access to public data —
            no scopes required.
          </p>
          <ol className="setup-steps">
            <li>Create a personal access token (classic or fine-grained).</li>
            <li>Drop it into a <code>.env</code> file in the project root.</li>
            <li>Restart the dev server — Orbit picks it up automatically.</li>
          </ol>
        </div>
        <pre className="setup-code">
          <span className="code-comment"># .env</span>
          {'\n'}
          <span className="code-key">GITHUB_TOKEN</span>=
          <span className="code-value">ghp_your_token_here</span>
          {'\n\n'}
          <span className="code-comment"># then</span>
          {'\n'}
          npm run dev
        </pre>
      </section>

      <section className="about-shortcuts">
        <div className="about-section-head">
          <div className="eyebrow">
            <Keyboard size={12} /> Keyboard navigation
          </div>
          <h2>Shortcuts</h2>
        </div>
        <div className="shortcut-table">
          <div>
            <span>Open the command menu</span>
            <span><kbd>⌘</kbd><kbd>K</kbd></span>
          </div>
          <div>
            <span>Focus the search field</span>
            <span><kbd>/</kbd></span>
          </div>
          <div>
            <span>Move through results</span>
            <span><kbd>↑</kbd><kbd>↓</kbd></span>
          </div>
          <div>
            <span>Open the highlighted result</span>
            <span><kbd>↵</kbd></span>
          </div>
          <div>
            <span>Close any overlay</span>
            <span><kbd>esc</kbd></span>
          </div>
        </div>
      </section>

      <footer className="about-footer">
        <span className="brand-mark small" aria-hidden="true">
          <span className="brand-orbit" />
          <span className="brand-core" />
        </span>
        <p>
          Orbit is an independent interface over the public GitHub API. Not affiliated with GitHub,
          Inc. Data belongs to the projects and people who make it.
        </p>
      </footer>
    </div>
  )
}
