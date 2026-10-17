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

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.path])

  useEffect(() => {
    if (route.name === 'feed') document.title = 'Orbit — open source, in motion'
    else if (route.name === 'saved') document.title = 'Reading list · Orbit'
    else if (route.name === 'about') document.title = 'How Orbit works'
  }, [route.name])

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
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>
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
          <h1>Orbit lost its signal</h1>
          <p>Something unexpected happened while rendering this view.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <OrbitProvider>
        <AppShell />
      </OrbitProvider>
    </ErrorBoundary>
  )
}
