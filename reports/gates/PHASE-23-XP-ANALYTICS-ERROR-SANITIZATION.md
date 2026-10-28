# Phase 23 — XP and analytics read-path error sanitization

**Scope:** stop `GET /api/xp` and `GET /api/analytics` from disclosing database
internals in HTTP responses and server logs.

Prepared 2026-10-28 · branch `arena/54293cff-nihingobridgeupgrade`
· code commit `6adb6f0` · PR #21

---

## A. Verdict

**Fixed, with the finding confirmed against live code first.** Both handlers
returned `error.message` to the client and passed the raw thrown object to
`console.error`. `GET /api/analytics` additionally had a bypass: `catch (error:
any)` followed by `error.message` meant a thrown `null`/`undefined` threw *inside*
the catch block, so no sanitization decision was ever reached.

Both now log a classified diagnostic (operation id + allowlisted category, no
exception content) and return a stable message with `error.code:
"INTERNAL_ERROR"` and `Cache-Control: no-store`, matching the convention already
established for `GET /api/questions` and `GET /api/search`.

**12 of 16 new tests fail on the previous implementation and all 16 pass on the
fix**, so the evidence is falsifiable rather than asserted.

## B. Initial state, verified before any edit

| Item | Value |
|---|---|
| Repository root | `/home/user/nihingobridgeupgrade` |
| Remote | `origin` → `https://github.com/ranimony-afk/nihingobridgeupgrade.git` |
| Branch | `arena/54293cff-nihingobridgeupgrade` (pinned by the session) |
| HEAD at start | `c20d54fb54a8551f69b11b52446f4fe7bef35455` |
| Upstream | `origin/arena/54293cff-nihingobridgeupgrade`, 0 unpushed |
| Worktree | clean, no untracked files |
| `origin/main` | `cf7a4c673236af2f507af8529dae0946fbed3bdf` — branch is **5 ahead, 0 behind** |
| Commits on branch | `1fb3240`, `29e8cc7`, `5f46833`, `1ba949b`, `c20d54f` |
| PR #21 | **OPEN**, head `c20d54f`, `MERGEABLE` / `CLEAN`, 12 files, +1907/−12, title *fix(read-paths): stop leaking SQL/driver detail and stop writing on reads* |
| CI on `c20d54f` | `Install · Schema · Test · Typecheck · Lint · Build` success; `Vercel Preview Comments` success; `Supabase Preview` skipped |
| `syncRegistry` write-isolation fix (Phase 22B-5) | **present** — `xpService.ts:50` `stableJson`, `:67` `ruleMirrorMatches`, `:112` stale filter, `:115` early return |
| `safeDiagnostics` helper (Phase 22A) | **present and tested** — `src/lib/logging/safeDiagnostics.ts`, 2 callers in `testService.ts` (`:115`, `:487`), covered by `tests/seeding-log-sanitization.test.ts` (16 tests) |

The prior report's claim about both handlers was **re-read in the live files and
confirmed**, not assumed. No commit was reset, rewritten, or force-pushed; PR #21
was not restructured.

## C. Root cause and exact error paths

### `GET /api/xp` — `src/app/api/xp/route.ts:34`

```ts
} catch (error) {
  const message = error instanceof Error ? error.message : "Failed to load XP summary";
  console.error("GET /api/xp error:", error);     // raw object → log
  return NextResponse.json({ success: false, error: message }, { status: 500 }); // message → body
}
```

### `GET /api/analytics` — `src/app/api/analytics/route.ts:14`

```ts
} catch (error: any) {
  console.error("GET /api/analytics error:", error);          // raw object → log
  return NextResponse.json(
    { success: false, error: error.message || "Failed to load progress summary" },
    { status: 500 }                                            // message → body
  );
}
```

### Dependency trace (where a database exception originates)

```
GET /api/xp ─► XpService.getSummary (:339)
                 ├─ syncRegistry (:100)      db.select(xp_rules), db.insert/upsert
                 ├─ dayWindow → DailyQueueService.getSettings   db.select
                 ├─ db.select(xp_events) ×6 (total, revoked, today, week,
                 │                          bySource, daily trend)
                 ├─ awardedTodayByRule ×N    db.select
                 └─ recent ledger            db.select
              — no try/catch inside getSummary: the route is the only boundary

GET /api/analytics ─► AnalyticsService.getUserProgressSummary (:89)
                        ├─ ensureInitialized (:47)  Promise.all([
                        │     XpService.syncRegistry,        ← throws first
                        │     TestService.ensureSeeded ])    ← swallows internally
                        ├─ XpService.getSummary → the tree above
                        ├─ db.select(srs_reviews), db.select(xp_events),
                        │  db.select(test_sessions) ⨝ test_answers,
                        │  db.select(xp_events, recent)
                        └─ — no try/catch inside: the route is the only boundary
```

Nested behaviour worth recording: `TestService.ensureSeeded` catches and swallows
by design, so on a database that is reachable but failing, it emits a classified
diagnostic (Phase 22A) and the failure surfaces from the next query in
`getSummary` instead. The analytics suite asserts both behaviours are leak-free.

**Bypass found and closed:** a thrown `null` reached `error.message` at
`analytics/route.ts:19` and raised `TypeError: Cannot read properties of null
(reading 'message')` *inside* the catch — reproduced in the baseline run. That is
a sanitization bypass, not just a cosmetic leak.

### Conventions that already existed (and were reused, not duplicated)

| Convention | Where | Shape |
|---|---|---|
| Safe diagnostic | `src/lib/logging/safeDiagnostics.ts` | `logOperationFailure(level, operation, thrown)` → `<operation> failed [category=…]` |
| Flat sanitized error envelope | `GET /api/questions`, `GET /api/questions/[id]` | `{ success: false, error: "<stable>", code: "INTERNAL_ERROR" }` + `Cache-Control: no-store` |
| Nested error envelope | `errorBody()` in `src/lib/api/routeParams.ts` (dictionary/search/kanji/cms) | `{ success: false, error: { code, message } }` |

`/api/xp` and `/api/analytics` already spoke the **flat** envelope, so the flat
convention was adopted. Using `errorBody()` would have changed the response
shape and broken existing consumers — deliberately avoided.

No parallel logging framework was created: the helper gained two vocabulary
entries, nothing else.

## D. Files changed

| File | Change |
|---|---|
| `src/app/api/xp/route.ts` | GET catch → `logOperationFailure` + stable body with `code` + `no-store` |
| `src/app/api/analytics/route.ts` | Same; `catch (error: any)` → `catch (error)`; `.message` read removed |
| `src/lib/logging/safeDiagnostics.ts` | `DiagnosticOperation` gains `"XpService.getSummary"` and `"AnalyticsService.getUserProgressSummary"` (union only — no logic change) |
| `tests/xp-analytics-error-sanitization.test.ts` | **new**, 16 tests |
| `.github/workflows/ci.yml` | registers the new suite in the required PostgreSQL run step |

Not changed: successful response shapes, `userId`/`historyDays` handling, status
codes, authentication/authorization, schema, initialisation semantics, XP rule
synchronization, `POST`/`DELETE` handlers.

## E. Tests and falsification evidence

`tests/xp-analytics-error-sanitization.test.ts` — the **real** handlers and the
**real** `XpService` / `AnalyticsService` / `DailyQueueService` / `TestService`
execute; only the `@/db` boundary is replaced with a chainable awaitable stub.
Logs are captured through the application's `console` and rendered with
`node:util.format` — the same renderer console uses — so an `Error` passed as a
log argument shows its message and stack instead of serializing to `{}`.

| # | Requirement | Test |
|---|---|---|
| 1 | XP database failure | "returns a stable 500 envelope …" (xp) |
| 2 | Analytics database failure | "returns a stable 500 envelope …" (analytics) |
| 3 | SQL sentinel absent from body + log | sentinel `xp_rules_sentinel_3b7e` |
| 4 | Bound-parameter + DSN/credential sentinels absent | `PARAM_SENTINEL_c40a91`, `sentinel-db.invalid`, `SENTINEL_PASSWORD_7d13`, `sentinel_app` |
| 5 | Stack-trace sentinel absent | `sentinelAnalyticsFrame_9ac4` |
| 6 | Non-Error throws (string, object, `null`, `undefined`) | 8 parameterised tests |
| 7 | Status + stable envelope preserved | `500` + `{success:false,error,code:"INTERNAL_ERROR"}` + `no-store` |
| 8 | Success contract intact | 3 tests incl. `userId` parameter |
| 9 | XP write-isolation suite still passes | run separately (§F) |
| 10 | Question GET + POST authorization still pass | run separately (§F) |

**Falsification (final test file, code reverted to `c20d54f`):**

```
npx vitest run tests/xp-analytics-error-sanitization.test.ts
  vulnerable implementation →  12 failed | 4 passed (16)
  fixed implementation      →  16 passed (16)
```

Captured pre-fix log, rendered exactly as console would print it:

```
GET /api/xp error: Error: Failed query: SELECT t.id FROM xp_rules_sentinel_3b7e WHERE t.key = $1
    at sentinelAnalyticsFrame_9ac4 (/srv/sentinel/analytics_sentinel.ts:88:17) {
  cause: Error: password authentication failed for user "sentinel_app"
         (postgresql://sentinel_app:SENTINEL_PASSWORD_7d13@sentinel-db.invalid:5432/sentinel_db)
```

and the pre-fix analytics bypass:

```
TypeError: Cannot read properties of null (reading 'message')
 ❯ Module.GET src/app/api/analytics/route.ts:19:38
```

The four tests that pass on both implementations are the ones that pin
**successful** contracts — that asymmetry is what prevents the suite from being
a tautology, and it is verified by running the fix reverted rather than assumed.

## F. Verification results

| Command | Result |
|---|---|
| `npx vitest run tests/xp-analytics-error-sanitization.test.ts` | **16 passed** |
| same, with the fix reverted | **12 failed / 4 passed** (expected) |
| same, with a real `DATABASE_URL` exported (CI condition) | **16 passed** — env-independent |
| `npx vitest run tests/xp-read-path-write-isolation.test.ts` | **6 passed** (Phase 22B-5 intact) |
| `npx vitest run tests/questions-get-error-sanitization.test.ts` | **12 passed** |
| `npx vitest run tests/seeding-log-sanitization.test.ts` | **16 passed** |
| `npx vitest run tests/unified-search.test.ts` | **19 passed** |
| `npx vitest run tests/dictionary-kanji-navigation.test.ts` | **20 passed** |
| `npx vitest run tests/kanji-stroke-order-route.test.ts` | **6 passed** |
| `tests/questions-post-authorization.test.ts` (real PostgreSQL) | **54 passed / 1 failed** — test 31, pre-existing |
| `npm run typecheck` | clean |
| `npm run lint` | **0 errors**, 3 warnings (baseline) |
| `npm run build` | success (`next-env.d.ts` reverted) |
| `npx vitest run` (full) | **23 failed files / 49 passed**, 103 failed / **1100 passed** / 128 skipped |

### Real PostgreSQL vs PGlite vs mocked — stated explicitly

- **Real PostgreSQL:** the CI job's `Test (P3/P4 — real Vitest run against
  PostgreSQL)` step, plus `tests/questions-post-authorization.test.ts` run here
  against a disposable PGlite server speaking the PostgreSQL wire protocol
  (the local sandbox has no PostgreSQL binary).
- **PGlite (in-process engine):** `tests/xp-read-path-write-isolation.test.ts`
  (own server; exercised in Phase 22B-5 and re-run here).
- **Database boundary mocked:** `tests/xp-analytics-error-sanitization.test.ts`
  — deliberate and appropriate, because the subject is the *error path*; a real
  database cannot be made to fail with sentinel SQL on demand. All application
  code above the boundary is real.

### Pre-existing failures — reproduced, not labelled

Full-suite failure set compared against the Phase 22B-5 baseline captured on
`c20d54f`:

```
diff <baseline failure list> <current failure list>   →  empty
before: 23 failed files, 103 failed tests, 1078 passed
after : 23 failed files, 103 failed tests, 1100 passed   (+22 = 6 + 16 new tests)
```

Causes are unchanged and environmental: absent `data/` ingestion artifacts
(`kanjivg-*`, `kanjidic2-*`, `jmdict-*`) and no local PostgreSQL for
`analytics-progress` / `jlpt-integration` / `srs-activation`.

`questions-post-authorization` test 31 (expects `409`, PGlite yields `500`) was
run again with **this phase's fix stashed** and failed identically — it is
untouched by this change, and passes against real PostgreSQL in CI.

## G. CI registration

`.github/workflows/ci.yml` step *Test (P3/P4 — real Vitest run against
PostgreSQL)* now lists `tests/xp-analytics-error-sanitization.test.ts`
(line 154). Vitest fails when a listed path matches no file, so a green step
proves the suite executed rather than being skipped; the file also mocks only
`@/db`, so it cannot silently skip for want of a database.

## H. Remaining error-leakage sites and blockers

1. **Same file, other verbs.** `POST /api/xp` (`:82`, `:83`), `DELETE /api/xp`
   (`:103`, `:104`) and `POST /api/analytics` (`:55`, `:57`) still return
   `error.message` and log the raw error. Out of this phase's scope (GET only),
   and `POST /api/analytics` repeats the `error.message` null-throw hazard.
2. **55 raw-error log sites remain** across `src/app/api/**/route.ts`
   (`41` files), unchanged by this phase apart from the two GETs fixed here.
3. **Two error-envelope conventions coexist**: flat
   (`{error, code}`) for questions/xp/analytics, nested (`error: {code,message}`)
   via `errorBody()` for dictionary/search/kanji/cms. Both are now sanitized, but
   clients must handle both shapes.
4. **23 GET routes still seed first-party fixtures on an anonymous read**
   (`PHASE-22A-GET-SIDE-EFFECT-INVENTORY.md`); Phase 22B-5 removed only the
   unconditional write.
5. **Silent seed failure** in `TestService.ensureSeeded` (swallowed, caller sees
   200) is unchanged.
6. **D-13 rate limiting absent**; `POST /api/quiz/seed` unauthenticated; no
   sign-in UI; `question-bank` authoring ungated.
7. **Session constraint:** the branch is pinned; a separate branch or PR cannot
   be created or pushed from this session, so this commit lands on PR #21 (now
   six commits) and is disclosed in the PR body rather than restructured.
8. **Public beta remains BLOCKED.**

## I. Safety confirmations

- No production database was read, queried, seeded or mutated.
- Every test ran against an in-memory PGlite instance created and destroyed by
  the test process, or against mocked boundaries.
- PR #21 was **not** merged; no deployment was triggered; no manual deploy.
- No commit was reset, amended, rebased or force-pushed; no branch was deleted;
  no uncommitted work was overwritten.
- The temporary PGlite helper script used for the PostgreSQL-wire tests was
  removed; no generated artifacts or secrets are in the diff.

## J. Windows action

**NONE.** The change is server-side TypeScript plus a CI list entry; no
Windows-only behaviour is involved and the separate Windows checkout is
untouched.

## K. Recommended next phase

**Phase 24 — mutating-verb error sanitization, starting with `POST /api/analytics`
and `POST`/`DELETE /api/xp`.** They carry the identical defect this phase fixed on
the read paths, including the `error.message` null-throw hazard, and they sit on
routes clients actively call. One commit, three handlers, reuse
`logOperationFailure`; extend this suite rather than creating another. After that,
sweep the remaining 55 raw-error log sites one service family per PR.
