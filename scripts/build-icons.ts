/**
 * Renders Orbit's favicon and PWA icons from Lucide's `orbit` glyph.
 *
 * Lucide (https://lucide.dev, ISC) is the vector icon library behind every icon
 * in the app, so the brand mark reuses that same glyph instead of a hand-drawn
 * shape. The generated files under `public/` are committed, which keeps the
 * normal `npm run build` free of any rasteriser dependency; run `npm run icons`
 * only after changing colours, padding or the glyph.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const publicDir = path.join(root, 'public')
const iconsDir = path.join(publicDir, 'icons')

const BACKGROUND = '#191b19'
const FOREGROUND = '#a0c7ad'
const GLYPH_SIZE = 24

interface LucideNode {
  name: string
  node: [string, Record<string, string>][]
}

type SharpFactory = (input: Buffer) => {
  resize(width: number, height?: number): { png(): { toFile(file: string): Promise<unknown> } }
}

/** Lucide ships one ESM module per icon; its `__iconData` is plain geometry. */
async function loadGlyph(name: string): Promise<LucideNode> {
  const iconPath = path.join(root, 'node_modules/lucide-react/dist/esm/icons', `${name}.mjs`)
  const module = (await import(pathToFileURL(iconPath).href)) as { __iconData: LucideNode }
  return module.__iconData
}

function attributes(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ')
}

/**
 * Ink for the glyph: the orbit arcs keep Lucide's stroke, while the planet and
 * its two satellites are filled so they stay readable at 32px.
 */
function glyphMarkup(glyph: LucideNode, strokeWidth: number): string {
  const shapes = glyph.node
    .map(([tag, attrs]) => {
      const { key: _key, ...rest } = attrs
      if (tag === 'circle') return `<circle ${attributes({ ...rest, fill: FOREGROUND, stroke: 'none' })} />`
      return `<${tag} ${attributes(rest)} />`
    })
    .join('')

  return `<g fill="none" stroke="${FOREGROUND}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>`
}

/**
 * Renders the glyph centred in a square. `art` is the share of the square the
 * glyph occupies: maskable icons use a smaller value so the mark survives the
 * platform's crop inside the 80% safe zone.
 */
function appIcon(size: number, art: number, radius: number, glyph: LucideNode): string {
  const scale = (size * art) / GLYPH_SIZE
  const offset = (size - GLYPH_SIZE * scale) / 2
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}" />`,
    `<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${scale.toFixed(4)})">`,
    glyphMarkup(glyph, 2),
    '</g>',
    '</svg>',
  ].join('')
}

/** 32×32 browser favicon: rounded tile with the glyph inset by 4px. */
function favicon(glyph: LucideNode): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Orbit">',
    `<rect width="32" height="32" rx="7" fill="${BACKGROUND}" />`,
    `<g transform="translate(4 4)">${glyphMarkup(glyph, 2)}</g>`,
    '</svg>',
    '',
  ].join('\n')
}

async function main() {
  const glyph = await loadGlyph('orbit')

  const targets = [
    { file: 'favicon-48.png', size: 48, art: 0.72, radius: 0.22 },
    { file: 'icon-192.png', size: 192, art: 0.72, radius: 0.22 },
    { file: 'icon-512.png', size: 512, art: 0.72, radius: 0.22 },
    { file: 'icon-maskable-192.png', size: 192, art: 0.56, radius: 0 },
    { file: 'icon-maskable-512.png', size: 512, art: 0.56, radius: 0 },
    { file: 'apple-touch-icon.png', size: 180, art: 0.68, radius: 0 },
  ]

  // sharp ships with wrangler/miniflare, so no extra dependency is needed.
  const sharpModule = (await import('sharp' as string).catch(() => null)) as
    | { default: SharpFactory }
    | null
  if (!sharpModule) {
    console.error('✗ sharp is unavailable — run `npm ci` first, then `npm run icons`.')
    process.exitCode = 1
    return
  }
  const sharp = sharpModule.default

  await fs.mkdir(iconsDir, { recursive: true })
  await fs.writeFile(path.join(publicDir, 'favicon.svg'), favicon(glyph))

  for (const target of targets) {
    const svg = appIcon(target.size, target.art, Math.round(target.size * target.radius), glyph)
    await sharp(Buffer.from(svg)).resize(target.size, target.size).png().toFile(
      path.join(iconsDir, target.file),
    )
    console.log(`✓ icons/${target.file}`)
  }

  await fs.writeFile(path.join(iconsDir, 'icon.svg'), appIcon(512, 0.72, 112, glyph))
  console.log('✓ icons/icon.svg')
}

await main()
