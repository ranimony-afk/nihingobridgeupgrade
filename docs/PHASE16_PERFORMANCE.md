# Phase 16 — Performance

Measured first, then fixed. Numbers below are from this codebase, not estimates.

## The headline problem

`seedReady()` ran on every page render. The `__nbSeeded` flag only guarded the
curriculum block — the five per-domain `ensure*Seed()` helpers each re-queried
their marker rows underneath it:

```
COLD seedReady queries: 1384
WARM seedReady queries:   77  (249ms)   <-- on EVERY request
```

Every page view paid 77 queries and ~250ms before rendering a single byte.

The promise is now memoised per process:

```
WARM seedReady queries:    0  (0ms)
```

A **failed** seed is deliberately not cached, otherwise one transient database
blip during boot would wedge the process into a permanently unseeded state.

`tests/integration/perf.test.ts` asserts 0 warm queries so this cannot regress.

## ISR

The root layout declared `force-dynamic`, which cascades to the **entire route
tree** — 49 pages were server-rendered per request even when their content was
identical for every visitor.

Removing it and adding `revalidate` gives real prerendering:

| Route | Revalidate |
| --- | --- |
| `/blog`, `/blog/[slug]` | 15m |
| `/kanji/[char]`, `/grammar/[slug]`, `/kanji/explore` | 1h |

`generateStaticParams` prerenders the top 100 kanji, all grammar, and all
published posts at build time. The remaining 12,900 kanji render on first
request and are then cached — full prerendering would make builds unusable.

Pages calling `cookies()` are still detected as dynamic automatically, so
authenticated routes were not affected.

## Database

PostgreSQL indexes primary keys automatically but **never foreign keys**. Every
FK used in a hot path was doing a sequential scan. Added 33 indexes
(`drizzle/migrations/0011_phase16_performance.sql`).

Two N+1 patterns collapsed:

- `toPublic()` — two sequential round-trips (today's row, then a week scan) into
  one aggregate. Runs on every authenticated render.
- `getLeaderboard()` — selected every learner **and** every weekly XP row into
  Node, joined and sorted in memory. Now one grouped query with SQL-side sort
  and limit.

### A bug the test caught

The rewritten leaderboard cast `weekly_xp` to `::text` for transport, and
`ORDER BY weekly_xp` then sorted it lexicographically — ranking `"9"` above
`"100"`. The ordering assertion in the perf test caught it. It now orders by the
numeric `SUM` expression.

## Code splitting

- **D3** (~90KB) loads only when the kanji mind map is on screen
- **TutorLab** defers so the conversation shell paints first
- `optimizePackageImports` for `d3` and `drizzle-orm`

## Images

All 19 raw `<img>` tags became `next/image`. Previously full-size originals were
shipped to phones with no AVIF/WebP negotiation and no reserved space, so every
image caused layout shift. Pexels is allow-listed in `remotePatterns`.

## Caching

| Layer | Where |
| --- | --- |
| `unstable_cache` | `cached()` helper with tag invalidation |
| CDN | `publicCacheHeaders()` — `s-maxage` + `stale-while-revalidate` |
| Personalised | `privateCacheHeaders()` — `private, no-store` |
| Build assets | `immutable`, 1 year |

Anything personalised is explicitly `no-store`; caching it at a CDN would serve
one learner's data to another.

## Edge runtime

`/api/v1/ping` runs at the edge with no database access for uptime checks.
`/api/health` deliberately stays on Node because it verifies the PostgreSQL
connection — the two probes answer different questions.

## Test commands

```bash
npm run test              # 89 unit tests
npm run test:integration  # requires DATABASE_URL
```
