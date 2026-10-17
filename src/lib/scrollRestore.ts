/**
 * Policy for replaying a remembered scroll offset on a paginated list.
 *
 * The feed only fetches its first page when it mounts, so a saved offset from
 * deep in the list (say card 40) is not reachable yet: the document is just tall
 * enough for the first page. Instead of clamping to that short document, the
 * restore keeps waiting for content to grow and asks the list for another page
 * whenever it stops growing, until the offset is reachable or nothing is left
 * to load.
 */

/** Wait this long after the list stops growing before requesting another page. */
export const PULL_DELAY_MS = 400
/** Never ask for another page more often than this. */
export const PULL_COOLDOWN_MS = 400
/** How long a restore may wait for growth (slow or failed requests) before clamping. */
export const MAX_IDLE_MS = 6000
/** How long layout may settle before clamping an offset nothing can reach. */
export const SETTLE_MS = 250
/** Safety cap on pages pulled in while rebuilding a deep offset. */
export const MAX_PULLS = 20

export interface RestoreQuery {
  /** Remembered offset, in pixels. */
  target: number
  /** Largest offset the rendered document currently allows. */
  maxTop: number
  /** Milliseconds since the document last grew. */
  idleMs: number
  /** Milliseconds since the last page request. */
  sincePullMs: number
  /** Pages already pulled in during this restore. */
  pulls: number
  /** Whether the list can still produce another page. */
  hasMore: boolean
}

export type RestoreAction = 'done' | 'wait' | 'pull' | 'clamp'

export function nextRestoreAction(query: RestoreQuery): RestoreAction {
  if (query.maxTop + 1 >= query.target) return 'done'
  if (query.idleMs >= MAX_IDLE_MS) return 'clamp'
  if (
    query.hasMore &&
    query.pulls < MAX_PULLS &&
    query.idleMs >= PULL_DELAY_MS &&
    query.sincePullMs >= PULL_COOLDOWN_MS
  ) {
    return 'pull'
  }
  if (!query.hasMore && query.idleMs >= SETTLE_MS) return 'clamp'
  return 'wait'
}
