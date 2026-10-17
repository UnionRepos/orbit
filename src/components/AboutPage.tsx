import type { ReactNode } from 'react'
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
import { useI18n, type MessageKey } from '../i18n/index.ts'
import { compactNumber, timeUntil } from '../lib/format.ts'
import { GithubIcon } from './icons.tsx'
import { navigate } from '../lib/router.ts'

const FEATURES: { icon: ReactNode; titleKey: MessageKey; bodyKey: MessageKey }[] = [
  {
    icon: <Flame size={18} />,
    titleKey: 'feature.channels.title',
    bodyKey: 'feature.channels.body',
  },
  {
    icon: <Gauge size={18} />,
    titleKey: 'feature.momentum.title',
    bodyKey: 'feature.momentum.body',
  },
  {
    icon: <BookOpen size={18} />,
    titleKey: 'feature.docs.title',
    bodyKey: 'feature.docs.body',
  },
  {
    icon: <Bookmark size={18} />,
    titleKey: 'feature.list.title',
    bodyKey: 'feature.list.body',
  },
  {
    icon: <Command size={18} />,
    titleKey: 'feature.keyboard.title',
    bodyKey: 'feature.keyboard.body',
  },
  {
    icon: <ShieldIcon />,
    titleKey: 'feature.offline.title',
    bodyKey: 'feature.offline.body',
  },
]

function ShieldIcon() {
  return <Lock size={18} />
}

export function AboutPage() {
  const { health, refreshHealth } = useOrbit()
  const { t } = useI18n()
  const rate = health?.rate

  return (
    <div className="about-page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} /> {t('common.back')}
      </button>

      <section className="about-hero">
        <div className="eyebrow">{t('about.eyebrow')}</div>
        <h1>{t('about.title')}</h1>
        <p>{t('about.body')}</p>
        <div className="about-hero-actions">
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            <Flame size={15} /> {t('about.explore')}
          </button>
          <a
            className="btn"
            href="https://docs.github.com/en/rest"
            target="_blank"
            rel="noreferrer"
          >
            <GithubIcon size={15} /> {t('about.api')} <ArrowUpRight size={12} />
          </a>
        </div>
      </section>

      <section className="about-status">
        <div className="about-status-head">
          <h2>
            <Server size={16} /> {t('about.statusTitle')}
          </h2>
          <button className="link-btn" onClick={refreshHealth}>
            <RefreshCw size={13} /> {t('common.refresh')}
          </button>
        </div>
        <div className="status-grid">
          <div>
            <span>{t('about.token')}</span>
            <strong className={health?.hasToken ? 'ok' : 'warn'}>
              {health?.hasToken ? t('about.configured') : t('about.notSet')}
            </strong>
            <small>{health?.hasToken ? t('about.tokenRich') : t('about.tokenAnon')}</small>
          </div>
          <div>
            <span>{t('about.quota')}</span>
            <strong>
              {rate ? `${rate.remaining}/${rate.limit}` : '—'}
            </strong>
            <small>{rate ? t('about.resets', { time: timeUntil(rate.reset) }) : t('about.checking')}</small>
          </div>
          <div>
            <span>{t('about.cache')}</span>
            <strong>{health ? t('about.entries', { count: compactNumber(health.cache.entries) }) : '—'}</strong>
            <small>
              {health
                ? t('about.warm', { size: (health.cache.bytes / 1024).toFixed(0) })
                : '—'}
            </small>
          </div>
          <div>
            <span>{t('about.version')}</span>
            <strong>Orbit {health?.version ?? '0.1.0'}</strong>
            <small>{t('about.stack')}</small>
          </div>
        </div>
      </section>

      <section className="about-features">
        <div className="about-section-head">
          <div className="eyebrow">
            <Layers size={12} /> {t('about.inside')}
          </div>
          <h2>{t('about.featuresTitle')}</h2>
        </div>
        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <article className="feature-card" key={feature.titleKey}>
              <span className="feature-icon">{feature.icon}</span>
              <h3>{t(feature.titleKey)}</h3>
              <p>{t(feature.bodyKey)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-flow">
        <div className="about-section-head">
          <div className="eyebrow">
            <Database size={12} /> {t('about.under')}
          </div>
          <h2>{t('about.flowTitle')}</h2>
          <p>{t('about.flowBody')}</p>
        </div>
        <div className="flow-steps">
          <div className="flow-step">
            <span>01</span>
            <strong>{t('flow.ui.title')}</strong>
            <p>{t('flow.ui.body')}</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span>02</span>
            <strong>{t('flow.proxy.title')}</strong>
            <p>{t('flow.proxy.body')}</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span>03</span>
            <strong>{t('flow.rest.title')}</strong>
            <p>{t('flow.rest.body')}</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span>04</span>
            <strong>{t('flow.cache.title')}</strong>
            <p>{t('flow.cache.body')}</p>
          </div>
        </div>
      </section>

      <section className="about-setup">
        <div className="about-setup-copy">
          <div className="eyebrow">
            <Zap size={12} /> {t('about.further')}
          </div>
          <h2>{t('about.tokenTitle')}</h2>
          <p>{t('about.tokenBody')}</p>
          <ol className="setup-steps">
            <li>{t('about.step1')}</li>
            <li>{t('about.step2')}</li>
            <li>{t('about.step3')}</li>
          </ol>
        </div>
        <pre className="setup-code">
          <span className="code-comment">{t('about.codeEnv')}</span>
          {'\n'}
          <span className="code-key">GITHUB_TOKEN</span>=
          <span className="code-value">ghp_your_token_here</span>
          {'\n\n'}
          <span className="code-comment">{t('about.codeThen')}</span>
          {'\n'}
          npm run dev
        </pre>
      </section>

      <section className="about-shortcuts">
        <div className="about-section-head">
          <div className="eyebrow">
            <Keyboard size={12} /> {t('about.shortcutsEyebrow')}
          </div>
          <h2>{t('about.shortcuts')}</h2>
        </div>
        <div className="shortcut-table">
          <div>
            <span>{t('about.shortcutPalette')}</span>
            <span><kbd>⌘</kbd><kbd>K</kbd></span>
          </div>
          <div>
            <span>{t('about.shortcutSearch')}</span>
            <span><kbd>/</kbd></span>
          </div>
          <div>
            <span>{t('about.shortcutMove')}</span>
            <span><kbd>↑</kbd><kbd>↓</kbd></span>
          </div>
          <div>
            <span>{t('about.shortcutOpen')}</span>
            <span><kbd>↵</kbd></span>
          </div>
          <div>
            <span>{t('about.shortcutClose')}</span>
            <span><kbd>esc</kbd></span>
          </div>
        </div>
      </section>

      <footer className="about-footer">
        <span className="brand-mark small" aria-hidden="true">
          <span className="brand-orbit" />
          <span className="brand-core" />
        </span>
        <p>{t('about.footer')}</p>
      </footer>
    </div>
  )
}
