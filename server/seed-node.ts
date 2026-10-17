import { setSeedProvider, type SeedFile } from './seed-core.ts'
// Static import keeps the Node server self-contained: it always ships the
// snapshot. The Cloudflare Worker never imports this module, so the 1.2 MB of
// data stays out of the Worker bundle.
import snapshot from './seed.json' with { type: 'json' }

let registered = false

/** Points the lazy seed loader at the bundled JSON (Node server, dev, tests). */
export function registerBundledSeed(): void {
  if (registered) return
  registered = true
  setSeedProvider(() => Promise.resolve(snapshot as unknown as SeedFile))
}

registerBundledSeed()
