# API

## Compatibility surface (do not change)

### `GET /api/health`

Returns `{ "ok": true }` when PostgreSQL answers `select 1`.

### `GET /api/me`

Cookie session. `401` if no learner.

### `POST /api/game`

Body is a `GameAction` discriminated union. See `src/lib/game.ts`. This is the LMS facade. New clients should eventually call `/api/v1/*` wrappers that still invoke `handleGame`.

## Phase 1 additions

All new routes use `{ ok, data?, error? }`.

### `GET /api/v1/audit`

Full Phase 1 bundle: report, findings, roadmap, events, readiness score, coverage, histograms.

### `GET /api/v1/audit/findings`

Query: `domain`, `severity`, `status`.

### `PATCH /api/v1/audit/findings/:id`

Staff only. Body: `{ "status": "open" | "in_progress" | "resolved" | "accepted_risk" }`.  
Illegal transitions return `400`.

### `POST /api/v1/admin/login`

`{ email, password }` → HMAC cookie `nb_staff`.

### `POST /api/v1/admin/logout`

Clears staff cookie.

### `GET /api/v1/admin/session`

Current staff profile or `401`.

## Phase 2 additions

### `GET /api/auth/[...nextauth]` / `POST /api/auth/[...nextauth]`

Auth.js v5 handlers (staff JWT).

### `GET /api/v1/health`

Deep probe: database, Drizzle pool, Redis, Supabase, Auth.js, error tracking, analytics. `503` if Postgres is down.

### `POST /api/v1/analytics` / `GET /api/v1/analytics`

Public write of named events. Staff read.

### `POST /api/v1/errors` / `GET /api/v1/errors`

Client/server incident capture. Staff read.

### `GET|POST /api/v1/admin/backups`

List or run a logical snapshot.

### `GET /api/v1/admin/infra`

Aggregated infra dashboard payload.

`POST /api/game` now rate-limits (80/min) and records `game_action` analytics. The `handleGame` contract is unchanged.

## Phase 3 identity

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login` (password, 2FA challenge, or `{ challengeId, otp }`)
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST|PUT /api/v1/auth/magic`
- `POST /api/v1/auth/recover` `{ action: forgot|reset|verify }`
- `POST /api/v1/auth/two-factor` `{ action: setup|enable|disable }`
- `GET|DELETE /api/v1/auth/sessions`
- `GET /api/v1/auth/providers`
- `GET|PATCH /api/v1/admin/identity`
- `GET|POST /api/auth/[...nextauth]` (Google/GitHub when configured)

## Phase 4 billing

- `GET /api/v1/billing/plans`
- `POST /api/v1/billing/quote`
- `POST /api/v1/billing/checkout`
- `GET|POST /api/v1/billing/sandbox/complete`
- `GET /api/v1/billing/me`
- `GET /api/v1/billing/invoices/:id`
- `POST /api/v1/billing/webhooks/stripe`
- `POST /api/v1/billing/webhooks/razorpay`
- `GET|POST /api/v1/admin/billing`

## Phase 5 knowledge graph

- `GET /api/v1/kg/search?q=`
- `GET /api/v1/kg/stats`
- `GET /api/v1/kg/lexemes/:id`
- `GET /api/v1/kg/kanji/:char`
- `GET /api/v1/kg/grammar`
- `GET|POST /api/v1/kg/srs`
- `GET|POST /api/v1/admin/kg/import`

## Phase 6 dictionary

- `GET /api/v1/dict/entries/:id`
- `GET /api/v1/dict/offline`
- `GET|POST /api/v1/dict/bookmarks`
- `POST /api/v1/admin/dict/enrich`

## Phase 7 kanji explorer

- `GET /api/v1/kanji/graph`
- `GET /api/v1/kanji/explore/:char`
- `POST /api/v1/admin/kanji/enrich`

## Phases 8–10

- `GET /api/v1/grammar` · `GET|POST /api/v1/grammar/:slug` · `GET|POST /api/v1/admin/grammar`
- `GET|POST /api/v1/tutor/session` · `POST /api/v1/tutor/stream` (SSE) · `POST /api/v1/tutor/shadow`
- `GET /api/v1/admin/tutor`
- `GET|POST /api/v1/admin/cms`
- `/sitemap.xml` · `/robots.txt`

## Phase 12 search

- `GET /api/v1/search?q=&type=&jlpt=&pos=&difficulty=&limit=&offset=`
- `GET /api/v1/search/autocomplete?q=&limit=`
- `GET /api/v1/search/suggest?q=`
- `GET|POST /api/v1/admin/search` (staff: stats / reindex)

Query operators: `type:kanji`, `jlpt:n5`, `pos:verb`, `difficulty:<=4`, `-exclude`.

## Phase 13 payments

- `GET /api/v1/billing/referrals` — referral code, credit, invitees
- `POST /api/v1/billing/subscription` — `{ action: "cancel" | "resume" }`
- `GET|POST /api/v1/admin/affiliates` — list / create / pause / payout

`AFFILIATE-*` codes now require an active `billing_affiliates` row.
Webhooks dedupe on the provider event id.

## Phase 14 analytics

- `GET /api/v1/admin/analytics` — full overview (staff)
- `GET /api/v1/admin/analytics?section=learning|revenue|funnel|retention|product`
- `GET|POST /api/v1/admin/analytics/demo` — check or seed demo activity

Learning window is controlled with `?days=` (1–365).
