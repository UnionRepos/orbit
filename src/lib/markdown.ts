import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { slugify } from './format.ts'

export interface TocItem {
  id: string
  text: string
  level: number
}

export interface RenderedMarkdown {
  html: string
  toc: TocItem[]
}

function isAbsolute(url: string): boolean {
  return /^(https?:|mailto:|tel:|data:|#)/i.test(url)
}

function resolve(url: string, base: string, kind: 'link' | 'image'): string {
  if (!url) return url
  if (url.startsWith('//')) return `https:${url}`
  if (isAbsolute(url)) return url
  const clean = url.replace(/^\.\//, '').replace(/^\/+/, '').replace(/ /g, '%20')
  if (kind === 'image') {
    return `https://raw.githubusercontent.com/${base}/HEAD/${clean}`
  }
  return `https://github.com/${base}/blob/HEAD/${clean}`
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
})

const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href')
  if (href) token.attrSet('href', resolve(String(href), String(env?.base ?? ''), 'link'))
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer nofollow')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

const defaultImage =
  md.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src')
  if (src) token.attrSet('src', resolve(String(src), String(env?.base ?? ''), 'image'))
  token.attrSet('loading', 'lazy')
  token.attrSet('decoding', 'async')
  return defaultImage(tokens, idx, options, env, self)
}

function plainHeading(
  token: { children?: { type: string; content: string }[] | null },
  fallback: string,
): string {
  const children = token.children ?? []
  const text = children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*[·•|]\s*)+/g, ' · ')
    .replace(/^[\s·•|–—-]+|[\s·•|–—-]+$/g, '')
    .trim()
  return text || fallback
}

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const next = tokens[idx + 1]
  if (env && next && next.type === 'inline') {
    const text = plainHeading(next, next.content.trim())
    const base = slugify(text) || 'section'
    const counts = env.slugCounts as Map<string, number>
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`
    tokens[idx].attrSet('id', id)
    ;(env.toc as TocItem[]).push({ id, text, level: Number(tokens[idx].tag.slice(1)) })
  }
  return self.renderToken(tokens, idx, options)
}

/**
 * READMEs rely heavily on raw HTML for logos, badges and centred headers.
 * Sanitize it, then rewrite relative URLs so images resolve against the repo.
 */
function finalizeHtml(html: string, base: string): string {
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'align', 'width', 'height', 'loading', 'decoding'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style'],
  })
  const doc = new DOMParser().parseFromString(clean, 'text/html')

  doc.querySelectorAll('img[src]').forEach((node) => {
    const src = node.getAttribute('src')
    if (src) node.setAttribute('src', resolve(src, base, 'image'))
    node.setAttribute('loading', 'lazy')
    node.setAttribute('decoding', 'async')
  })

  doc.querySelectorAll('a[href]').forEach((node) => {
    const href = node.getAttribute('href')
    if (href) node.setAttribute('href', resolve(href, base, 'link'))
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  })

  return doc.body.innerHTML
}

export function renderMarkdown(markdown: string, base: string): RenderedMarkdown {
  const env: { base: string; toc: TocItem[]; slugCounts: Map<string, number> } = {
    base,
    toc: [],
    slugCounts: new Map(),
  }
  const html = finalizeHtml(md.render(markdown, env), base)
  return { html, toc: env.toc }
}
