# Orbit

A third-party GitHub client for browsing open-source projects, built as a fast, feed-style
single-page app. Orbit turns the public GitHub API into a calm discovery surface: curated
channels, momentum scoring, readable READMEs, and a local reading list.

![Stack](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-4-e36002?logo=hono&logoColor=white)

[![CI](https://github.com/UnionRepos/orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/UnionRepos/orbit/actions/workflows/ci.yml)
[![Deploy](https://github.com/UnionRepos/orbit/actions/workflows/deploy.yml/badge.svg)](https://github.com/UnionRepos/orbit/actions/workflows/deploy.yml)
[![Live](https://img.shields.io/badge/live-orbit.openhub.today-8b5cf6)](https://orbit.openhub.today)

## Features

- **Six discovery channels** — Trending, Rising, Fresh, Hidden gems, Good first issues, and
  All-time classics, each with its own query shape and description.
- **Momentum scoring** — a transparent 0–100 score and stars-per-day velocity computed from
  reach, freshness, forks, and activity.
- **Powerful filters** — language, topic, star floor, recency, minimum stars, sort order, and
  live GitHub search. Every filter is persisted in the URL, so any view can be shared.
- **Native README reader** — sanitized HTML, GitHub-flavored Markdown, generated table of
  contents, relative image resolution, and copy raw/share actions.
- **Project intelligence** — language breakdowns, contributors, latest releases, activity
  stats, owner profile, and similar projects.
- **Reading list** — save projects with private notes, export/import JSON, and revisit recent
  projects. Everything is stored locally in the browser; there is no account or tracking.
- **Command palette** — `⌘K` / `Ctrl+K` to search GitHub, jump channels, switch theme, or open
  saved work, with full keyboard navigation.
- **Resilient by design** — conditional requests, in-flight deduplication, memory + disk cache,
  stale-while-error responses, and a 229-project curated seed snapshot for offline use.
- **Dark + light themes**, responsive from desktop to phone, and a mobile filter sheet.

## Quick start

Requires **Node.js 22.6+** (the Hono server runs TypeScript directly via Node's type stripping).

```bash
npm install
cp .env.example .env   # optional: add a GitHub token
npm run dev            # Vite on http://localhost:5173 (runs the Hono API in-process)
```

For a production build:

```bash
npm run build
npm start              # Hono serves the API and dist/ on http://localhost:8787
```

## GitHub token

Anonymous API access works, but GitHub limits it to 60 core requests/hour and 10 searches/minute.
Add a read-only token to lift that to 5,000 core requests and 30 searches/minute:

```dotenv
# .env
GITHUB_TOKEN=ghp_your_token_here
```

No scopes are needed for public repositories. The token stays on the server and is never sent to
the browser. Orbit reports the live quota in the sidebar and on the About page.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with HMR; mounts the Hono API in-process |
| `npm run build` | Type-check (`tsc --noEmit`) and build the client |
| `npm start` | Serve API + `dist/` with Hono on port 8787 |
| `npm run deploy` | Build and deploy to Cloudflare Workers |
| `npm run worker:dev` | Run the Worker (API + assets) locally with Wrangler |
| `npm test` | Run the server and client test suites (`node --test`) |
| `npm run typecheck` | Type-check only |
| `npm run seed` | Regenerate the curated fallback snapshot |

## Architecture

```
src/                 React 19 client
  components/        Feed, detail, profile, saved, palette, About
  context/           OrbitProvider: theme, saved items, recents, toasts, health
  hooks/             useFeed, useRepoDetail, useUser, useSearch
  i18n/              locale state, en/zh dictionaries, useI18n()
  lib/               router (hash-based), API client, Markdown, formatting
server/              Hono API + static file server
  github.ts          GitHub REST client, ETag revalidation, quotas
  cache.ts           memory + disk cache with in-flight deduplication
  feed.ts            channel queries, ranking, momentum scoring, seed fallback
  seed.json          229 curated high-signal repositories
  *.test.ts          API, mapping, query and formatting tests
shared/              Types and language colors used by both sides
scripts/             Seed builder
worker/              Cloudflare Workers entry (Hono API + static assets)
wrangler.jsonc       Workers deployment config
```

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/feed?channel=&language=&topic=&minStars=&createdWithin=&sort=` | Ranked discovery feed |
| `GET /api/search?q=` | GitHub repository search |
| `GET /api/repo/:owner/:repo` | Repository detail |
| `GET /api/readme/:owner/:repo` | README source (Markdown) |
| `GET /api/user/:login` | Profile and repositories |
| `GET /api/seed` | Curated fallback snapshot metadata |
| `GET /api/health` | Token status, quota, cache usage, uptime |

Responses include a `source` field (`live`, `cache`, `stale`, or `seed`) so the UI can be honest
about where the data came from.

### Caching and rate limits

- GitHub requests use `If-None-Match`; a `304 Not Modified` does not count against the quota.
- Identical in-flight requests are deduplicated.
- Successful responses are written to `.orbit-cache/` with a TTL.
- When GitHub is unavailable or throttled, the server serves stale cache first, then a filtered
  seed snapshot. The feed never renders an empty shell.

## Internationalisation

Orbit ships in English and Simplified Chinese (`zh`).

- `src/i18n/en.ts` is the source of truth; `src/i18n/zh.ts` is typed as
  `Record<keyof typeof en, string>`, so a missing key fails `npm run typecheck`.
- Components call `const { t, tp } = useI18n()`; `tp` picks a plural variant from
  `singular|plural` templates (Chinese uses a single form).
- Plain helpers such as `relativeTime()` read the active locale from
  `src/i18n/core.ts`, so number, date and relative-time formatting follow the UI.
- The choice is stored in `localStorage` (`orbit:locale:v1`), defaults to the
  browser language, and is applied before first paint in `index.html` so the
  `lang` attribute and CJK font stack are correct immediately.
- Add a language by creating `src/i18n/pt.ts`, registering it in `LOCALES`, and
  adding it to `DICTIONARIES` — the typechecker lists anything still missing.

## Deploy to Cloudflare Workers

Orbit runs as a single Worker: the Hono API handles `/api/*` and the built SPA in `dist/` is
served as static assets from the same origin.

It is live at **https://orbit.openhub.today**. The `*.workers.dev` endpoint is disabled
(`workers_dev: false`); the only route is the `orbit.openhub.today` custom domain.

```bash
npm run deploy        # vite build + wrangler deploy
```

Set a GitHub token as a Worker secret (optional, but recommended):

```bash
npx wrangler secret put GITHUB_TOKEN
```

The Worker config lives in `wrangler.jsonc` (`assets.directory: ./dist`, with
`run_worker_first: ["/api/*"]`, plus a `custom_domain` route for `orbit.openhub.today`). `npm run worker:dev` runs the exact production bundle locally via
Wrangler. The disk cache is Node-only; on Workers the app keeps a per-isolate in-memory cache and
relies on the `Cache-Control` headers for the edge cache.

## Notes

- Tests run with Node's built-in runner against the real Hono app, with GitHub requests stubbed.
- Hash routing keeps deep links working on static hosting without server rewrites.
- README HTML is sanitized with DOMPurify; scripts, event handlers, forms, and inline styles are
  stripped before rendering.
- Orbit is an independent project and is not affiliated with GitHub, Inc.

## License

[MIT](LICENSE) © [lemonhub-io](https://github.com/lemonhub-io)
