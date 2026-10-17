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
  stale-while-revalidate responses, edge-cached API reads, and a 229-project curated seed
  snapshot for offline use.
- **Fast cold starts** — the Worker script carries no data, route bundles load on demand, and
  the first feed request starts before React mounts (see [Performance](#performance)).
- **Installable PWA** — a web app manifest, generated maskable icons, an install button, and a
  service worker that precaches the app shell and falls back to cached API reads when offline.
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
| `npm run icons` | Re-render the favicon and PWA icons from the Lucide glyph |

## Architecture

```
src/                 React 19 client
  components/        Feed, detail, profile, saved, palette, About
  context/           OrbitProvider: theme, saved items, recents, toasts, health
  hooks/             useFeed, useRepoDetail, useUser, useSearch
  i18n/              locale state, en/zh dictionaries, useI18n()
  lib/               router (hash-based), API client, Markdown, formatting
server/              Hono API + static file server
  github.ts          GitHub REST client, ETag revalidation, stale-while-revalidate
  cache.ts           memory + disk cache with in-flight deduplication
  edge.ts            Cloudflare Cache API layer for API reads
  feed.ts            channel queries, ranking, momentum scoring, seed fallback
  seed-core.ts       lazy, provider-based loader for the curated snapshot
  seed-node.ts       Node provider (bundles seed.json; the Worker does not)
  seed.json          229 curated high-signal repositories (published as /seed.json)
  *.test.ts          API, mapping, query, cache and formatting tests
shared/              Types and language colors used by both sides
scripts/             Seed builder, PWA + seed Vite plugins
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
- An expired entry is served immediately while a background refresh runs, so no reader waits on
  GitHub just because a TTL lapsed.
- On Cloudflare, successful reads are also stored through the Cache API (`caches.default`) for
  20–300 s per route, so a fresh Worker isolate answers from the edge instead of calling GitHub.
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

## Progressive web app

Orbit installs as a standalone app. `public/manifest.webmanifest` defines the name, colours,
shortcuts (Trending, Rising, Reading list) and icons; the favicon and every icon are rendered from
Lucide's [`orbit`](https://lucide.dev/icons/orbit) glyph by `npm run icons`, so the brand mark is a
library icon rather than hand-drawn art. The generated files in `public/` are committed, so a normal
build needs no image tooling.

`public/sw.js` is the service worker. It precaches the shell and the entry assets referenced by
`index.html` (the file list and build id are injected into `dist/sw.js` by
`scripts/vite-plugin-pwa.ts`), serves `/assets/*` cache-first — storing lazy chunks, fonts and
icons the first time they are used — revalidates other same-origin files in the background, and
answers `/api/*` reads network-first with the last good response as the offline fallback.
Navigations that miss the network open the cached shell, so any route keeps working offline.

The worker is registered in production builds only (`src/hooks/usePwa.ts`). When a new build is
waiting, the app shows a toast with a reload action; the top bar exposes the install prompt once the
browser offers one, and an offline banner appears when `navigator.onLine` flips. `public/_headers`
keeps `/sw.js` revalidated while letting icons and bundles cache forever.

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
uses the Cache API plus `Cache-Control` headers for the edge cache.

## Performance

Cold starts were the main latency source, on both sides of the wire.

**Worker start-up (92 KiB of script, 24 KiB gzipped).** The 1.2 MB curated snapshot is no longer
bundled into the Worker: `server/seed-core.ts` loads it through a provider, and the Worker fetches
`/seed.json` from the asset bundle only when GitHub actually fails. Nothing in the script touches
the snapshot at module init, so an isolate boots without parsing or mapping 229 repositories.

**Edge instead of GitHub.** `server/edge.ts` stores successful API reads in the Cloudflare cache;
a brand-new isolate answers a repeat URL from the edge (single-digit milliseconds) rather than
waiting for GitHub. Expired in-memory entries are served immediately while refreshing in the
background, `ctx.waitUntil` keeps the work off the response path, and failed refreshes fall back to
the cached copy.

**Less JavaScript before the first card.** Route bundles load on demand — the project page alone
(markdown-it + DOMPurify) was a third of the entry chunk, and it is now a 147 kB chunk fetched on
hover or navigation. The entry chunk dropped from 485 kB to 313 kB (163 → 100 kB gzipped).

**One round trip, started earlier.** `main.tsx` starts the first feed request before React mounts
and `src/lib/api.ts` shares it with the hook, so the list has data while the tree is still
rendering. Identical in-flight requests are collapsed, aborts only affect their own caller, and the
decorative health poll waits for the feed request to claim the connection first.

**Something on screen immediately.** `index.html` ships a static shell (feed layout + card
placeholders) that React clears on mount, so the first paint no longer waits for the bundle. The
static markup is dropped early when a deep link points at another route.

The service worker precaches only the shell and the entry assets, reusing the HTTP cache for files
the page has already downloaded instead of fetching a second copy during install.

## Notes

- Tests run with Node's built-in runner against the real Hono app, with GitHub requests stubbed.
- Hash routing keeps deep links working on static hosting without server rewrites.
- README HTML is sanitized with DOMPurify; scripts, event handlers, forms, and inline styles are
  stripped before rendering.
- Orbit is an independent project and is not affiliated with GitHub, Inc.

## License

[MIT](LICENSE) © [lemonhub-io](https://github.com/lemonhub-io)

## Immersive translation

Open a repository detail page and use **Translate** in the README header. Choose
the target language next to the button. The controls stay with the reader as you
scroll and offer **Original**, **Bilingual**, and **Translation only** views.
Switching views keeps completed translations and does not repeat API requests.

Only README prose is translated. Feeds, repository descriptions, profiles, saved
notes, and interface labels remain outside the translation session. A new README
starts in its original language; target and display preferences stay on this device.
Leaving the detail page cancels its pending work.

The reader prioritizes passages near your current position, then works through
the rest of the document with a progress bar. **Pause** stops new work while
letting in-flight passages finish; **Resume** continues where you left off.
Original view also pauses new work. Failed passages retain their source and can
be retried individually or together, without disturbing successful translations.
Lists, tables, heading anchors, links, images, inline code and code blocks retain
their structure. Incoming translations preserve the paragraph you are reading.

Translations use Bilibili's [free Index-Translate public API](https://github.com/bilibili/Index-Translate),
with `Index-Translate-35B-A3B` at
`https://index-translate.bilibili.com/v1/chat/completions`. No API key or extra
environment variables are required. README prose is sent to Bilibili
through Orbit's same-origin `POST /api/translate` endpoint; the browser never
calls the provider directly. The integration works with the Node server and
Cloudflare Worker.

The proxy validates and bounds requests (six passages, 2,400 characters per
passage, 6,000 total), limits concurrency and request rate, times out stalled
requests, and retains a bounded in-memory cache for up to 24 hours. The browser
also caches recent translations in memory. Provider failures preserve the
original text and expose a retry control, including a countdown when rate
limited. Translations are machine-generated and depend on public-service
availability.

Long documents are processed as ordered pieces, never as a single model prompt.
Both browser and proxy use sentence/word boundaries with a 1,200-character and
1,800-byte UTF-8 chunk ceiling. The proxy packs pieces under conservative output
expansion and context estimates, reserves context overhead, and requests at most
4,096 output tokens within the public endpoint's 16,384-token context window.
The HTTP envelope limits above are independent of the smaller upstream batches.

A `finish_reason: stop` response still has to pass per-passage checks: complete
JSON keys, preserved code/link placeholders, script-aware compression/expansion,
repetition relative to the source, and token-usage limits when reported. Suspect
results are retried in smaller groups or pieces, up to three split levels and
24 upstream calls within one shared 45-second deadline. Rate limits and transport
errors are surfaced immediately. Nothing from an unsuccessful HTTP batch is
committed to the translation cache; the original remains available. These checks
are conservative heuristics, not a guarantee of semantic translation accuracy.

Example request:

```http
POST /api/translate
Content-Type: application/json

{"target":"zh","texts":["An open-source documentation tool."]}
```

Supported target languages: Simplified Chinese, English, Japanese, Korean,
French, German, Spanish and Russian.
