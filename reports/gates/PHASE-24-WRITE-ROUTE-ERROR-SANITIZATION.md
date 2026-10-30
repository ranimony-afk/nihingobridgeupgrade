# Phase 24 — XP and analytics WRITE-path error sanitization

**Scope:** `POST /api/analytics`, `POST /api/xp`, `DELETE /api/xp` — stop
database-exception disclosure and stop misreporting failed writes.

Prepared 2026-10-28 · branch `arena/54293cff-nihingobridgeupgrade`
· code commit `1e7ced1` · PR #21

---

## A. Executive verdict

**PASS WITH CONDITIONS.**

All three write routes now handle every thrown shape without exposing SQL,
bound parameters, DSNs, credentials or stacks, and without a secondary exception
inside the catch. **27 of 36 new tests fail on the previous implementation and
all 36 pass on the fix.** Validation, success, not-found and idempotency
behaviour are preserved and asserted.

Two deliberate behaviour corrections are included and called out in §D/§K —
a failed award/revoke now returns **500** instead of 400, and
`AnalyticsService.trackStudyEvent` now surfaces a failed ledger write instead of
reporting `200`. Both are corrections of a *misreport*, not of a success path,
but they are contract-visible and need the user's explicit decision. That is the
condition attached to this verdict.

One pre-existing authorization gap was found and **not** fixed (§H.1): these
write routes have no authentication at all. It does not make the sanitization
unsafe, so it was kept out of scope per instruction.

## B. Repository identity

| Item | Initial | Final |
|---|---|---|
| Repository root | `/home/user/nihingobridgeupgrade` | unchanged |
| Remote | `origin` → `https://github.com/ranimony-afk/nihingobridgeupgrade.git` | unchanged |
| Branch | `arena/54293cff-nihingobridgeupgrade` (session-pinned) | unchanged |
| HEAD | `d914355a060719c591bd3e93ca187855cac9a3d1` | `1e7ced17ee1ce416733f0e64741df077e4d07dff` |
| Upstream | `origin/arena/54293cff-nihingobridgeupgrade`, 0 unpushed | 0 unpushed |
| Worktree | clean; no staged, unstaged or untracked files | clean |
| `origin/main` | `cf7a4c673236af2f507af8529dae0946fbed3bdf` — 7 ahead, 0 behind | 8 ahead, 0 behind |
| PR #21 | OPEN, head `d914355`, `MERGEABLE`/`CLEAN`, 16 files, +2583/−19 | OPEN, head `1e7ced1` |
| CI on the starting HEAD | `Install · Schema · Test · Typecheck · Lint · Build` success | — |
| `safeDiagnostics` | present (`classifyFailure`/`describeFailure`/`logOperationFailure`), 4 call sites | present, 8 call sites |
| Phase 23 GET sanitization | present in both routes | untouched |
| Phase 22B-5 write isolation | present (`stableJson`, `ruleMirrorMatches`, stale early-return) | **untouched** |

No reset, clean, rebase, amend, force-push or branch deletion was performed.
PR #21 was not restructured; the new work is an additive commit.

## C. Root cause and exact error paths

### `POST /api/xp` (was `route.ts:81`)

```ts
} catch (error) {
  const message = error instanceof Error ? error.message : "Failed to award XP";
  console.error("POST /api/xp error:", error);           // raw object → log
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}
```

Leak in the body, leak in the log, and a **server-side failure answered 400** —
which instructs clients not to retry a write that never reached the ledger.

### `DELETE /api/xp` (was `route.ts:102`) — identical pattern, identical 400.

### `POST /api/analytics` (was `route.ts:54`)

```ts
} catch (error: any) {
  console.error("POST /api/analytics error:", error);
  return NextResponse.json(
    { success: false, error: error.message || "Failed to track study event" },
    { status: 500 }
  );
}
```

`error.message` on a thrown `null`/`undefined` raised **inside the catch** and
escaped the handler. Reproduced in the baseline run:

```
TypeError: Cannot read properties of null (reading 'message')
 ❯ Module.POST src/app/api/analytics/route.ts:57:38
TypeError: Cannot read properties of undefined (reading 'message')
 ❯ Module.POST src/app/api/analytics/route.ts:57:38
```

### Two further leaks on the same paths (found by tracing, not by the report)

1. **`XpService.awardSafe`** (`xpService.ts:377`) —
   `console.warn("XP award failed (non-fatal):", error)` serialized the raw
   driver error. It is called from `AnalyticsService.trackStudyEvent`, i.e. the
   `POST /api/analytics` path.
2. **`AnalyticsService.trackStudyEvent`** (`analyticsService.ts:69`) awarded
   through `awardSafe`, which swallows and returns `null`, and the method turned
   that into `{awarded:false, points:0}` → the route answered **200 for a write
   that failed**. Baseline test evidence: `expected 200 not to be 200`.

### Also traced and left unchanged (by design)

- `XpService.award`'s insert catch classifies a failure as a dedupe collision by
  **matching the message text** (`includes("unique") || includes("duplicate")`).
  It leaks nothing, but it can convert a genuinely *different* failure into a
  silent duplicate. Reported in §H.3; not changed here (behavioural, adjacent).
- `award` never throws for a missing rule or a zero-point outcome — those are
  normal `skipped` results, so sanitization cannot mask them.

## D. Changes

| File | Reason |
|---|---|
| `src/app/api/xp/route.ts` | `POST`: body parsing isolated from the mutation (malformed JSON stays 400, parser text not echoed); award failure → `logOperationFailure` + stable 500 envelope + `no-store`. `DELETE`: same sanitization; revoke failure → 500. |
| `src/app/api/analytics/route.ts` | `catch (error: any)` → `catch (error)`; `error.message` removed; `logOperationFailure` + stable 500 envelope + `no-store`. |
| `src/services/gamification/xpService.ts` | `awardSafe` logs a classified diagnostic instead of the raw error. Non-fatal contract **unchanged** (still returns `null`). |
| `src/services/analytics/analyticsService.ts` | `trackStudyEvent` awards through the throwing `award()` so a failed ledger write surfaces; `awarded`/`points` derived from a non-null result. |
| `src/lib/logging/safeDiagnostics.ts` | Four vocabulary entries. No logic change; existing callers unaffected. |
| `tests/xp-analytics-write-route-sanitization.test.ts` | New, 36 tests. |
| `.github/workflows/ci.yml` | Register the suite in the required PostgreSQL run step. |

Envelopes after the change (all with `Cache-Control: no-store`):

```json
POST /api/xp       500 { "success": false, "error": "Failed to award XP",          "code": "INTERNAL_ERROR" }
DELETE /api/xp     500 { "success": false, "error": "Failed to revoke XP",         "code": "INTERNAL_ERROR" }
POST /api/analytics 500 { "success": false, "error": "Failed to track study event", "code": "INTERNAL_ERROR" }
POST /api/xp       400 { "success": false, "error": "Request body must be valid JSON" }   // malformed body
```

### Contract-visible changes (explicit)

| Behaviour | Before | After | Rationale |
|---|---|---|---|
| `POST`/`DELETE /api/xp` on a database failure | `400` + raw message | `500` + `INTERNAL_ERROR` | A failed server write is not a client error; 400 told clients not to retry. |
| `POST /api/xp` malformed JSON | `400` + parser message (quotes input) | `400` + stable message | Same status; parser text no longer echoed. |
| `POST /api/analytics` when the ledger insert fails | `200 {awarded:false}` | `500 INTERNAL_ERROR` | The write did not happen; a failed mutation must not report success. |
| `POST /api/xp` validation / `DELETE` missing key / 200 success paths / `revoked:false` | — | unchanged | Asserted in §E. |

## E. Security evidence

### Sentinels (synthetic; no production data or real credentials)

`INSERT_SENTINEL_9f21`, `xp_events_sentinel_c7d3`, `PARAM_SENTINEL_5a0e77`,
`sentinel-write-db.invalid`, `sentinel_writer`, `SENTINEL_PASSWORD_4c81`,
`SENTINEL_TOKEN_8d2f60`, `sentinelWriteFrame_1e6b`.

The error deliberately avoids the words "unique"/"duplicate" so `award`'s
message-matching cannot convert the failure into a silent duplicate and mask
what is being measured.

### Falsification — final test file, code reverted to `d914355`

```
npx vitest run tests/xp-analytics-write-route-sanitization.test.ts
  vulnerable implementation →  27 failed | 9 passed (36)
  fixed implementation      →  36 passed (36)
```

Representative pre-fix failures:

```
expected 'POST /api/xp error: Error: Failed que…' to contain 'XpService.award failed [category=data…'
expected 400 to be 500            (POST and DELETE /api/xp database failure)
expected 200 not to be 200        (POST /api/analytics, failed award reported as success)
expected null to be 'no-store'
TypeError: Cannot read properties of null (reading 'message')      ← analytics bypass
```

The 9 tests that pass on both implementations are exactly the success,
validation, not-found and idempotency tests — that asymmetry keeps the suite
from being a tautology.

### Coverage map (requested 1–14)

| # | Requirement | Where |
|---|---|---|
| 1–3 | DB failure per route | three `describe` blocks |
| 4–6 | SQL / parameter+DSN / stack sentinels absent from bodies | `expectNoSentinel` on every body |
| 7 | All sentinels absent from captured logs | every failure test + `loggedRawErrorObject()` |
| 8 | `null`, `undefined`, string, plain object, ordinary `Error` | 15 parameterised tests across 3 routes |
| 9 | Analytics null-throw hazard | two tests, incl. the explicit `route.ts:57` case |
| 10 | Success / validation / not-found / authorization | 9 preservation tests |
| 11 | Failed mutations do not report success | route-level + `trackStudyEvent` + `award` insert failure |
| 12–14 | Phase 23 GET, write-isolation, question POST auth | run separately in §F |

### Authorization and mutation safety review (§5)

- **No authentication or authorization exists on any of the three routes** —
  verified: no `auth`, `requirePermission`, actor or permission call in either
  file. Nothing was added or removed; the security boundary is unchanged.
- Order is preserved: validation returns **before** any mutation is attempted.
  Invalid requests never reach `award`/`revoke`/`trackStudyEvent` (asserted by
  the 400 tests, which run with a db stub that would otherwise record a write).
- No 401/403/404 exists on these routes today, so nothing could be converted to
  a 500; the two status changes are confined to server-side failures.
- Idempotency: duplicate `dedupeKey` still returns `200 {duplicate:true}` with
  the same `eventId` — asserted. Retries do not double-award.
- `DELETE` of an unknown key still returns `200 {revoked:false}` — asserted.
- No test touches production accounts, credentials or data; every failure is
  synthetic and every database is either mocked or an in-memory PGlite instance.

## F. Verification matrix

| Command | Result | Layer |
|---|---|---|
| `npx vitest run tests/xp-analytics-write-route-sanitization.test.ts` | **36 passed** | mocked `@/db` only; real routes/services |
| same, code reverted | **27 failed / 9 passed** | expected |
| `tests/xp-analytics-error-sanitization.test.ts` (Phase 23 GET) | **16 passed** | mocked `@/db` |
| `tests/xp-read-path-write-isolation.test.ts` | **6 passed** | PGlite, real `@/db` pool |
| `tests/questions-get-error-sanitization.test.ts` | **12 passed** | service double |
| `tests/seeding-log-sanitization.test.ts` | **16 passed** | mocked `@/db` |
| `tests/analytics-progress.test.ts` | **5 passed** | **real PostgreSQL** (disposable PGlite server over the wire) |
| `tests/questions-post-authorization.test.ts` | **54 passed / 1 failed** | **real PostgreSQL** — test 31, pre-existing |
| `tests/unified-search.test.ts` | **19 passed** | PGlite + real pool |
| `tests/dictionary-kanji-navigation.test.ts` | **20 passed** | PGlite |
| `tests/kanji-stroke-order-route.test.ts` | **6 passed** | unit |
| `npm run typecheck` | clean | — |
| `npm run lint` | **0 errors**, 3 warnings (baseline) | — |
| `npm run build` | success (`next-env.d.ts` reverted) | — |
| `npx vitest run` (full) | **23 failed files / 50 passed**, 103 failed / **1136 passed** / 128 skipped | mixed |
| CI run `40642060214` on `1e7ced1` | **success**, incl. *Test (P3/P4 — real Vitest run against PostgreSQL)* | **real PostgreSQL in CI** |

### PostgreSQL vs PGlite vs mocked

- **Real PostgreSQL in CI:** the workflow's `Test (P3/P4 …)` step runs against a
  provisioned PostgreSQL service; the new suite is registered there (green).
- **Real PostgreSQL elsewhere:** this sandbox has no PostgreSQL binary, so
  `analytics-progress` and `questions-post-authorization` were run against a
  disposable in-memory PGlite server speaking the PostgreSQL wire protocol
  through the application's own pool.
- **PGlite in-process:** `xp-read-path-write-isolation`, `unified-search`,
  `dictionary-kanji-navigation`.
- **Database boundary mocked:** the two sanitization suites — deliberate, since
  a live database cannot be made to fail with sentinel SQL on demand.

### Pre-existing failures — reproduced, not assumed

Full-suite failure list compared with the Phase 23 baseline captured on
`d914355`:

```
diff <baseline list> <current list>   →  empty  (identical failure set)
before: 23 failed files, 103 failed tests, 1100 passed
after : 23 failed files, 103 failed tests, 1136 passed   (+36 = the new suite)
```

Causes unchanged and environmental: missing `data/` ingestion artifacts
(`kanjivg-*`, `kanjidic2-*`, `jmdict-*`) and no local PostgreSQL for
`analytics-progress` / `jlpt-integration` / `srs-activation`.
`questions-post-authorization` test 31 (expects 409, PGlite returns 500) was
re-run with **this phase's fix stashed** and failed identically — unrelated.

No test was skipped, weakened or replaced.

## G. Delivery

| Item | Value |
|---|---|
| Commit | `1e7ced17ee1ce416733f0e64741df077e4d07dff` (`fix(api): sanitize XP and analytics write-path errors`) |
| Branch | `arena/54293cff-nihingobridgeupgrade` (pinned) |
| PR | `https://github.com/ranimony-afk/nihingobridgeupgrade/pull/21` — **OPEN** |
| CI on that exact SHA | run `40642060214` — success |
| Mergeability at time of writing | `MERGEABLE` / `CLEAN` |

**Branch constraint:** the session is pinned to this branch; a separate branch
or PR cannot be created or pushed. The commit was therefore added to PR #21 as a
distinct, independently cherry-pickable commit and disclosed in the PR body
(Part 5). Nothing was rewritten or silently restructured.

## H. Remaining risks

1. **No authentication or authorization on these three write routes**
   (pre-existing, confirmed). Anyone can award XP or record study events for any
   `userId` supplied in the body or query string. This is the most serious
   finding in this area; it needs its own phase and a permission model decision.
2. **52 raw-error log sites remain** across `src/app/api/**/route.ts`.
3. **`XpService.award` classifies dedupe collisions by message substring**
   (`"unique"`/`"duplicate"`), not by SQLSTATE `23505`. A non-duplicate failure
   whose text contains either word would be reported as a successful duplicate.
4. **`awardSafe` still swallows** for 7 other call sites (SRS, sessions,
   knowledge, test sessions). That is intentional there — the award is a
   secondary effect — but it means silent XP loss remains possible on those
   paths.
5. **`POST /api/analytics` still answers 500 for a malformed body** (unchanged
   from before); only `/api/xp` now separates parse errors.
6. **Two error-envelope conventions coexist** (flat `{error, code}` vs nested
   `errorBody()`), and long-standing release blockers remain: D-13 rate
   limiting, unauthenticated `POST /api/quiz/seed`, no sign-in UI, ungated
   `question-bank` authoring, 23 GET routes that seed on read.
7. **Public beta remains BLOCKED.**

## I. Safety

- **No production database was accessed**, queried, seeded or mutated.
- **No merge occurred. No deployment or manual deploy was triggered.**
- No push to `main`, no force-push, no branch deletion, no history rewrite.
- All test infrastructure was disposable and in-memory; the temporary PGlite
  wire-protocol helper used for the PostgreSQL-wire suites was removed and never
  staged.
- No secrets, credentials, generated artifacts or environment data in the diff.
- **Windows action: NONE.** The change is server-side TypeScript plus a CI list
  entry; no Windows-only behaviour is involved and the separate Windows checkout
  is untouched.

## J. Next phase

**Phase 25 — authorization for the XP and analytics write routes.** They accept
an arbitrary `userId` and record persistent state with no authentication. That
outranks further log cleanup: it is an integrity boundary, not a hygiene
boundary. A bounded unit would be: require an authenticated actor, derive the
user id from the actor instead of the body, and reject mismatch with `403` using
the existing `AuthorizationError` / `toErrorPayload` convention — reusing the
pattern PR #20 already established for `POST /api/questions`.

## K. User decision

**The implementation is ready for review. Merge and deployment require your
explicit authorization** — and this PR is not deployment-neutral: every merge to
`main` auto-deploys to production in roughly 30 seconds.

Please decide on the two contract-visible corrections before merging:

- **A — Accept both** (recommended): failed writes return `500 INTERNAL_ERROR`,
  and `/api/analytics` no longer reports a failed award as `200`.
- **B — Strict status preservation:** revert only the `xp` routes' 400 → 500
  mapping (keeps the sanitized message and `INTERNAL_ERROR` code on a 400).
- **C — Hold** the whole commit for a dedicated review session.

Everything else in this change is additive and contract-preserving.
