/**
 * Warm the lazily loaded route chunks before a click lands.
 *
 * The feed links to project pages on every card; loading the project page
 * bundle (markdown renderer + sanitiser) while the pointer is still moving
 * means the navigation paints immediately instead of waiting for JavaScript.
 */
let repoPage: Promise<unknown> | null = null

export function preloadRepoPage(): void {
  repoPage ??= import('../components/RepoDetailPage.tsx')
}

/** Test-only: forget what has been preloaded. */
export function resetPreloads(): void {
  repoPage = null
}
