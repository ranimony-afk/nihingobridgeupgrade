# Phase 22B-5 — `xp_rules` write-on-read: gate report

**Scope:** remove unnecessary persistent writes from `GET /api/xp` and
`GET /api/analytics`, proving it against observed database state.

Prepared 2026-10-28 · branch `arena/54293cff-nihingobridgeupgrade`
· commit `1ba949b` · CI run `40638157697` (green on that exact SHA)

---

## A. Verdict

**Fixed and proven.** `XpService.syncRegistry` performed an unconditional
`INSERT … ON CONFLICT DO UPDATE` for every XP rule, and it is reachable from two
unauthenticated reads. Each `GET /api/xp` rewrote all 7 rule rows; each
`GET /api/analytics` rewrote them twice (14 statements), because
`AnalyticsService.ensureInitialized` syncs and then `XpService.getSummary` syncs
again.

The mirror is a real requirement, so it is preserved: the sync now compares the
stored rows with the registry and writes only rules that are missing or drifted.
On an already-correct database a read issues **zero** writes and the database is
byte-identical before and after.

Falsification is per-test, not asserted: with the previous implementation
restored, **3 of the 6 new tests fail**, including two that count the writes the
application's own pool issued (21 and 42 `INSERT … ON CONFLICT` statements).

## B. Repository identity

| Item | Value |
|---|---|
| Repository | `ranimony-afk/nihingobridgeupgrade` |
| Branch | `arena/54293cff-nihingobridgeupgrade` |
| Base | `main` at `cf7a4c6` |
| Commit under review | `1ba949b` (parent `5f46833`) |
| Commits on branch | `1fb3240`, `29e8cc7`, `5f46833`, `1ba949b` |
| Pull request | **#21 — OPEN**, head `1ba949b`, `MERGEABLE` / `CLEAN` |
| CI on exact HEAD | run `40638157697`, job `122649840922`, all 15 substantive steps `success` |
| Environment | no local PostgreSQL binary → disposable PGlite server over the wire protocol; no production access |

## C. Root cause and trace

```
GET /api/xp ──────────► XpService.getSummary (xpService.ts:339)
                          └─► XpService.syncRegistry      → 7 × upsert

GET /api/analytics ───► AnalyticsService.getUserProgressSummary (:89)
                          ├─► ensureInitialized (:47) ─┬─ XpService.syncRegistry → 7 × upsert
                          │                             └─ TestService.ensureSeeded  (SELECT-count guarded)
                          └─► XpService.getSummary (:340) └─ syncRegistry → 7 × upsert
```

`syncRegistry` in one sentence, before the change: *for every rule in the code
registry, upsert the database mirror row and stamp `synced_at = now()`* — with no
comparison against what was already stored.

`xp_rules` is documented in-source as an audit mirror of code metadata
(`REGISTRY SYNC — DB mirrors code metadata for audit only`). It is genuinely
required: the `analytics-progress` suite asserts the rows exist, and drift should
self-heal. The defect is the *frequency*, not the existence.

Blast radius: every anonymous GET rewrites a small fixed set of rows, so this is
write amplification and needless `synced_at` churn (a row-version/timestamp
signal readers would see as "the registry just changed"), not corruption.

## D. Change

`src/services/gamification/xpService.ts` (one function plus four module-local
helpers, +78/−2):

| Element | Purpose |
|---|---|
| `db.select({…}).from(rulesTable)` | Read the mirrored columns once per call |
| `ruleMirrorMatches(stored, descriptor)` | Compare persisted metadata against the registry |
| `stableJson(value)` | Order-insensitive `jsonb` comparison, so a round-trip is not mistaken for drift |
| `if (stale.length === 0) return XP_RULE_COUNT` | The read path's no-write fast path |
| `for (const d of stale)` | Upsert **only** missing/drifted rules |

Deliberate preservation, each visible in the code comments:

- **Insert semantics unchanged:** a new row is inserted with `isActive: true`.
- **Conflict semantics unchanged:** the update set still omits `isActive`, so a
  manually deactivated rule is never reactivated by a sync. `isActive` is
  therefore excluded from the comparison.
- **Self-healing unchanged:** a deleted row is recreated; a drifted row is
  rewritten (with a fresh `synced_at`).
- **Call sites unchanged:** `getSummary` and `ensureInitialized` still call
  `syncRegistry`, so no initialisation contract moves. Only the write volume
  changes.
- No schema change, no migration, no new dependency, no response change.

## E. Before/after database evidence

Measured on a disposable in-memory PostgreSQL (PGlite over the wire protocol,
driven through the application's own `@/db` pool and the real route handlers).

| Observation | Before (`5f46833`) | After (`1ba949b`) |
|---|---|---|
| `GET /api/xp` × 3 → write statements | **21** `INSERT … ON CONFLICT` | **0** |
| `GET /api/analytics` × 3 → write statements | **42** `INSERT … ON CONFLICT` | **0** |
| `xp_rules.synced_at` after repeated reads | bumped on every rule, every request | unchanged for every rule |
| Full schema+row snapshot, 3 reads | differed (rows rewritten) | **identical**, SHA-256 `961503e7…` |
| Summary body across 3 reads | equal | equal (unchanged contract) |
| Empty database, first `GET /api/xp` | seeded 7 rules | **still seeds 7 rules** |
| Empty database, first `GET /api/analytics` | seeded questions + 7 rules | **still seeds both** |
| Drifted rule row (`base_points + 100`, stale `synced_at`) | repaired (all 7 rewritten) | repaired, **only that row rewritten** |
| Deleted rule row | recreated | recreated |

Representative captured statement (identical 21 times before the change):

```
insert into "xp_rules" ("key","version","event_type","name","description",
"base_points","daily_cap","default_params","is_active","synced_at")
values ($1,...,$10) on conflict ("key") do update set "version" = $11, ...
"default_params" = $17, "synced_at" = $18
```

## F. Tests added

`tests/xp-read-path-write-isolation.test.ts` — 6 tests, real PostgreSQL engine,
real handlers, real pool:

| # | Test | Fails before fix |
|---|---|---|
| 1 | `GET /api/xp` on an empty DB populates the mirror and keeps its response contract | no (initialisation must survive) |
| 2 | `GET /api/analytics` on an empty DB still seeds what it depends on | no |
| 3 | `GET /api/xp` × 3 issues no INSERT/UPDATE/DELETE and changes no row | **yes** (21 writes) |
| 4 | `GET /api/analytics` × 3 issues no INSERT/UPDATE/DELETE and changes no row | **yes** (42 writes) |
| 5 | a drifted rule is repaired and **only** that row is rewritten | **yes** (blanket rewrite) |
| 6 | a deleted rule row is recreated | no |

Assertions are on state, not on mocks: the full `snapshotDatabase()` (schemas,
types, catalog, columns, constraints, indexes, triggers, policies, functions,
rows, sequences) is compared before and after, `synced_at` is compared per row,
and the statements captured from `pool.query` are classified. The two tests that
must pass on both implementations are the ones that pin the required
initialisation semantics — that asymmetry is what keeps the suite from being a
tautology, and it is verified by running the fix reverted.

## G. Verification matrix

| Gate | Command | Result |
|---|---|---|
| New suite (fix) | `npx vitest run tests/xp-read-path-write-isolation.test.ts` | **6 passed** |
| New suite (falsification) | same, `xpService.ts` reverted to `5f46833` | **3 failed / 3 passed** |
| New suite + Phase 22A suite, with a real `DATABASE_URL` set | `… tests/seeding-log-sanitization.test.ts tests/xp-read-path-write-isolation.test.ts` | **22 passed** (env-independent) |
| Adjacent: analytics/XP semantics | `tests/analytics-progress.test.ts` against disposable PG | **5 passed** |
| Adjacent: shared search harness | `tests/unified-search.test.ts` | **19 passed** |
| Adjacent: read-path sanitization | `tests/questions-get-error-sanitization.test.ts` | **12 passed** |
| Adjacent: authoring authorization | `tests/questions-post-authorization.test.ts` | 54 passed / 1 failed — **pre-existing**, reproduces identically with this change reverted (test 31 expects 409, PGlite reports the conflict differently; runs green on real PostgreSQL in CI) |
| Full suite | `npx vitest run` | **23 failed / 48 passed files**, 103 failed / 1084 passed / 128 skipped — identical failure set to the pre-change baseline (missing `data/` artifacts, no local PostgreSQL); the only delta is **+6 passing** tests |
| Typecheck | `npm run typecheck` | clean |
| Lint | `npm run lint` | **0 errors**, 3 warnings (baseline) |
| Build | `npm run build` | success (`next-env.d.ts` reverted) |
| CI | run `40638157697` | **success**, including *Test (P3/P4 — real Vitest run against PostgreSQL)* |

`tests/analytics-progress.test.ts` cannot pass without a PostgreSQL server and is
not in the CI run list; it was executed here against a disposable PGlite server
to prove the semantics it pins still hold.

## H. PR and CI state

- PR **#21 OPEN**, head `1ba949b`, `MERGEABLE` / `CLEAN`.
- CI run `40638157697` on the exact SHA: all of `Install`, `Assert toolchain
  determinism`, `Initialize disposable schema`, `Provision JMdict`,
  `Provision KanjiVG`, `Test (P3/P4)`, `Typecheck`, `Lint`, `Production build`,
  `Assert build/runtime contract` — success.
- `.github/workflows/ci.yml` now also lists `tests/xp-read-path-write-isolation.test.ts`
  **and** `tests/seeding-log-sanitization.test.ts`. That second entry closes a gap
  found during this phase: the Phase 22A regression suite existed but was never
  added to the CI run list, so it had never actually been enforced.
- **Not merged. Nothing deployed. No production database was read or written.**

## I. Branch-separation question (the precondition asked for)

**Mechanically, the commits are separable.** Evidence gathered without mutating
anything:

| Check | Result |
|---|---|
| `1fb3240` parent | `cf7a4c6` = current `origin/main` → rebasing onto `main` is a no-op |
| `git merge-tree --write-tree origin/main 1fb3240` | clean tree `40dd8efd…`, no conflicts |
| File overlap between `1fb3240` and `29e8cc7` | **0** files in common |
| `29e8cc7` patch applied to `origin/main`'s tree (`GIT_INDEX_FILE` scratch index) | `git apply --cached --check` → **exit 0** |
| `1ba949b` | touches `xpService.ts`, a new test file, `ci.yml` — all disjoint from the other commits |

**Procedurally it is blocked in this session.** Arena pins this session to
`arena/54293cff-nihingobridgeupgrade`: creating another branch, switching to it,
or pushing to it is not permitted. A separate per-commit PR therefore cannot be
opened from here. Per instruction, the separation was **not** attempted and
PR #21 was **not** silently restructured.

Consequence to be explicit about: `1ba949b` lands on the **existing PR #21
branch**, so that PR now carries four commits across two phases. This is
disclosed in the PR body (Part 3, added with this commit), not folded in
quietly. Each commit is independently cherry-pickable when a session that may
create branches picks this up — `git cherry-pick 1ba949b` onto `origin/main`
applies cleanly by construction (disjoint file set from `1fb3240`/`29e8cc7`,
except `ci.yml`, which `1fb3240` also touched — cherry-pick in order to avoid a
conflict there).

## J. Remaining risks

1. **P1 — 23 `GET` routes still seed on an anonymous read** when the database is
   empty (`TestService`, `KnowledgeService`, `KnowledgeCorpusService`,
   `SrsService`, `JLPTKnowledgeService`). Inventory:
   `PHASE-22A-GET-SIDE-EFFECT-INVENTORY.md`. This change removed the only
   *unconditional* write; the conditional seeders remain.
2. **Silent seed failure** in `TestService.ensureSeeded` (swallowed, caller
   returns 200) is unchanged.
3. **`tests/analytics-progress.test.ts` and `tests/jlpt-integration.test.ts` are
   not in the CI run list** and require a database; they can regress unnoticed
   unless run locally against a disposable server.
4. **57 raw-error `console.error/warn(…, error)` sites** remain across
   `src/app/api/**/route.ts` (Phase 22C candidate); `GET /api/xp` and
   `GET /api/analytics` are among them — their catch blocks still log the raw
   error and return `error.message` to the client.
5. **No rate limiting** (D-13), `POST /api/quiz/seed` unauthenticated, no sign-in
   UI, `question-bank` authoring ungated.
6. **Public beta remains BLOCKED.**

## K. Next highest-priority confirmed issue

**`GET /api/xp` and `GET /api/analytics` still leak `error.message` to the client
and log the raw error.** Their catch blocks are:

```ts
console.error("GET /api/xp error:", error);
return NextResponse.json({ success: false, error: message }, { status: 500 });
```

That is exactly the defect PR #21's first commit fixed for
`GET /api/questions` — the same class, on the same surface, on routes that touch
the database. It is the highest-value next unit: one commit, two handlers, reuse
`logOperationFailure` from `src/lib/logging/safeDiagnostics.ts`, and extend
`tests/xp-read-path-write-isolation.test.ts` or add a sibling suite asserting no
SQL/parameters/credentials appear in the body or the log. This was **deliberately
not** included here: this commit is scoped to write behaviour, and mixing a
response-contract change into it would make both harder to review.
