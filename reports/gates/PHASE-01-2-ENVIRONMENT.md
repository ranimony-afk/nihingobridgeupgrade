# Phase 01.2 — Environment System

**Date:** 2026-03-25  
**Scope:** typed environment validation across six configuration groups  
**Gate status:** PASS  
**Dependencies added:** none

---

## Deployment gate

| Step | Result |
|---|---|
| `npm install` | pass — 394 packages, nothing added |
| `npm run lint` | pass, clean |
| `npm run typecheck` | pass, clean |
| `npm run build` | pass — routes unchanged |
| `npm test` | 61/61 pass (was 37) |

Routes after this phase: `ƒ /` · `○ /_not-found` · `ƒ /api/health` — identical.

---

## Gate requirement: build fails clearly when configuration is absent

A `prebuild` hook runs `scripts/validate-env.mjs`, so the build aborts **before
Next.js starts** rather than dying inside page collection with a stack trace.

### Proof 1 — required value missing

`.env` emptied, then `npm run build`:

```
  Environment validation FAILED
  ------------------------------------------------------
  Errors:
  - DATABASE_URL: DATABASE_URL is required. Copy .env.example to .env and
    set a PostgreSQL connection string.
  ------------------------------------------------------
  Fix: copy .env.example to .env and provide the values above.
  No secrets are printed by this tool.
```

Exit code **1**. Next.js never ran.

### Proof 2 — every problem reported in one pass

Six malformed variables produced **eight** errors simultaneously, so an
operator fixes the environment once instead of one variable per build:

```
  - NEXT_PUBLIC_APP_URL: must be a valid absolute URL
  - LOG_LEVEL: must be one of: debug, info, warn, error
  - DATABASE_URL: must be a postgresql:// connection string
  - AUTH_SESSION_SECRET: must be at least 32 characters
  - STORAGE_BUCKET: required when STORAGE_DRIVER="s3"
  - STORAGE_REGION: required when STORAGE_DRIVER="s3"
  - STORAGE_ACCESS_KEY_ID: required when STORAGE_DRIVER="s3"
  - STORAGE_SECRET_ACCESS_KEY: required when STORAGE_DRIVER="s3"
```

### Proof 3 — banned configuration blocks the build

```
  - ALLOW_INSECURE_USER_HEADER: ALLOW_INSECURE_USER_HEADER is an
    authentication bypass and is not supported. Remove it.
```

The freeze's rejected bypass switches are now mechanically unusable, not
merely discouraged in prose.

`.env` was restored and the full gate re-run after each experiment.

---

## Configuration groups implemented

| Group | Variables | Behaviour when absent |
|---|---|---|
| **Database** | `DATABASE_URL` (required), `DATABASE_POOL_MAX`, `DATABASE_SSL` | fatal — build stops |
| **Application** | `NEXT_PUBLIC_APP_URL`, `APP_NAME`, `LOG_LEVEL` | defaults; URL shape validated |
| **Authentication** | `AUTH_SESSION_SECRET`, `AUTH_COOKIE_NAME`, three TTLs | dev: ephemeral key + warning · prod: **server refuses to start** |
| **AI** | `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_MODEL`, timeout, token cap | falls back to deterministic mock provider |
| **Storage** | `STORAGE_DRIVER` (none/local/s3) + bucket, region, credentials, endpoint, public URL | disabled; media features stay off |
| **Search** | `SEARCH_TRIGRAM_THRESHOLD`, `SEARCH_MAX_RESULTS`, `SEARCH_AUTO_CREATE_EXTENSIONS` | PostgreSQL defaults |

Conditional validation: S3 credentials are demanded **only** when
`STORAGE_DRIVER="s3"`; an explicitly requested AI provider demands its own key.

---

## Design decisions

**Build-time requirements are not coupled to `NODE_ENV`.** Probing showed npm's
`prebuild` hook runs with `NODE_ENV=undefined`, while Next sets `production`
during the build itself. Tying required configuration to `NODE_ENV` would make
the gate behave differently on Vercel than locally. Instead:

- **Build-required:** `DATABASE_URL` + shape validity of anything supplied.
- **Production-runtime-required:** `AUTH_SESSION_SECRET`, enforced by
  `assertRuntimeReady()`.

This keeps the freeze's "runs with only `DATABASE_URL`" rule intact while still
guaranteeing production cannot serve traffic with an unsigned session store.

**`parseEnvironment` is pure.** It accepts a plain record and returns
`{ ok, config, errors, warnings }` — no globals, no throwing, no I/O — so all
28 environment tests run against literal objects with no process mutation.

**Errors versus warnings.** Fatal misconfiguration stops the build; degraded
modes (mock AI, no storage, ephemeral dev key) warn and continue.

**Secrets are never printed.** Messages contain variable *names* only; a test
asserts this.

---

## Single-source enforcement

`src/db/index.ts` now reads through `serverEnv()` instead of `process.env`
directly. This is a deliberate modification to a file preserved in Phase 01.1,
made because two independent readers of `DATABASE_URL` contradicted the
config module's own "single place" contract.

Behaviour is preserved and improved: a missing URL still fails, now with the
full aggregated diagnostic. The pool additionally honours `DATABASE_POOL_MAX`
and `DATABASE_SSL`. `GET /api/health` is unchanged and still returns
`{ ok: true }`.

---

## Defect found and fixed by the new tests

The test *"every problem is collected, not just the first"* failed on the first
run. `parseDatabase` returned early when `DATABASE_URL` was missing, so
`DATABASE_POOL_MAX` and `DATABASE_SSL` were never validated — violating the
aggregate-reporting promise.

Fixed: tuning options are validated unconditionally, and only the returned
config is gated on the URL.

```
before:  errors: LOG_LEVEL, DATABASE_URL
after:   errors: LOG_LEVEL, DATABASE_POOL_MAX, DATABASE_URL
```

---

## Test coverage

| Suite | Tests | Notable assertions |
|---|---|---|
| `tests/config/env.test.ts` | 28 | boots with only `DATABASE_URL`; production refuses to start without a session secret; S3 demands all four credentials; bypass switches fatal; `SUPABASE_*` / `MEILISEARCH_*` warn; secrets never rendered |
| `tests/lib/*` | 33 | unchanged from Phase 01.1 |
| **Total** | **61** | all passing |

---

## Files

| File | Change |
|---|---|
| `src/config/env.ts` | rewritten — six typed groups, pure validation, warning/error split |
| `.env.example` | rewritten — every variable documented by section, with a rejected-variables appendix |
| `scripts/validate-env.mjs` | new — build gate and standalone checker |
| `src/db/index.ts` | reads validated config; honours pool and SSL settings |
| `tests/config/env.test.ts` | rewritten — 28 tests |
| `scripts/check-structure.mjs` | guards the new required files |
| `package.json` | `prebuild`, `validate:env`, `validate:env:runtime` |

---

## Secret hygiene

- `.env` remains git-ignored and was never committed.
- `.env.example` contains names and safe defaults only.
- Validation output prints variable names, never values.
- A generation hint (`openssl rand -base64 48`) is documented rather than a
  sample secret that someone might paste into production.

---

## Gate approval

- [x] Typed validation for all six required groups
- [x] `.env.example` created and complete
- [x] No secrets committed
- [x] Production build fails clearly when configuration is absent (3 proofs)
- [x] `npm install` / `lint` / `typecheck` / `build` pass
- [x] 61/61 tests pass
- [x] Routes unchanged
- [x] **APPROVED** — proceed to Phase 01.3 (canonical schema port)
