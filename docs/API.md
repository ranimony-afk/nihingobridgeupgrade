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
