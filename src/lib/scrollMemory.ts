import type { Route } from './router.ts'

/**
 * Remembers the window scroll offset for list routes so that going back from a
 * detail page lands the user where they left off instead of at the top of the
 * list. Positions live in memory only: they are scoped to the current session
 * and keyed by the route (filters included).
 */

const MAX_ENTRIES = 32
const positions = new Map<string, number>()

/** Stable key for a route, including its query so each filter set is distinct. */
export function routeScrollKey(route: Route): string {
  const query = route.query.toString()
  const base =
    route.name === 'feed' ? 'feed' : `${route.name}:${route.path}`
  return query ? `${base}?${query}` : base
}

export function rememberScroll(key: string, top: number): void {
  if (!Number.isFinite(top) || top < 0) return
  positions.delete(key)
  const rounded = Math.round(top)
  if (rounded === 0) return
  positions.set(key, rounded)
  while (positions.size > MAX_ENTRIES) {
    const oldest = positions.keys().next().value
    if (oldest === undefined) break
    positions.delete(oldest)
  }
}

export function recallScroll(key: string): number | undefined {
  return positions.get(key)
}

export function forgetScroll(key: string): void {
  positions.delete(key)
}

export function resetScrollMemory(): void {
  positions.clear()
}
