export type RouteName = 'feed' | 'repo' | 'user' | 'saved' | 'about'

export interface Route {
  name: RouteName
  owner?: string
  repo?: string
  login?: string
  query: URLSearchParams
  path: string
}

export function parseRoute(hash = window.location.hash): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart] = raw.split('?')
  const query = new URLSearchParams(queryPart ?? '')
  const segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent)
  const path = `/${segments.join('/')}`

  if (segments[0] === 'repo' && segments.length >= 3) {
    return { name: 'repo', owner: segments[1], repo: segments[2], query, path }
  }
  if ((segments[0] === 'user' || segments[0] === 'u') && segments.length >= 2) {
    return { name: 'user', login: segments[1], query, path }
  }
  if (segments[0] === 'saved') return { name: 'saved', query, path }
  if (segments[0] === 'about') return { name: 'about', query, path }
  return { name: 'feed', query, path: '/' }
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`
  if (options.replace) {
    window.history.replaceState(null, '', target)
    window.dispatchEvent(new Event('orbit:route'))
    return
  }
  if (window.location.hash === target) {
    // Re-selecting the current route should still return to the top of it.
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  // Scroll resets are handled once the new route has rendered, so that the
  // outgoing page keeps its real offset and can offer it back on return.
  window.location.hash = target
}

export function repoPath(owner: string, name: string): string {
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
}

export function userPath(login: string): string {
  return `/user/${encodeURIComponent(login)}`
}

export function feedPath(query: URLSearchParams): string {
  const qs = query.toString()
  return qs ? `/?${qs}` : '/'
}

// Last discovery list the user looked at, so "back" from a detail page returns
// to the same channel/filters instead of the unfiltered feed.
let lastFeedPath = '/'

export function rememberFeedPath(query: URLSearchParams): void {
  lastFeedPath = feedPath(query)
}

export function getLastFeedPath(): string {
  return lastFeedPath
}
