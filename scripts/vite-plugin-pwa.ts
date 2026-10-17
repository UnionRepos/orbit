/**
 * Vite plugin that turns `public/sw.js` into a deployable service worker.
 *
 * After the bundle is written it collects every emitted file, hashes the list
 * into a build id and injects both into `dist/sw.js`, so the worker precaches
 * exactly the assets that belong to this build. Development keeps the
 * placeholder values from the source file; the worker is only registered in
 * production builds.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'

const PRECACHE_PATTERN = /\.(?:js|css|html|webmanifest|svg|png|ico|woff2|txt|json)$/i
const SKIP_FILES = new Set(['sw.js'])

async function collectFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path.join(dir, entry.name), relative)))
    } else if (entry.isFile()) {
      files.push(relative)
    }
  }
  return files
}

export function orbitPwaPlugin(): Plugin {
  let outDir = path.resolve(process.cwd(), 'dist')

  return {
    name: 'orbit-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const swPath = path.join(outDir, 'sw.js')
      const template = await fs.readFile(swPath, 'utf8').catch(() => null)
      if (!template) return

      const files = (await collectFiles(outDir))
        .filter((file) => !SKIP_FILES.has(file))
        .filter((file) => PRECACHE_PATTERN.test(file))
        .sort()

      const precache = files.map((file) => `/${file}`)
      const buildId = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12)

      const source = template
        .replace(/^const BUILD_ID = .*$/m, `const BUILD_ID = '${buildId}'`)
        .replace(/^const PRECACHE = .*$/m, `const PRECACHE = ${JSON.stringify(precache, null, 2)}`)

      await fs.writeFile(swPath, source)
      console.log(`[orbit pwa] ${precache.length} files precached (build ${buildId})`)
    },
  }
}
