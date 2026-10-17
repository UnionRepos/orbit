import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Publishes the curated snapshot as a static asset (`/seed.json`).
 *
 * The API only needs it when GitHub is unreachable, so it must not be part of
 * the Worker script: the Worker fetches it from the asset bundle on first use.
 * Node deployments and tests read it straight from `server/seed.json`.
 */
export function orbitSeedPlugin(): Plugin {
  let outDir = path.resolve(process.cwd(), 'dist')

  return {
    name: 'orbit-seed-asset',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async writeBundle() {
      const source = path.resolve(process.cwd(), 'server/seed.json')
      const target = path.join(outDir, 'seed.json')
      await fs.copyFile(source, target)
      const { size } = await fs.stat(target)
      console.log(`[orbit seed] published /seed.json (${Math.round(size / 1024)} KB)`)
    },
  }
}
