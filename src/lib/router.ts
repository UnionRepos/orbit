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

export function navigate(path: string, options: { replace?: boolean; scroll?: boolean } = {}) {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`
  if (options.replace) {
    window.history.replaceState(null, '', target)
    window.dispatchEvent(new Event('orbit:route'))
  } else {
    window.location.hash = target
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
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
