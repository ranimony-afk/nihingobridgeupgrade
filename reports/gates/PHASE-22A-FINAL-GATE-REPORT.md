# Phase 22A — Final gate report

**Seeding error-path log disclosure: fix, falsification evidence, regression tests, and GET side-effect inventory**

Prepared 2026-10-28 · branch `arena/54293cff-nihingobridgeupgrade` · HEAD `29e8cc7`

---

## A. Executive verdict

**The defect is fixed and proven fixed.** `TestService.ensureSeeded` no longer
writes SQL text, bound parameters, driver detail, connection targets or stack
traces to the server log; a second instance in `TestService.updateUserAnalytics`
was found and fixed with it. The fix is a closed-vocabulary diagnostic that reads
no message, name, property or stack from the thrown value, keeps a stable
operation id for operability, and cannot itself throw.

Evidence is falsifiable, not asserted: the same 16-test suite **fails 6 tests on
the previous implementation** (with a captured assertion showing the sentinel SQL
string inside the log output) and **passes 16/16 on the fix**.

The secondary objective is complete: every one of the 53 `GET` route handlers in
the application was traced to its service method and then to the write. 25 seed
or write on read, 29 are verified read-only, none unresolved.

Two findings deserve separate attention and were deliberately **not** patched here:

1. **P0** — `GET /api/xp` and `GET /api/analytics` upsert `xp_rules` on *every*
   request via `XpService.syncRegistry`, even when the table is already correct.
2. **Adjacent class** — 57 `console.error/warn(…, error)` sites remain across
   `src/app/api/**/route.ts`, the same disclosure class at a different seam.

Status codes and public response envelopes are unchanged. `ensureSeeded` still
swallows its failure and callers still return `200` — that silent-failure design
is a pre-existing behaviour, reported as a corollary, not altered.

**Public beta remains BLOCKED.** Nothing in this phase changes that.

## B. Repository identity

| Item | Value |
|---|---|
| Repository | `ranimony-afk/nihingobridgeupgrade` |
| Working branch | `arena/54293cff-nihingobridgeupgrade` |
| Base | `main` at `cf7a4c6` (merge of PR #19) |
| Commits under review | `1fb3240` (HTTP response sanitization), `29e8cc7` (this phase) |
| Pull request | **#21 — OPEN**, head `29e8cc7`, `MERGEABLE` / `CLEAN`, 8 files, +998 / −11 |
| CI on exact HEAD | run `40635788135` — `Install · Schema · Test · Typecheck · Lint · Build` **success**, `Vercel Preview Comments` success, `Supabase Preview` skipped |
| Stack | Next.js 16.3.6 · React 19.2.6 · Drizzle 0.45.2 · Vitest · PGlite |
| Environment limits | no local PostgreSQL, `data/` ingestion artifacts absent, production never touched |

**Branch-structure note (honest disclosure):** the plan was to branch from
`origin/main` so the Phase 22A commit could be reviewed in its own PR. This
session is pinned to a single branch — creating or pushing another branch is not
permitted — so the Phase 22A commit sits on the existing PR #21 branch as a
second, separately-scoped commit, and PR #21 was retitled and re-documented to
describe both parts. It is not a silent scope expansion: the PR body states
exactly what each commit does. Section K asks for your decision on how to
sequence it.

## C. Root cause

`src/services/jlpt/testService.ts`, before the change:

```ts
} catch (error) {
  console.error("Failed to seed database questions:", error);
}
```

`console.error` with an `Error` argument serialises the whole object chain.
Drizzle wraps the driver error, so the emitted log line contained:

| Disclosed | Example token captured by the tests |
|---|---|
| SQL text + identifiers | `select "id","prompt",… from "questions"` |
| Bound parameters | `params: SELECT_SENTINEL_7f3a9c` |
| Credential-shaped parameter values | `SENTINEL_PASSWORD_9x2` |
| Connection target / host | `sentinel-db.internal` |
| Driver `code` / `detail` / `hint` | `42P01`, relation detail strings |
| Stack frames + nested `cause` | two chained stack traces |

`TestService.updateUserAnalytics` carried the same defect one level deeper:
`console.warn("Could not update user analytics:", e)`.

**Blast radius:** server log only. `ensureSeeded` catches and swallows, so no
caller returns this text; the HTTP responses were unaffected, and none of the
`GET` handlers that reach it returned the message. The disclosure channel is
whoever can read application logs (platform logs, log drains, support exports).

**Sibling seeders were checked and are clean:** `KnowledgeService.ensureSeeded`,
`KnowledgeCorpusService.ensureSeeded` and `SrsService.ensureSeeded` contain no
raw-error log statement.

## D. Changes made

| File | Type | Purpose |
|---|---|---|
| `src/lib/logging/safeDiagnostics.ts` | new, 163 lines | `DiagnosticOperation`, `FailureCategory`, `classifyFailure`, `describeFailure`, `logOperationFailure` |
| `src/services/jlpt/testService.ts` | modified, +9/−2 | Both log sites now call `logOperationFailure` with a stable operation id; explanatory comments record why the thrown value is not interpolated |
| `tests/seeding-log-sanitization.test.ts` | new, 351 lines | 16 regression tests |
| `reports/gates/PHASE-22A-GET-SIDE-EFFECT-INVENTORY.md` | new | Complete GET side-effect inventory (secondary objective) |

### Design of the diagnostic

- **Fixed vocabulary.** Category is one of `database_unavailable`,
  `database_statement_rejected`, `unknown_failure`. Classification reads only an
  allowlisted `code` value, never a free-text message.
- **Stable operation id.** `"TestService.ensureSeeded failed [category=…]"` keeps
  the log greppable and alertable — the actionability the old line had, without
  the payload.
- **Total by construction.** `cause` traversal is bounded to depth 3; cycles,
  hostile `Proxy` objects, throwing getters, non-`Error` throws and `null` all
  degrade to `unknown_failure`. The function cannot throw, so a diagnostic can
  never break the error path it is reporting on.
- **No framework, no dependency, no global silencing.** It reuses the existing
  `console` sink. Nothing else in the app was changed, and no other logging call
  site was rewritten.

### Why this is not a copy of the rejected approaches

`safePreview` / `redactCause` in `anthropic.ts` mask only API-key shapes and
leave SQL, parameters and hosts intact — rejected. Logging `error.name`
discloses driver class detail with no operability gain — rejected. Adding a
correlation id was dropped because there is no trusted request-id source.

## E. Security evidence

**Falsification run** — the guard suite executed against the *previous*
implementation:

```
backup fix → revert both log sites to console.error/warn(…, error) → run
  Test Files  1 failed (1)
       Tests  6 failed | 10 passed (16)

representative failure:
  expected 'non-Error throw string: [["Failed to seed database questions:", …'
  not to contain 'SELECT_SENTINEL_7f3a9c FROM questions …'
```

That assertion is the leak itself: the sentinel SQL string is present in the
serialised log line. Restoring the fix returns 16/16.

**What the tests pin**

| Test area | Guards against |
|---|---|
| Sentinel SQL / parameter / password / host tokens absent from every log call | Any future re-introduction of payload logging |
| Raw error object never passed as a log argument | The exact original pattern (`console.error(msg, error)`) |
| Four non-`Error` throw shapes (`"string"`, object, `null`, `undefined`) | Rejected non-`Error` crashing the handler or leaking |
| Hostile `Proxy`, self-referential `cause`, throwing getter | The diagnostic throwing on adversarial input |
| Real `TestService.ensureSeeded` and real `GET /api/questions` exercised | A mock-only "fix" that never touches the vulnerable path |
| Status code `200` and response envelope unchanged | A leak fix silently becoming a behaviour change |

The database is stubbed **only** at `@/db` (a chainable awaitable Proxy with a
`NO_FAILURE` symbol sentinel). Every service, handler and log call under test is
the real one; `console` is captured with `vi.spyOn` rather than replaced.

## F. Verification matrix

| Gate | Command | Result |
|---|---|---|
| New guard suite | `npx vitest run tests/seeding-log-sanitization.test.ts` | **16 passed** |
| Falsification | same suite, vulnerable implementation restored | **6 failed / 10 passed** (expected) |
| PR #21 suite + new suite | `npx vitest run tests/seeding-log-sanitization.test.ts tests/questions-get-error-sanitization.test.ts` | **28 passed** |
| Full suite | `npx vitest run` | 47 files passed / 23 failed · 1078 passed / 103 failed / 128 skipped — **pre-existing baseline**, unchanged in composition: missing `data/` ingestion artifacts and no local PostgreSQL (e.g. `kanjivg-etl`, `kanjidic2-*`, `srs-activation`, `jlpt-integration`, `analytics-progress`) |
| Typecheck | `npm run typecheck` | **clean** |
| Lint | `npm run lint` | **0 errors**, 3 warnings (baseline: custom fonts, two hook deps) |
| Build / CI | GitHub Actions run `40635788135` | **success** on `29e8cc7` |

`next build` mutates `next-env.d.ts`; it was reverted before committing. No test
was weakened, skipped or mocked past the vulnerable path.

## G. CI and PR state

- PR **#21 is OPEN**, head `29e8cc7`, `MERGEABLE`, merge state `CLEAN`, 8 files,
  +998/−11.
- CI run `40635788135` — success on the exact HEAD SHA (not a neighbour).
- The PR title and body were rewritten to describe both commits; the second part
  is explicitly headed "Part 2 — Phase 22A", so a reviewer is not asked to infer
  scope.
- **Not merged. No manual deployment was triggered. No production database was
  queried, seeded or mutated.**

## H. Remaining blockers

1. **P0 — unconditional write on read.** `GET /api/xp` (`XpService.getSummary`
   → `syncRegistry`) and `GET /api/analytics` (`AnalyticsService.ensureInitialized`)
   perform an `xp_rules` upsert on every request. Proposed unit **22B-5**.
2. **P1 — 23 GET routes seed on an anonymous read** when the database is empty
   (route-by-route table in `PHASE-22A-GET-SIDE-EFFECT-INVENTORY.md`). Units
   22B-1 … 22B-4 and 22B-6, one service family per change.
3. **Adjacent disclosure class — 57 raw-error log sites** across
   `src/app/api/**/route.ts`. Same class as this phase, different seam. Proposed
   Phase 22C; do not widen Phase 22A to cover it.
4. **Silent seed failure.** `ensureSeeded` swallows and callers return `200`
   with an empty payload; correct for availability, poor for diagnosis. Not
   changed.
5. **`POST /api/quiz/seed` is unauthenticated**; **no rate limiting** (D-13);
   **no sign-in UI**; `question-bank` authoring is ungated. All pre-existing.
6. **Local environment limits:** no real PostgreSQL and no `data/` artifacts, so
   23 suites fail locally identically before and after this change; CI (which
   provisions Postgres) is the authoritative signal.

## I. Deployment and Windows handoff

- **Merge-to-`main` is not deployment-neutral.** Production deploys
  automatically roughly 30 seconds after every merge to `main`; observed at
  2026-10-27T15:23:25Z for `b8747bc`. Merging PR #21 ships both commits to
  production immediately. There is no separate manual deployment step to hold.
- The change is backward compatible: no schema change, no migration, no
  environment variable, no API contract change. Rollback is a revert of one or
  both commits; the log output reverts with it.
- **Windows action: `NONE`.** No Windows-only behaviour is involved — the change
  is server-side TypeScript, the new tests are OS-independent, and the separate
  Windows checkout is untouched. Its existing fix commit
  (`88f8e53f…` on `arena/44bf4800-nihingobridgeupgrade`) stays where it is.
- No local live-server proof is offered as production verification. The evidence
  is unit-level plus CI on the exact SHA.

## J. Next-session recommendation

1. **Decide the sequencing in K**, then merge (if approved) with the deployment
   window understood.
2. **Phase 22B-5 first** — the P0 `xp_rules` upsert is the only finding that
   writes on a *populated* database. Remove `syncRegistry` from the read path and
   move it to an explicit startup/CLI step; prove it with the `xp_rules`
   fingerprint test.
3. **Phase 22B-6 / 22B-2 next** — SRS and JLPT reads are the highest-traffic
   anonymous seeders. Reuse `tests/helpers/pglite-full-snapshot.ts` from PR #19
   so each unit's acceptance test is "schema and row fingerprint identical
   across the GET".
4. **Phase 22C** — sweep the 57 raw-error log sites onto `logOperationFailure`,
   one family per PR, starting with the routes that sit on seeding paths
   (`/api/kana`, `/api/srs/personal`, `/api/srs/*`).
5. **Do not** treat any of this as public-beta readiness; auth, rate limiting and
   the unauthenticated seed endpoint remain open.

## K. User decision

Pick one:

- **A — Merge PR #21 as-is (both commits).** One review, one deployment. Fastest;
  the review surface is larger and mixes an HTTP-response change with a
  server-log change.
- **B — Review in two passes from the same PR.** Comment/approve `1fb3240` and
  `29e8cc7` separately by reading the two commit diffs; merge once. No rebase, no
  force-push, no new branch.
- **C — Hold the merge and split into two PRs later.** Requires a new session
  that is allowed to create a branch off `origin/main`; the Phase 22A commit is
  already isolated in `29e8cc7` and can be cherry-picked cleanly. Nothing is lost
  by waiting, and nothing ships to production in the meantime.

**Recommendation: B.** The two commits are independently reviewable, the
falsification evidence is per-commit, and a single merge keeps the deployment
event count at one. Choose **C** if the review separation matters more than
throughput — the commit boundary already supports it.
