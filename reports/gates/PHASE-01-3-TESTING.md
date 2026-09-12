# Phase 01.3 — Testing Foundation

**Date:** 2026-03-25  
**Scope:** unit, integration, API, and E2E layers, plus the smoke gate  
**Gate status:** PASS

---

## Deployment gate: all smoke tests pass

```
npm run test:smoke   →  11 tests, 11 pass, 0 fail
```

| Target | Tests | Verifies |
|---|---|---|
| **Homepage** | 5 | 200 · complete HTML · server-rendered copy · title + `lang` · no 500 |
| **Health API** | 2 | `{ ok: true }` · JSON content type |
| **Database** | 3 | direct connection · PostgreSQL identified · app and tests reach the same database |
| Baseline | 1 | unknown routes 404 |

The homepage test is meaningful rather than cosmetic: the page runs `select 1`
during server rendering, so a 200 proves the data tier was reachable at render
time, not merely that Node was listening.

---

## Full results

| Layer | Location | Runner | Tests | Result |
|---|---|---|---|---|
| Unit | `tests/unit/` | `node:test` | 61 | pass |
| Integration | `tests/integration/` | `node:test` + PostgreSQL | 11 | pass |
| API | `tests/api/` | `node:test` + live server | 9 | pass |
| Smoke | `tests/smoke/` | `node:test` + server + DB | 11 | pass |
| E2E | `tests/e2e/` | Playwright + Chromium | 8 | pass |
| **Total** | | | **100** | **pass** |

`npm run verify` (structure → env → lint → typecheck → unit → integration →
api + smoke) passes end to end.

---

## Framework selection, on evidence

I probed Playwright before choosing rather than assuming it would not work in
a sandbox: package install, `chromium` download, and `install-deps` all
succeeded. So the browser layer is real Playwright driving real Chromium —
8 specs passing in 3.7s, including hydration and console-error checks that
an HTTP fetch cannot perform.

The other four layers use `node:test`. Node 22 executes TypeScript natively,
so unit, integration, API, and smoke coverage costs **zero test dependencies**
— nothing to keep in step with the bundler.

Playwright is deliberately excluded from `npm run verify`. Browser binaries
are a ~150MB prerequisite a clean runner may not have, and a gate that fails
on a missing download is a gate people learn to ignore. The smoke layer proves
the deployment is serving traffic without it.

---

## Two real defects found

### 1. `/api/health` was cacheable

The API test asserted the healthcheck must not be cached. It failed:
`got: ""` — no `Cache-Control` header at all.

This is an operational hazard, not a style point: a proxy or load balancer
could serve a cached `{ ok: true }` after the database had already failed,
making the healthcheck actively misleading during an incident.

Fixed by adding `no-store, no-cache, must-revalidate`. The response **body is
byte-identical**, so the frozen contract in API_OWNERSHIP §3.1 is intact.

### 2. The test runner leaked server processes

After the first runs, four orphaned `next-server` processes were found
reparented to init (`ppid=1`), each still holding a port:

```
LISTEN *:45385  next-server pid=2602
LISTEN *:37031  next-server pid=2499
LISTEN *:46151  next-server pid=2919
LISTEN *:46163  next-server pid=2691
```

Cause: `next start` forks a `next-server` child. Signalling only the wrapper
killed the parent and orphaned the child.

Fixed by spawning the server `detached` (making it a process-group leader) and
signalling the whole group via `process.kill(-pid, …)`, with `SIGKILL`
escalation. Cleanup also now runs on `SIGTERM` and `uncaughtException`, not
just `SIGINT`.

Verified after the fix: **zero orphaned processes, zero held ports.** The
orphans from the earlier runs were terminated.

---

## Architecture

**One owner for server lifecycle.** Test files never spawn servers.
`scripts/run-server-tests.mjs` builds if needed, binds port `0` to obtain a
free port (no fixed-port collisions between parallel runs), starts the server,
polls `/api/health` until ready, runs the suites with `NB_TEST_BASE_URL` set,
and tears the group down in a `finally`.

A server-backed test run directly fails with instructions rather than hanging:

```
NB_TEST_BASE_URL is not set. Server-backed tests must be launched with:
  npm run test:api     (API layer)
  npm run test:smoke   (smoke layer)
  npm run test:server  (both)
```

**No glob collision.** `node:test` claims `*.test.ts`, Playwright claims
`*.spec.ts`, so neither runner can pick up the other's files.

---

## Test reorganisation

Existing suites moved into the layered structure with imports adjusted:

```
tests/lib/    → tests/unit/lib/
tests/config/ → tests/unit/config/
```

Test-only moves; no production code involved. All 61 still pass.

---

## Notable coverage

Integration tests verify the primitives the canonical schema depends on, not
just that a connection opens: transaction rollback isolation, `jsonb` for
glosses, `text[]` for readings, `timestamptz` for provenance, UTF-8 Japanese
round-tripping (`食べる 漢字 ひらがな カタカナ`), and that parameterised queries
bind rather than interpolate — an injection payload comes back as literal text.

---

## Files

| File | Purpose |
|---|---|
| `tests/helpers/{env,http,db}.ts` | env loading, HTTP assertions, pooled DB access |
| `tests/integration/database.test.ts` | 11 tests, real PostgreSQL |
| `tests/api/health.test.ts` | 9 tests, frozen contract protection |
| `tests/smoke/smoke.test.ts` | 11 tests, the deployment gate |
| `tests/e2e/homepage.spec.ts` | 8 browser specs |
| `playwright.config.ts` | browser layer configuration |
| `scripts/run-server-tests.mjs` | server lifecycle owner |
| `docs/TESTING.md` | layer guide and conventions |
| `src/app/api/health/route.ts` | `no-store` fix, body unchanged |

Dependency added: `@playwright/test` (devDependency, browser layer only).

---

## Gate approval

- [x] Unit tests established (61)
- [x] Integration tests established (11, real database)
- [x] API tests established (9, live server)
- [x] E2E framework established (Playwright + Chromium, 8 specs passing)
- [x] Smoke test covers homepage, health API, database connectivity
- [x] **All smoke tests pass (11/11)**
- [x] lint, typecheck, build all clean
- [x] No orphaned processes after any run
- [x] **APPROVED** — proceed to Phase 01.4
