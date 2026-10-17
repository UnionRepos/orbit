import { Component, lazy, Suspense, useEffect, useLayoutEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { WifiOff } from 'lucide-react'
import { OrbitProvider, useOrbit } from './context/OrbitContext.tsx'
import { TopBar } from './components/TopBar.tsx'
import { FeedPage } from './components/FeedPage.tsx'
import { Toasts } from './components/Toasts.tsx'
import { I18nProvider, t, useI18n } from './i18n/index.ts'
import { parseRoute, rememberFeedPath, type Route } from './lib/router.ts'
import { recallScroll, routeScrollKey } from './lib/scrollMemory.ts'
import { useOnlineStatus, useServiceWorkerUpdate } from './hooks/usePwa.ts'

/**
 * The feed is the landing route and stays in the entry chunk; everything else
 * is split out. The project page alone drags in the markdown renderer and the
 * sanitiser, which is close to a third of the JavaScript on a first visit.
 */
const RepoDetailPage = lazy(() =>
  import('./components/RepoDetailPage.tsx').then((module) => ({ default: module.RepoDetailPage })),
)
const UserPage = lazy(() =>
  import('./components/UserPage.tsx').then((module) => ({ default: module.UserPage })),
)
const SavedPage = lazy(() =>
  import('./components/SavedPage.tsx').then((module) => ({ default: module.SavedPage })),
)
const AboutPage = lazy(() =>
  import('./components/AboutPage.tsx').then((module) => ({ default: module.AboutPage })),
)
const CommandPalette = lazy(() =>
  import('./components/CommandPalette.tsx').then((module) => ({ default: module.CommandPalette })),
)

/** Silently renders nothing while a split route is fetched; keeps layout stable. */
function RouteFallback() {
  return <div className="route-loading" aria-busy="true" />
}

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
  const { toast } = useOrbit()
  const online = useOnlineStatus()
  const { updateReady, reload } = useServiceWorkerUpdate()
  const scrollKey = routeScrollKey(route)

  // Offer a one-click reload once a newer build is installed in the background.
  useEffect(() => {
    if (!updateReady) return
    toast(t('pwa.updateReady'), 'info', { label: t('pwa.reload'), run: reload })
    // The toast is raised once per waiting worker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateReady])

  // Reset the scroll only when the destination has no offset to restore; the
  // feed restores its own offset once the list has rendered again.
  useLayoutEffect(() => {
    if (recallScroll(scrollKey) === undefined) window.scrollTo(0, 0)
  }, [scrollKey])

  useEffect(() => {
    if (route.name === 'feed') rememberFeedPath(route.query)
  }, [route])

  useEffect(() => {
    if (route.name === 'feed') document.title = t('app.title.feed')
    else if (route.name === 'saved') document.title = t('app.title.saved')
    else if (route.name === 'about') document.title = t('app.title.about')
  }, [route.name, locale, t])

  let page: ReactNode
  switch (route.name) {
    case 'repo':
      // `lazy()` starts fetching the page chunk on this first render.
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
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={14} aria-hidden="true" /> {t('pwa.offline')}
        </div>
      )}
      <TopBar route={route} />
      <div className="page" id="main-content" tabIndex={-1}>
        <Suspense fallback={<RouteFallback />}>{page}</Suspense>
      </div>
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
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
