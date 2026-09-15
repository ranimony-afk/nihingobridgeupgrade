# VERCEL BUILD RECOVERY GATE

**Project:** NihongoBridge — canonical repository `ranimony-afk/nihingobridgeupgrade`
**Baseline audited:** `c1be76c` (`main` HEAD, `A 13.1.1A`)
**Gate status:** **PASS** — `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, full test suite, and functional verification all green
**Date:** 2026-09-15

---

## 1. Original error (as reported)

> "The current production build has previously failed around `src/lib/queries.ts`."

### 1.1 Investigation result — the stated file cannot be the cause

Direct inspection of the current canonical repository (fresh clone, HEAD `c1be76c`, plus full history):

| Check | Result |
|---|---|
| `src/lib/queries.ts` exists? | **No.** No `src/lib/` directory exists at any committed revision. |
| Consumers of `@/lib/queries` | **Zero** matches in `src`, `tests`, or configs. |
| Client component importing any server module? | **None.** All 23 `"use client"` files were scanned: none import `@/db`, `@/services`, `server-only`, or any query module. |
| Import-graph classification of `@/db` (17 consumers: 6 route handlers, 1 `force-dynamic` server page, 10 services) | All **SERVER**. No SERVER→CLIENT leak exists in the tree. |

### 1.2 The two real, reproducible build failures found instead

**E1 — Install failure (hard, every clean checkout):**

```text
npm error code EUSAGE
npm error The `npm ci` command can only install with an existing package-lock.json
```

Root cause: the canonical repository tracks **no lockfile** (`package-lock.json` absent), so `npm ci` fails before any install. Prior phase evidence ("`npm ci` — PASS") was produced from an uncommitted, workspace-generated lockfile and is invalid for the canonical tree.

**E2 — Build failure when `DATABASE_URL` is absent from the build environment:**

```text
Collecting page data using 3 workers ...
Error: DATABASE_URL is required
> Build error occurred
Error: Failed to collect page data for /api/health
```

Root cause: `src/db/index.ts` read `process.env.DATABASE_URL` and **threw at module scope (import time)**. Next.js imports every route/page module during `next build` for metadata/page-data collection, so the build crashed on the *first* `@/db`-importing module whenever the env var was not set — even though every consumer is `force-dynamic` and nothing queries the database at build time. From a distant build log, this DB import-chain crash is plausibly what was summarized as a failure "around queries".

Underlying nuance found while fixing E2: `drizzle()` inspects `client.constructor` at wrap time (`isConfig` in `drizzle-orm/utils.js`) to distinguish a client from a config object, so naïve deferral of pool construction still crashed during module evaluation. The final fix accounts for this exactly (see §3).

## 2. Root cause summary

1. **Reproducibility gap:** no committed `package-lock.json` → `npm ci` EUSAGE on every clean machine (developer, CI, Vercel with `npm ci` install command).
2. **Build-time side effect:** module-scope `throw` in the DB client made a *runtime* secret mandatory at *build* time, contrary to the repository's own evidence (all routes/pages dynamic; no build-time queries).
3. **Hygiene gaps:** no `.gitignore` (risk of committing `node_modules`, `.next`, or a real `.env`), and no hard guard preventing a future client component from importing the database module — the exact *class* of failure the original report suspected in `queries.ts`.

## 3. Files changed

| # | File | Change | Why |
|---|---|---|---|
| 1 | `package-lock.json` | **Added** (lockfileVersion 3, generated from canonical `package.json`) | Makes `npm ci` deterministic and passing; pins exactly the dependency set previously validated (13 pre-existing audit advisories unchanged). |
| 2 | `package.json` | Added dependency `server-only@^0.0.1` | The canonical boundary-guard package; no other dependency touched. |
| 3 | `.gitignore` | **Added** (node_modules, .next, env files, logs, build artifacts, editor/OS) | Prevents accidental commit of dependencies, build output, or secrets. |
| 4 | `src/db/index.ts` | **Rewritten, same public contract** (`export const pool`, `export const db`); same error message `"DATABASE_URL is required"`; same dev-global pool caching semantics | (a) `import "server-only"` at the root of the server data graph — any future client-component import now fails the build immediately and explicitly; (b) pool construction is **lazy** (first query, via a deferred proxy), so build-time module evaluation never requires `DATABASE_URL`; (c) when unconfigured, the proxy answers `constructor` truthfully (`Pool`) to satisfy Drizzle's `isConfig` detection, and throws the original error on the first real access (`query`/`connect`/`end`/`release`). Runtime behavior with a configured database is unchanged. |
| 5 | `vitest.config.ts` | Added `resolve.alias`: `"server-only"` → `./tests/mocks/server-only.ts` | Next.js resolves `server-only` to a no-op for server bundles; plain Node (vitest) resolves the package's client-poison export, which throws by design. The alias mirrors Next's server resolution inside the test runner only. |
| 6 | `tests/mocks/server-only.ts` | **Added** (no-op export) | Test-runner shim for the alias above. The guard stays fully active in Next.js build/runtime, which is where the client/server boundary exists. |
| 7 | `reports/gates/VERCEL-BUILD-RECOVERY-GATE.md` | **Added** (this gate) | Evidence and rollback. |

**Explicitly NOT changed:** `src/db/schema.ts` (zero schema edits, zero migrations), every route/service/page, ESLint or TypeScript configuration strictness, `next.config.ts` (no `ignoreBuildErrors`, no `eslint.ignoreDuringBuilds`), the Phase 13.2 retrieval implementation, and any authentication or client contract.

**`src/lib/queries.ts` was NOT created** — fabricating a file to match an unverified error report would add dead code; the verified root causes were fixed instead.

## 4. Test evidence

| Test | Result |
|---|---|
| Canonical Phase 13.2 suite — `npx vitest run` (`tests/knowledge-retrieval.test.ts`, 14 tests: dictionary/kanji/grammar/sentence retrieval, cross-domain ranking, provenance resolution, entity link traversal, JLPT filter, blank query) | **14/14 PASS** against live PostgreSQL with the new lazy pool + `server-only` guard in the import chain |
| Temporary guard proof (removed after evidence capture) — importing `@/db` without `DATABASE_URL` | **PASS** — no import-time throw |
| Same, first query while unconfigured | **PASS** — loud failure at first access; surfaced through Drizzle as `DrizzleQueryError` with cause `DATABASE_URL is required` |
| Drizzle wrap-time probe (diagnostic) | Confirmed `drizzle()` reads `client.constructor` at wrap time (`drizzle-orm/utils.js:127`) — the fix models this exactly |

## 5. Gate command results

| Command | Result | Notes |
|---|---|---|
| `npm ci` (clean `node_modules`) | **PASS** | Previously `EUSAGE`; now installs from committed lockfile. |
| `npm run lint` | **PASS** — 0 errors, 3 warnings | Identical pre-existing warnings as before the fix (Google-font `<link>` in `layout.tsx`; hook-deps in `question-bank` and `review/session/[id]`). No new warnings, none suppressed. |
| `npm run typecheck` | **PASS** | Strict mode, `--noEmit`. |
| `npm run build` (with env) | **PASS** | All 39 routes compiled (12 static, 27 dynamic/server). |
| `npm run build` (with `DATABASE_URL` deliberately removed — the E2 reproduction) | **PASS** | Previously died at "Collecting page data" with `DATABASE_URL is required`; now compiles and collects cleanly. |
| Platform production verification (`build_and_start` → `/api/health`) | **PASS** | `{ "ok": true }` |

## 6. Functional verification (live production server)

| Surface | Check | Result |
|---|---|---|
| Homepage | `GET /` | **200** — server-rendered, seeds + counts questions |
| Knowledge | `GET /api/knowledge/srs` | **200** |
| Kanji | `GET /kanji` → 200; `GET /api/kanji` | **PASS** — 33 canonical kanji seeded |
| Dictionary | `GET /api/ai/retrieve?q=mizu&domains=dictionary` | **PASS** — `de-mizu` with provenance `first-party:dictionary-core:v1` |
| JLPT | `GET /api/jlpt/tests` (N5 mock seeded), `GET /jlpt/test/jlpt-n5-mock-01` → 200 | **PASS** |
| SRS | `GET /api/srs/decks` | **PASS** — 4 seeded decks |
| Quiz | `GET /api/questions` | **PASS** — 35 questions seeded |
| AI retrieval | `GET /api/ai/retrieve?q=水` (search), `?domain=grammar&id=gp-te-kara` (entity) | **PASS** — citation-tagged chunks; entity mode returns pattern + linked sentences `es-003`, `es-021`; provenance on every chunk |
| Admin | — | **N/A — no admin surface exists in the canonical repository** (no route, page, or service). Recorded so future gates do not chase a phantom requirement. |

## 7. Deployment implications

1. **Vercel install command:** `npm ci` now works from the committed lockfile — recommended to keep as the install command for reproducible builds.
2. **Vercel build:** passes whether or not `DATABASE_URL` is injected at build time. It is still required at **runtime** for any data surface (unchanged); missing runtime config fails loudly on first query.
3. **Database:** schema is push-managed (no migrations). The production database must receive the 26-table canonical schema out-of-band via the documented CLI-flag invocation (`npx drizzle-kit push --dialect postgresql --schema ./src/db/schema.ts --url "$DATABASE_URL"`); `drizzle.config.json` remains inert (drizzle-kit does not load JSON configs) — flagging for a future bounded hardening prompt, not changed here.
4. **Boundary guarantee:** the `server-only` guard makes the *suspected* failure class (client importing a server/DB module) a build-time error forever, with an explicit message — without any change to the existing clean import graph.
5. **No weakening anywhere:** ESLint, strict TypeScript, and Next.js build validation are all fully enabled; no `ignoreBuildErrors`/`eslint.ignoreDuringBuilds`; no credentials exposed; no database logic moved; only a no-op type-level shim added under `tests/`.
6. **Phase gate:** this recovery unblocks Phase 13.3B; it does not implement it.

## 8. Rollback

All changes are additive or internal; rollback is a single-file revert set with zero data or contract impact:

```text
git revert / checkout HEAD -- src/db/index.ts vitest.config.ts package.json
git rm package-lock.json .gitignore tests/mocks/server-only.ts
git rm reports/gates/VERCEL-BUILD-RECOVERY-GATE.md
```

- Rolling back `src/db/index.ts` restores the import-time `throw` (E2 resurfaces for env-less builds only; configured builds keep passing).
- Rolling back the lockfile restores the `npm ci` failure (E1).
- No database objects were created, altered, or dropped by this recovery, and no runtime API changed — no data rollback is required.

## 9. Follow-ups (out of scope for this gate, recorded for the next prompts)

1. Commit these repair artifacts to the canonical GitHub repository (this recovery was validated on a synchronized tree; the canonical tree still lacks the lockfile).
2. Replace the inert `drizzle.config.json` with a working TS config or document the CLI-flag invocation.
3. Authentication remains unimplemented — mandatory before a public deployment and before Phase 13.3+ authenticated AI routes.

---

**Gate decision: PASS — production build recovered, validation strengthened (`server-only` boundary guard), Phase 13.2 gate re-verified (14/14). Safe to proceed to Phase 13.3.**
