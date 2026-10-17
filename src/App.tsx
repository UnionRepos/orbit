import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { OrbitProvider } from './context/OrbitContext.tsx'
import { TopBar } from './components/TopBar.tsx'
import { FeedPage } from './components/FeedPage.tsx'
import { RepoDetailPage } from './components/RepoDetailPage.tsx'
import { UserPage } from './components/UserPage.tsx'
import { SavedPage } from './components/SavedPage.tsx'
import { AboutPage } from './components/AboutPage.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { Toasts } from './components/Toasts.tsx'
import { I18nProvider, t, useI18n } from './i18n/index.ts'
import { parseRoute, type Route } from './lib/router.ts'

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute())

  useEffect(() => {
    const update = () => setRoute(parseRoute())
    window.addEventListener('hashchange', update)
    window.addEventListener('popstate', update)
    window.addEventListener('orbit:route', update)
    return () => {
      window.removeEventListener('hashchange', update)
      window.removeEventListener('popstate', update)
      window.removeEventListener('orbit:route', update)
    }
  }, [])

  return route
}

function AppShell() {
  const route = useRoute()
  const { locale, t } = useI18n()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.path])

  useEffect(() => {
    if (route.name === 'feed') document.title = t('app.title.feed')
    else if (route.name === 'saved') document.title = t('app.title.saved')
    else if (route.name === 'about') document.title = t('app.title.about')
  }, [route.name, locale, t])

  let page: ReactNode
  switch (route.name) {
    case 'repo':
      page = (
        <RepoDetailPage
          key={`${route.owner}/${route.repo}`}
          route={route}
        />
      )
      break
    case 'user':
      page = <UserPage key={route.login} route={route} />
      break
    case 'saved':
      page = <SavedPage />
      break
    case 'about':
      page = <AboutPage />
      break
    default:
      page = <FeedPage route={route} />
  }

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>{t('app.skip')}</a>
      <TopBar route={route} />
      <div className="page" id="main-content" tabIndex={-1}>{page}</div>
      <CommandPalette />
      <Toasts />
    </>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[orbit] render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash-screen">
          <span className="brand-mark large" aria-hidden="true">
            <span className="brand-orbit" />
            <span className="brand-core" />
          </span>
          <h1>{t('app.crash.title')}</h1>
          <p>{t('app.crash.body')}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('app.crash.reload')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <I18nProvider>
      <ErrorBoundary>
        <OrbitProvider>
          <AppShell />
        </OrbitProvider>
      </ErrorBoundary>
    </I18nProvider>
  )
}
