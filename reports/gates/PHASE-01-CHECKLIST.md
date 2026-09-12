# Phase 01.1 — Production Project Foundation

**Date:** 2026-03-25  
**Scope:** establish the frozen monorepo structure and required infrastructure  
**Gate status:** PASS  
**Existing functionality moved:** none

---

## Deployment gate

| Step | Command | Result |
|---|---|---|
| 1 | `npm install` | pass (no dependencies added) |
| 2 | `npm run lint` | pass, clean |
| 3 | `npm run typecheck` | pass, clean |
| 4 | `npm run build` | pass |

Extra checks: `npm run check:structure` pass · `npm test` 37/37 pass.

---

## Route preservation

Build output before and after this phase:

```
┌ ƒ /
├ ○ /_not-found
└ ƒ /api/health
```

Identical. No route added, removed, or renamed.

`GET /api/health` still returns `{ ok: true }` — the frozen contract in
`docs/architecture/API_OWNERSHIP.md` §3.1.

---

## Files NOT modified (verified by SHA-256)

| File | Digest |
|---|---|
| `src/app/api/health/route.ts` | `85ecde9d…` |
| `src/db/schema.ts` | `e93d93c0…` |
| `src/db/index.ts` | `44d8e984…` |
| `src/app/page.tsx` | `aaf4510b…` |
| `src/app/layout.tsx` | `5f2bf3ba…` |
| `src/app/globals.css` | `42070e0b…` |

All match the Phase 00 audit digests. Existing functionality was preserved by
**not touching it**, rather than by refactoring and re-verifying.

---

## Structure established

| Directory | Status | Contents |
|---|---|---|
| `src/app` | existing | untouched |
| `src/components` | **new** | conventions README |
| `src/services` | **new** | conventions README |
| `src/repositories` | **new** | `base.ts` contracts + README |
| `src/db` | existing | untouched |
| `src/lib` | **new** | `errors`, `api-response`, `pagination`, `ids` |
| `src/config` | **new** | `env.ts`, `app.ts` |
| `src/types` | **new** | `api.ts`, `domain.ts`, `index.ts` |
| `tests` | **new** | 4 suites, 37 assertions |
| `scripts` | **new** | `check-structure.mjs` |
| `docs` | existing | + `architecture/` from 00.3 |
| `reports` | existing | audits, matrices, gates |

`src/services` and `src/components` intentionally contain conventions
documentation only. Creating speculative empty modules would violate "add only
required infrastructure"; each subdirectory is created by the phase that
implements it.

---

## Infrastructure added

### Security (closes audit finding SEC-009)

| Item | Detail |
|---|---|
| `.gitignore` | **was missing on both repository A trees.** Ignores `.env*`, `.next`, `node_modules`, ETL data dumps, caches |
| `.env.example` | documents variable **names** only; lists variables banned by the freeze (`SUPABASE_*`, `ALLOW_INSECURE_USER_HEADER`, `ADMIN_DEMO_MODE`, `MEILISEARCH_*`) |
| `src/config/env.ts` | validates configuration; **refuses to start in production** if an auth-bypass switch is present |

### Frozen contracts made executable

| Decision | Implementation |
|---|---|
| Envelope `{ success, data, meta }` | `src/lib/api-response.ts` |
| Error codes → HTTP status | `src/lib/errors.ts` |
| `pageSize` max 100 | `src/lib/pagination.ts` |
| Text PKs, deterministic for imports | `src/lib/ids.ts` |
| JLPT smallint 5=N5 … 1=N1 | `src/config/app.ts` |
| Repository layer contract | `src/repositories/base.ts` |

### Tooling

| Script | Purpose |
|---|---|
| `npm test` | `node --test` with native TypeScript — **zero new dependencies** |
| `npm run check:structure` | fails if the frozen layout drifts or `.env` is unignored |
| `npm run verify` | structure → lint → typecheck → test → build |
| `npm run db:push` / `db:studio` | drizzle-kit wrappers |

---

## Dependency policy

**No packages installed.** Node 22.22 runs TypeScript tests natively, so the
test harness costs nothing at install time and nothing in the bundle.

One `tsconfig.json` change: `allowImportingTsExtensions: true`, so sibling
modules resolve identically under Turbopack and `node --test`. Verified to
survive `next typegen` and the production build.

---

## Regression check

| # | Feature | Verification |
|---|---|---|
| 1 | `GET /api/health` | route present in build output; file unchanged |
| 2 | Homepage SSR after `select 1` | `ƒ /` dynamic; file unchanged |
| 3 | Drizzle client via `DATABASE_URL` | `src/db/index.ts` unchanged |
| 4 | Lint clean | `npm run lint` no output |
| 5 | Typecheck clean | `npm run typecheck` no output |

---

## Test coverage added

| Suite | Assertions | Covers |
|---|---|---|
| `tests/lib/ids.test.ts` | 9 | determinism, normalisation, collision resistance, input rejection |
| `tests/lib/pagination.test.ts` | 7 | clamping, hostile input, offset maths |
| `tests/lib/api-response.test.ts` | 12 | envelope shape, status mapping, **internal-detail leak prevention** |
| `tests/config/env.test.ts` | 9 | required config, bad URLs, production bypass rejection |

Notable: one test asserts a thrown error containing a database URL never
reaches the client body.

---

## Not done in this phase (deliberate)

- No identity/auth implementation — Phase 01.2
- No schema tables — Phase 01.3 (additive port from GitHub A)
- No Repository B code
- No new routes
- No middleware (arrives with auth)

---

## Gate approval

- [x] Structure established
- [x] Existing routes preserved and hash-verified
- [x] Only required infrastructure added
- [x] `npm install` / `lint` / `typecheck` / `build` all pass
- [x] Tests pass (37/37)
- [x] No dependencies added
- [x] **APPROVED** — proceed to Phase 01.2 (identity and authentication)
