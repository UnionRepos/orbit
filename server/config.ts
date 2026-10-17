/**
 * Runtime configuration. This module must stay portable: it is bundled into
 * both the Node server and the Cloudflare Worker, so it never touches the
 * filesystem or `process` at import time. Entry points call
 * `configureEnvironment()` with their own environment.
 */

export interface RuntimeEnvironment {
  GITHUB_TOKEN?: unknown
  GH_TOKEN?: unknown
  ORBIT_CACHE_FILE?: unknown
  [key: string]: unknown
}

export const config = {
  token: '',
  userAgent: 'Orbit-GitHub-Client/0.1',
  version: '0.1.0',
}

export let hasToken = false

export function setToken(token: string | null | undefined) {
  config.token = (token ?? '').trim()
  hasToken = config.token.length > 0
}

function readString(env: RuntimeEnvironment, key: string): string | undefined {
  const value = env[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function configureEnvironment(env: RuntimeEnvironment | undefined | null) {
  if (!env) return
  setToken(readString(env, 'GITHUB_TOKEN') ?? readString(env, 'GH_TOKEN'))
}
