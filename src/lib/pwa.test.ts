import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'

const root = new URL('../../', import.meta.url)

function read(relative: string): Buffer {
  return fs.readFileSync(new URL(relative, root))
}

function text(relative: string): string {
  return read(relative).toString('utf8')
}

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

interface Manifest {
  name: string
  short_name: string
  description: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: ManifestIcon[]
  shortcuts?: { name: string; url: string }[]
}

const manifest = JSON.parse(text('public/manifest.webmanifest')) as Manifest

/** Reads the IHDR chunk of a PNG so the declared size can be verified. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', 'not a PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

describe('web app manifest', () => {
  it('declares the fields required for installation', () => {
    assert.ok(manifest.name.length > 0)
    assert.ok(manifest.short_name.length <= 12)
    assert.ok(manifest.description.length > 0)
    assert.equal(manifest.start_url, '/')
    assert.equal(manifest.scope, '/')
    assert.equal(manifest.display, 'standalone')
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i)
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i)
  })

  it('ships 192px and 512px icons plus a maskable variant', () => {
    const sizes = new Set(manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose ?? 'any'}`))
    for (const required of ['192x192:any', '512x512:any', '512x512:maskable']) {
      assert.ok(sizes.has(required), `missing ${required}`)
    }
  })

  it('points at icon files that exist with the advertised dimensions', () => {
    for (const icon of manifest.icons) {
      const body = read(`public${icon.src}`)
      if (icon.type !== 'image/png') {
        assert.ok(body.length > 0, `${icon.src} is empty`)
        continue
      }
      const [width, height] = icon.sizes.split('x').map(Number)
      assert.deepEqual(pngSize(body), { width, height }, `${icon.src} dimensions`)
    }
  })

  it('only advertises shortcuts inside the app scope', () => {
    for (const shortcut of manifest.shortcuts ?? []) {
      assert.ok(shortcut.url.startsWith('/#/'), `${shortcut.name} escapes the app`)
    }
  })
})

describe('document head', () => {
  const html = text('index.html')

  it('links the manifest, the vector favicon and the Apple touch icon', () => {
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/)
    assert.match(html, /<link\s+rel="icon"\s+href="\/favicon\.svg"\s+type="image\/svg\+xml"/)
    assert.match(html, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/)
  })

  it('declares the iOS standalone metadata', () => {
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/)
    assert.match(html, /name="apple-mobile-web-app-title" content="Orbit"/)
  })
})

describe('service worker template', () => {
  const sw = text('public/sw.js')

  it('keeps the build-time placeholders the Vite plugin rewrites', () => {
    assert.match(sw, /^const BUILD_ID = .*$/m)
    assert.match(sw, /^const PRECACHE = .*$/m)
  })

  it('handles navigations, immutable assets and API reads', () => {
    assert.match(sw, /request\.mode === 'navigate'/)
    assert.match(sw, /startsWith\('\/assets\/'\)/)
    assert.match(sw, /startsWith\('\/api\/'\)/)
  })

  it('cleans up caches from previous builds', () => {
    assert.match(sw, /key\.startsWith\('orbit-'\)/)
    assert.match(sw, /caches\.delete/)
  })
})

describe('favicon', () => {
  it('is a standalone SVG built from the Lucide orbit glyph', () => {
    const svg = text('public/favicon.svg')
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    // The two orbit arcs and the planet come from lucide's `orbit` icon data.
    assert.match(svg, /M20\.341 6\.484A10 10 0 0 1 10\.266 21\.85/)
    assert.match(svg, /<circle cx="12" cy="12" r="3"/)
  })
})
