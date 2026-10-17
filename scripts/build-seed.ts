/**
 * Builds the curated fallback snapshot used when GitHub's API is unreachable
 * or rate limited. Run with `npm run seed` (optionally with GITHUB_TOKEN).
 */
import fs from 'node:fs'
import path from 'node:path'

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const headers: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'Orbit-Seed-Builder/0.1',
}
if (token) headers.Authorization = `Bearer ${token}`

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

const queries = [
  { label: 'all-time', q: 'stars:>10000 archived:false', sort: 'stars', pages: 2 },
  { label: 'rising', q: `created:>=${daysAgo(21)} stars:>=40 archived:false`, sort: 'stars', pages: 1 },
  { label: 'ai', q: 'topic:ai stars:>3000 archived:false', sort: 'stars', pages: 1 },
  { label: 'devtools', q: 'topic:developer-tools stars:>1500 archived:false', sort: 'stars', pages: 1 },
]

interface GhRepo {
  id: number
  full_name: string
  stargazers_count: number
  [key: string]: unknown
}

const items = new Map<number, GhRepo>()

for (const query of queries) {
  for (let page = 1; page <= query.pages; page++) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
      query.q,
    )}&sort=${query.sort}&order=desc&per_page=50&page=${page}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      console.error(`✗ ${query.label} page ${page}: HTTP ${res.status} — ${await res.text()}`)
      break
    }
    const data = (await res.json()) as { items: GhRepo[] }
    for (const repo of data.items) if (!items.has(repo.id)) items.set(repo.id, repo)
    console.log(`✓ ${query.label} page ${page}: ${data.items.length} repos (total ${items.size})`)
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'GitHub search API snapshot',
  items: [...items.values()].sort((a, b) => b.stargazers_count - a.stargazers_count),
}

const file = path.resolve('server/seed.json')
fs.writeFileSync(file, JSON.stringify(payload))
console.log(`\n✦ Wrote ${payload.items.length} repos to ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`)
