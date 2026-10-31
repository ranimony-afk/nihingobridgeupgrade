# Security Report — Removing Canonical Kanji Writes from Unauthenticated Read Paths

**Status:** Implemented and validated (database-free). **Not committed, not pushed, no PR created — awaiting authorization.**
**Date:** 2026-10-31
**Branch:** `arena/76b3ae66-nihingobridgeupgrade`
**Base:** `dbeef97` (= `origin/main` at implementation time)
**Companion audit:** `reports/security/CANONICAL-KANJI-WRITE-PATH-AUDIT.md` (findings re-verified against this checkout, see §2)

---

## 1. State rechecked before modifying anything

| Item | Value at start of work |
|---|---|
| Branch | `arena/76b3ae66-nihingobridgeupgrade` |
| HEAD | `dbeef971c25e345019a3fd44ec5de165322de978` (identical to `origin/main`) |
| Worktree | Clean except the previous turn's untracked audit report |
| PR #27 | **OPEN**, not draft, base `main`, head `arena/6878136a-…` @ `6fc51009f908b71785861628a4633850009ced9f`, `MERGEABLE` — **unchanged, untouched, not merged** |
| PR #27 CI | `Install · Schema · Test · Typecheck · Lint · Build` = SUCCESS (run `41177622334`) |

### 1.1 Critical scoping fact discovered up front

**PR #27's guards do not exist on this branch.** `src/etl/kanji/canonicalWriteGate.ts`, `src/etl/kanji/loader.ts`'s `denyCanonicalKanjiWrite()` calls, `tests/helpers/trustedDatabaseExecutor.ts` and `tests/kanji-canonical-write-denial.test.ts` are all absent from `main`/`dbeef97`; they exist only on PR #27's own branch.

Consequences for requirement 7 ("keep the three blocked canonical-ingestion suites fail-closed"):
* Nothing on this branch can be "un-blocked" — the gate is not here.
* Duplicating PR #27's helper on this branch would create a conflicting second implementation of a security boundary. **Not done.**
* The three suites (`tests/kanji-expansion.test.ts`, `tests/kanjidic2-canonical-ingestion.test.ts`, `tests/kanjidic2-canonical-ingestion-gates.test.ts`) were **not touched at all**. On this branch they are still ungated, exactly as they are on `main`, and they fail for lack of a database (§6.2). Once PR #27 merges they fail closed via `requireTrustedDatabaseExecutor()` without any change from this work.

---

## 2. Audit findings re-verified against current code

| Audit claim | Verified? | Evidence in this checkout |
|---|---|---|
| `KnowledgeService.ensureSeeded()` writes `kanji_radicals`, `kanji_entries`, `kanji_composition` | **Confirmed** | `knowledgeService.ts` inserts at `:165` (radicals), `:186` (kanji), `:207` (composition) |
| Its only precondition is "`kana_entries` is empty" | **Confirmed** | `:150–153` — `select count(*) from kana_entries`; `if ((row?.count ?? 0) > 0) return;` |
| Every read method calls it first | **Confirmed** | 11 call sites, all `await this.ensureSeeded();` as the first statement |
| Anonymous GET routes reach it | **Confirmed** | `/api/ai/retrieve` directly; `/api/kanji`, `/api/kanji/[character]`, `/api/kana`, `/api/knowledge/srs`, `/api/jlpt/*` transitively. `proxy.ts` only refreshes an auth cookie; no route gating, no `src/middleware.ts` |
| `@/db` applies no target classification | **Confirmed** | `src/db/index.ts:58–84` builds a `Pool` from `DATABASE_URL`; TLS verification relaxed for non-loopback hosts (`:76–82`) |
| `scripts/ingest-kanjidic2.ts` is a separate direct SQL writer | **Confirmed** | `:457` BEGIN, `:463–466` `DELETE FROM kanji_entries`, `:500–506` `INSERT … ON CONFLICT`, `:513` COMMIT |
| Only `fixtureSetup.ts` classifies its target | **Confirmed** | `fixtureSetup.ts:40` (`NODE_ENV === "production"` refusal), `:32` `classifyDatabaseTarget`, pool/connection identity re-verification, single transaction |

**One audit nuance corrected here:** the audit counted 11 lazy call sites inside `KnowledgeService` (correct) but listed 6 route families. Verified routing: `KnowledgeService` is imported by exactly 5 API route modules plus `fixtureSetup`; the JLPT routes reach it only through `JLPTKnowledgeService.ensureInitialized()`. No server component consumes it.

---

## 3. The change (minimal: 3 source files, 27 lines net)

### 3.1 `src/services/knowledge/knowledgeService.ts`

* Removed all 11 `await this.ensureSeeded();` calls — `getKanaChart`, `searchKana`, `getKanaById`, `listKanji`, `listElements`, `buildMindTree`, `getKanjiDetail`, `addKanaToSrs`, `addKanjiToSrs`, `addKanaRowToSrs`, `getKnowledgeStats`.
* `ensureSeeded` itself is **unchanged in behavior** and still available as a bootstrap operation.
* Added a documented security invariant at the operation: bootstrap-only, never from a request path; names the sole remaining production caller and the enforcing test.

The SRS builders (`addKanaToSrs`, `addKanjiToSrs`, `addKanaRowToSrs`) were included deliberately: they are unauthenticated `POST /api/knowledge/srs` handlers, so leaving the lazy call there would have preserved the identical canonical-write trigger under a different verb. On an unbootstrapped database they now return `null` ("not found") instead of silently seeding — verified by test.

### 3.2 `src/app/api/ai/retrieve/route.ts`

* Dropped `KnowledgeService.ensureSeeded()` from the `Promise.all` and removed the now-unused import.
* `KnowledgeCorpusService.ensureSeeded()` is **kept** — it seeds `dictionary_entries`, `grammar_patterns`, `example_sentences`, `knowledge_sources`, none of which are canonical Kanji tables. Changing it is out of scope and would alter dictionary behavior (see gap G2).

### 3.3 `src/services/jlpt/knowledge/jlptKnowledgeService.ts`

* `ensureInitialized()` no longer calls the Kanji seeder (this is what `GET /api/jlpt/overview` and `/api/jlpt/progress` reach). Corpus + question seeding are retained, with a comment stating why the Kanji seeder is excluded.

### 3.4 First-party bootstrap (requirement 5)

No new bootstrap mechanism was invented. It already exists and is already explicit and classified:

```
npm run dictionary:seed-fixtures
  → scripts/seed-dictionary-fixtures.ts
    → seedDictionaryFixturesForDisposableDatabase()      (src/services/dictionary/fixtureSetup.ts)
      • refuses NODE_ENV=production                      (:40)
      • refuses PGOPTIONS                                (:44)
      • plain-URL shape check, then classifyDatabaseTarget (:23–37)
      • requires classification === DISPOSABLE && decision === ALLOW (:59)
      • refuses a cached pool that disagrees, and re-verifies live client
        host/port/database/user/password/options + current_database/current_user (:63–113)
      • one transaction; seeds corpus then KnowledgeService.ensureSeeded(tx) (:107–108)
```

After this change that script is the **only** production caller of `KnowledgeService.ensureSeeded`, which the regression test asserts as an allowlist. No environment variable, token, or flag was added anywhere.

### 3.5 Explicitly not changed

`src/etl/kanji/**` (including the guarded loaders, as they exist on PR #27), `scripts/**`, `src/db/schema.ts`, `src/data/**`, `package.json` dependencies, `package-lock.json`, the three canonical-ingestion suites, and every other pre-existing modification.

---

## 4. Regression tests

New file: **`tests/kanji-read-path-write-isolation.test.ts`** — 11 tests, database-free, registered in `.github/workflows/ci.yml` (appended at the end of the existing test list, deliberately far from PR #27's insertion so both hunks apply cleanly).

Method: the real `KnowledgeService`, the real `JLPTKnowledgeService` and the real `/api/ai/retrieve` route, with **only** `@/db` replaced by a recording proxy:

* `select()` returns a chainable object that resolves to `[]` (an unbootstrapped database);
* `insert` / `update` / `delete` / `execute` / `transaction` / `query` and any unknown `pool` property **throw on access**, so a canonical write cannot happen silently — it is both impossible and recorded.

Three layers:

1. **Static invariant (fails if the vulnerability returns):** no `await this.ensureSeeded()` in the service; no `KnowledgeService.ensureSeeded` in any of the 8 request-path modules; the only source-file caller is `fixtureSetup.ts`; `.insert(radicalsTable|kanjiTable|compositionTable)` appears *only* inside `ensureSeeded`; `/api/ai/retrieve` no longer imports the service at all.
2. **Behavioural:** all 10 read entry points resolve on an empty database without invoking `ensureSeeded` and without touching any write verb; the two SRS builders return `null` with no writes; `ensureInitialized()` and `GET /api/ai/retrieve` (returns **200**) do not seed.
3. **Boundary:** the explicit bootstrap still refuses production, still requires an explicitly classified disposable target, is reachable only through the standalone script (not a route), and still refuses with no `DATABASE_URL`/classification without reaching the writer.

---

## 5. Verification evidence — what actually executed

Environment: this sandbox, `npm ci` (444 packages, from `package-lock.json`, no file changed), **no `DATABASE_URL`**, no PostgreSQL, no network database.

| Check | Command | Result |
|---|---|---|
| New regression suite | `npx vitest run tests/kanji-read-path-write-isolation.test.ts` | **PASS — 11/11** |
| Route/service suites that cover the edited paths (DB-free) | `npx vitest run tests/kanji-read-path-write-isolation.test.ts tests/kanji-mindtree-mpagination.test.ts tests/dictionary-kanji-experience-routes.test.ts tests/kanji-stroke-order-route.test.ts tests/unified-search.test.ts tests/xp-analytics-read-authorization.test.ts` | **PASS — 6 files, 142/142 tests** |
| Typecheck | `npm run typecheck` | **PASS** (no output) |
| Lint | `npm run lint` | **PASS** — 0 errors, 3 pre-existing warnings in files not touched by this change |
| Build | `npm run build` | **PASS** (all routes compiled; generated `next-env.d.ts` churn reverted) |
| Full local suite — AFTER | `npx vitest run --reporter=json` | 1,344 passed / 107 failed / 140 skipped; **24 failed files** |
| Full local suite — BEFORE (pristine `git archive dbeef97` in `/tmp/baseline`) | same | 1,333 passed / 107 failed / 140 skipped; **24 failed files** |
| Failure parity | per-file diff of failed suites and failure counts | **IDENTICAL** (same 24 files, same per-file counts). Delta is +11 passing tests = exactly the new suite. |

**Mutation testing (test sensitivity, not just a green run).** Re-introducing the vulnerability made the suite fail:

| Mutation | Failed tests |
|---|---|
| Re-added `await this.ensureSeeded();` to `listKanji` + `KnowledgeService.ensureSeeded()` to `GET /api/ai/retrieve` | **6 of 11 failed** (both static invariant tests, the caller allowlist, the read-method behaviour, the route test, and the bootstrap-refusal test) |
| Mutations reverted | **11/11 pass again** |

### 5.1 What did NOT execute — stated plainly

* ~~No database-backed test was run.~~ **Superseded by §11:** the read-path verification was subsequently executed against an isolated, explicitly classified disposable PGlite target (loopback `127.0.0.1:55432`, fresh `/tmp` data directory, passwordless, destroyed afterwards). The 24 failing suites of the local run still fail **identically before and after** this change, for environment reasons: `DATABASE_URL is required` (`src/db/index.ts:99`) or missing `data/kanjidic2.xml` / `data/kanjivg*` artifacts.
* **The three canonical-ingestion suites were not executed as "blocked".** On this branch they are ungated (§1.1); they fail at collection/`beforeAll` for lack of a database. They were executed only as part of the full local run, where their failure counts are byte-identical to the pristine baseline.
* **No CI run exists for this branch yet** (nothing was pushed). PR #27's green CI belongs to PR #27's branch, not to this change.
* No ingestion, seeding, reconciliation, or mutation script was executed. `npm ci`, `typecheck`, `lint`, `build` and `vitest` are the only commands run.

### 5.2 Known behaviour change (intentional, and its bounds)

A cold, never-bootstrapped database no longer self-seeds Kanji/kana data on request. Observable effects, all confined to that state:

* Kanji list / detail / mind-tree return empty or `null` instead of lazily creating 33 + rows.
* `/api/kana` still renders the full chart: `getKanaChart` rebuilds rows from `KANA_ROWS` and fabricates ids for characters absent from the database (`knowledgeService.ts`, chart-rebuild block), so the kana UI does not blank out.
* SRS "add" on an unbootstrapped database returns `null` → route answers 404 "not found" rather than seeding.
* On any seeded database (the expected production state) behaviour is unchanged: the removed call was a no-op after the first `kana_entries` row existed.

---

## 6. Review of the other canonical-seeding suites (requirement 8)

| Suite | Seeds canonical rows via | Gate on this branch | Recommendation |
|---|---|---|---|
| `tests/kanji-expansion.test.ts` | `KnowledgeService.ensureSeeded()` + `runKanjiETLPipeline()` | **None here**; gated on PR #27 | Leave untouched. PR #27's gate covers it. |
| `tests/kanjidic2-canonical-ingestion-gates.test.ts` | destructive SQL + `ensureSeeded` + pipeline | **None here**; gated on PR #27 | Leave untouched. |
| `tests/kanjidic2-canonical-ingestion.test.ts` | `executeKanjidicIngestion` | **None here**; gated on PR #27 | Leave untouched. |
| `tests/kanji-element-filter-service.test.ts` | `KnowledgeService.ensureSeeded()` in `beforeAll` | **None, and PR #27 does not cover it** | **Gap G3** — add `requireTrustedDatabaseExecutor()` once PR #27's helper lands. |
| `tests/knowledge-retrieval.test.ts` | `KnowledgeService.ensureSeeded()` in `beforeAll` | **None, and PR #27 does not cover it** | **Gap G3** |
| `tests/sentence-etl.test.ts` | `KnowledgeService.ensureSeeded()` in `beforeAll` | **None, and PR #27 does not cover it** | **Gap G3** |

No change was made to these six files. The first three must not be modified on a branch that has no gate helper (it would either duplicate or corrupt PR #27). The last three are test-only canonical writers: they need the same trusted-executor gate, but adding it here would mean shipping a second copy of a security helper that PR #27 already introduces — a deliberate non-action, recorded as G3 and sized at ~3 lines each once PR #27 lands. They cannot write canonical rows without a developer-supplied `DATABASE_URL`; they are not request-reachable.

---

## 7. Remaining gaps (none introduced by this change)

**G1 — `scripts/ingest-kanjidic2.ts` (out of scope, explicitly).** Still an independent canonical writer with `DELETE FROM kanji_entries`. Authorization is caller-declared `NIHONGO_DB_TARGET_CLASS` + `NIHONGO_DB_EXPECTED_DATABASE` plus a loopback-only host check and a pinned artifact hash. Not request-reachable. Per the task instruction it was **not** conflated with this change and not modified.

**G2 — `KnowledgeCorpusService.ensureSeeded()` remains on `GET /api/ai/retrieve`.** It writes `dictionary_entries`, `grammar_patterns`, `example_sentences`, `knowledge_sources` — not canonical Kanji tables. Same shape of smell (a GET that seeds), different blast radius. Recommend a follow-up under the same "no writes from reads" principle, decided separately because it changes dictionary bootstrap UX.

**G3 — three ungated canonical-seeding test suites** (§6).

**G4 — no compile-time boundary.** The invariant is enforced by a source-scan test with an explicit file allowlist, not by the type system. A future writer added outside the allowlisted files is caught only if the scan covers it; the scan is deliberately scoped to `KnowledgeService`, the 8 request-path modules and `fixtureSetup`, matching this task. Broader repository-wide enforcement is the audit's §7.2 item 4 and remains open.

**G5 — DDL and out-of-repository writers.** `drizzle-kit push` and any direct SQL session can still change these tables. Unchanged by this work.

**G6 — no database-backed assertion in this session.** The strongest available proof that read paths perform zero canonical writes on a *real* server is a disposable-Postgres run comparing canonical table counts/digests before and after a route sweep. It could not be executed here (no database) and is specified in §8.

---

## 8. Disposable-database verification — EXECUTED (see §11)

§11 records the completed run against an isolated, explicitly classified disposable target. Items 1–5 below were executed; item 6 and the seeded-state comparison remain BLOCKED, with reasons stated in §11.5.

1. Provision a disposable PostgreSQL (never production/staging/Supabase/Neon).
2. `npm run db:push` + `npm run dictionary:seed-fixtures` against it — the explicit bootstrap path, expected to succeed and to write the 33/55/71 first-party rows.
3. Capture `count(*)` and `md5(string_agg(...))` digests for `kanji_entries`, `kanji_radicals`, `kanji_composition`.
4. `TRUNCATE`/drop those three tables **only on that disposable database**, then exercise `GET /api/ai/retrieve?q=水`, `/api/kanji`, `/api/kanji/道`, `/api/kana`, `/api/knowledge/srs`, `/api/jlpt/overview?level=N5`; assert all three canonical tables remain **empty** and every response is a normal (non-500) miss.
5. Re-seed, sweep the same routes, and assert byte-identical digests (no writes on a seeded database).
6. Run the CI-registered suite list, including `tests/kanji-read-path-write-isolation.test.ts`, and confirm the three PR #27-gated suites report `TRUSTED_DATABASE_EXECUTOR_UNAVAILABLE` **after** PR #27 merges.

---

## 9. Proposed commit and PR plan (nothing executed)

**Commit subject**

```
fix(knowledge): stop seeding canonical Kanji from read paths
```

**Commit body**

```
KnowledgeService.ensureSeeded() inserts into kanji_radicals, kanji_entries
and kanji_composition, gated only on "kana_entries is empty". All 11 service
methods called it first, so anonymous GET routes (/api/ai/retrieve, /api/kanji,
/api/kanji/[character], /api/kana, /api/knowledge/srs, /api/jlpt/*) could seed
canonical rows into whatever DATABASE_URL named.

- remove the 11 lazy ensureSeeded() calls; the operation stays available as
  the explicit bootstrap used by seedDictionaryFixturesForDisposableDatabase()
- drop the Kanji seeder from GET /api/ai/retrieve and from
  JLPTKnowledgeService.ensureInitialized (corpus/question seeding retained)
- document the bootstrap-only invariant at the operation
- add tests/kanji-read-path-write-isolation.test.ts (11 database-free tests:
  static invariant, recording-proxy behaviour, bootstrap-still-guarded) and
  register it in the CI test list

Verification: new suite 11/11; 142/142 across six DB-free route suites;
typecheck, lint (0 errors), build pass; full local suite identical to the
pristine baseline (24 failed files / 107 tests before and after, all from the
absent database and missing data artifacts; +11 passing = the new suite).
No database was accessed. No ingestion was run. PR #27 guards untouched.
```

**Files in the commit (5 + 1 new):**

```
M .github/workflows/ci.yml
M src/app/api/ai/retrieve/route.ts
M src/services/jlpt/knowledge/jlptKnowledgeService.ts
M src/services/knowledge/knowledgeService.ts
A tests/kanji-read-path-write-isolation.test.ts
A reports/security/CANONICAL-KANJI-WRITE-PATH-AUDIT.md   (prior turn's audit)
A reports/security/READ-PATH-CANONICAL-WRITE-REMOVAL.md  (this report)
```

**PR plan**

* Title: `fix(knowledge): stop seeding canonical Kanji from read paths`
* Base: `main`. Head: `arena/76b3ae66-nihingobridgeupgrade`.
* Body: §3 change summary, §5 verification table (stating exactly what ran and what did not), §6 suite review, §7 gaps, and "does not touch, weaken, or depend on PR #27; merge order with PR #27 is not constrained".
* **Relationship to PR #27:** independent. This branch does not import PR #27's gate, and PR #27 does not modify these three source files. The only shared file is `.github/workflows/ci.yml`, and the two hunks are ~30 lines apart, so both apply cleanly in either order.
* Do **not** merge PR #27 as part of this. Do **not** deploy. Do not add the three PR #27-gated suites to any allowlist.
* Draft until §8 has been executed against a disposable database.

---

## 10. Attestation

* **No production, staging, or shared database was accessed.** The only database ever contacted was the in-sandbox disposable PGlite instance described in §11.1: loopback `127.0.0.1:55432`, fresh `/tmp/rdpath-pg-clean`, passwordless, positively identified as `PostgreSQL 18.3 (PGlite 0.5.8)` on `wasm32`, and shut down after the run. No `DATABASE_URL`/`NIHONGO_DB_*`/`PG*` variable existed in the environment outside the verification harness; no external host was reachable or configured; no credential was used or printed.
* **No ingestion, seeding, reconciliation, or mutation script was executed.** `seedDictionaryFixturesForDisposableDatabase()` was invoked **only** in assertions of its refusal paths (unit test and §11.5) and threw before connecting or writing. The only writable side effect observed anywhere was the pre-existing corpus bootstrap reached from `GET /api/ai/retrieve` (`dictionary_entries` 0 → 30 on the disposable target, §11.4); canonical Kanji tables were never written.
* **No canonical data was altered.** `kanji_entries`, `kanji_radicals` and `kanji_composition` held 0 rows with digest `EMPTY` before, during and after the entire verification, including the final independent snapshot taken immediately before shutdown.
* **No canonical-write denial guard was weakened or removed** — none exists on this branch; PR #27's branch was not modified in any way (verified: PR head still `6fc5100`, MERGEABLE, untouched).
* **No caller-controlled environment variable, token, or flag was added.** The change only removes write triggers.
* **No schema, dataset, dependency, or lockfile change.** `npm ci` installed from the existing lockfile and modified nothing tracked; the `next-env.d.ts` churn from `npm run build` was reverted.
* **No commit, push, PR, merge, or deploy.** All changes are uncommitted working-tree modifications (4 files) plus three new untracked files (2 reports + 1 test).
* Pre-existing work preserved: the prior audit report is intact, and the git ref `refs/audit/pr27` (used only to read PR #27's diff) is untouched.

---

## 11. Disposable-database verification evidence (completed run)

### 11.1 Target provisioning and positive identification

| Item | Value |
|---|---|
| Harness | `scripts/run-disposable-pg.ts` — the repository's own disposable launcher (PGlite + `pglite-server`, loopback only) |
| Data directory | `/tmp/rdpath-pg-clean` (fresh, `PG_CLEAN=true`; ephemeral, sandbox-local, destroyed at the end) |
| Listener | `127.0.0.1:55432` — a non-default port chosen for this run, so it cannot collide with, or be confused for, anything else |
| Server identity | `PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten` — WASM, therefore provably this in-sandbox instance and not a network server |
| `current_database()` / `current_user` | `postgres` / `postgres` |
| Credential | **None.** The loopback URL is passwordless, so no credential exists to leak, and no connection string appears in any log or in this report |
| Schema provisioning | `npx drizzle-kit push --dialect postgresql --schema ./src/db/schema.ts --url <loopback> --force` — the same command and flags as the CI "Initialize disposable schema" step. 30 public tables created, including the three canonical tables |
| Classification verdict | `classifyDatabaseTarget({ declaredClass: "disposable", expectedDatabase: "postgres" })` → **DISPOSABLE / ALLOW** |

No `DATABASE_URL`, `NIHONGO_DB_*` or `PG*` variable was present in the environment before the run; the target was supplied only to the verification harness. No system PostgreSQL, Docker, or external database was used or reachable (all absent).

### 11.2 Baseline — counts and deterministic digests (before any request)

| Table | Count | Digest |
|---|---|---|
| `kanji_entries` | **0** | `EMPTY` |
| `kanji_radicals` | **0** | `EMPTY` |
| `kanji_composition` | **0** | `EMPTY` |
| context: `kana_entries` | 0 | — |
| context: `dictionary_entries` | 0 | — |

Digests are `md5(string_agg(<stable column tuple>, ',' order by id))`, computed per table; empty tables yield `EMPTY`.

This baseline is the dangerous state by construction: under the pre-fix code, the `kana_entries`-is-empty precondition was *true*, so any of these requests would have seeded canonical rows.

### 11.3 Read entry points exercised (real route handlers, real services)

| Entry point | Status |
|---|---|
| `GET /api/ai/retrieve?q=水` | 200 |
| `GET /api/ai/retrieve` (no query) | 400 (validation, not a crash) |
| `GET /api/ai/retrieve?domain=kanji&id=kj-mizu` | 200 |
| `GET /api/kanji` | 200 |
| `GET /api/kanji?includeElements=1` | 200 |
| `GET /api/kanji?q=water&level=N5` | 200 |
| `GET /api/kanji/道` | 404 (row absent — correct, and no 500) |
| `GET /api/kana` and `GET /api/kana?q=a` | 200 |
| `GET /api/knowledge/srs` | 200 |
| `GET /api/jlpt/overview?level=N5` | 200 |
| `GET /api/jlpt/progress?level=N5` | 200 |
| service: `getKanaChart`, `searchKana`, `listKanji`, `listElements`, `buildMindTree`, `getKanjiDetail`, `getKnowledgeStats`, `JLPTKnowledgeService.ensureInitialized` | all resolved |

No entry point threw.

### 11.4 After the sweep — counts and digests

| Table | Before | After | Delta |
|---|---|---|---|
| `kanji_entries` | 0 / `EMPTY` | **0 / `EMPTY`** | none |
| `kanji_radicals` | 0 / `EMPTY` | **0 / `EMPTY`** | none |
| `kanji_composition` | 0 / `EMPTY` | **0 / `EMPTY`** | none |
| `kana_entries` | 0 | 0 | none |
| `dictionary_entries` | 0 | 30 | +30 (corpus bootstrap reached from `GET /api/ai/retrieve` — pre-existing, non-canonical, gap G2) |

**The `dictionary_entries` 0 → 30 delta is the control that matters:** the very same request, through the very same Drizzle client and the very same target, *did* write rows. So the absence of canonical writes is a genuine observation about the code path, not an artifact of a read-only connection, an unwritable target, or a swallowed error.

Final independent snapshot taken immediately before shutdown: `kanji_entries` 0, `kanji_radicals` 0, `kanji_composition` 0, `kana_entries` 0.

### 11.5 Guarded-bootstrap refusals (no writes attempted)

| Attempt | Outcome |
|---|---|
| `seedDictionaryFixturesForDisposableDatabase()` with `NODE_ENV=production` | refused: "Dictionary fixture setup is unavailable in production" |
| same, unclassified loopback target | refused: "requires a plain, valid disposable database target" |
| same, declared disposable but `NIHONGO_DB_EXPECTED_DATABASE=app_db` (mismatch) | refused: same |
| same, no `DATABASE_URL` | refused: same |
| positive classification, **classification only, never executed** | `DISPOSABLE/ALLOW` |

The bootstrap was deliberately **never** invoked with a valid classified target: doing so would have seeded canonical rows, which this task forbids.

### 11.6 Commands and outcomes

| Command | Result |
|---|---|
| `PG_DATA_DIR=/tmp/rdpath-pg-clean PG_PORT=55432 PG_CLEAN=true npx tsx scripts/run-disposable-pg.ts` | disposable listener up on `127.0.0.1:55432` |
| `npx drizzle-kit push --dialect postgresql --schema ./src/db/schema.ts --url <loopback> --force` | "Changes applied" |
| `VERIFY_DB_URL=<loopback> npx vitest run tests/tmp-readpath-runtime-probe.test.ts` | **PASS** — `RESULT: PASS`; 1 file / 1 test; snapshot, sweep and re-snapshot as tabled above |
| `npx vitest run tests/kanji-read-path-write-isolation.test.ts tests/kanji-mindtree-mpagination.test.ts tests/dictionary-kanji-experience-routes.test.ts tests/kanji-stroke-order-route.test.ts tests/unified-search.test.ts tests/xp-analytics-read-authorization.test.ts` | **PASS** — 6 files, **142/142** tests, with `DATABASE_URL` unset |

The runtime probe was a **temporary** file (`tests/tmp-readpath-runtime-probe.test.ts`), created for this run and **deleted immediately after**; `git status` confirms the worktree is back to exactly the four modified files and three new files of this change. It is intentionally not part of the committed suite because it requires a provisioned disposable database.

### 11.7 BLOCKED — not executed, with reasons

| Item | Status | Reason |
|---|---|---|
| Seeded-state digest comparison (canonical rows present → sweep → identical digests) | **BLOCKED** | Creating the seeded state requires executing the bootstrap/seed operation, which this task forbids. The empty-state run is the stronger direction for this defect anyway: the pre-fix bug fired *only* when `kana_entries` was empty |
| The three PR #27-gated suites reporting `TRUSTED_DATABASE_EXECUTOR_UNAVAILABLE` | **BLOCKED** | That gate exists only on PR #27's branch, which is unmerged and must not be modified. The three suites are byte-identical to `main` here (verified: empty diff) |
| Real `postgres:18-alpine` server and the full CI test list | **BLOCKED** | No Docker/`postgres`/`initdb` binaries in this sandbox. Used the repository's approved PGlite 18.3 WASM harness instead |
| Ingestion-dependent suites (`kanjidic2-etl-foundation`, `kanjivg-*`, …) | **BLOCKED** | Missing `data/kanjidic2.xml`, `data/kanjivg*` artifacts; unchanged from the pre-change baseline |
| Negative control (run the *pre-fix* code against the disposable DB to observe canonical writes) | **NOT RUN — deliberate** | It would insert canonical rows, which the task prohibits. Pre-fix behavior is instead established statically (11 lazy call sites at `dbeef97`) plus the `dictionary_entries` write control in §11.4 |

### 11.8 Verdict

**PASS.** On an isolated, explicitly classified, write-capable disposable target whose three canonical tables were empty, twelve route invocations and eight service invocations produced **zero** canonical Kanji writes (counts and digests unchanged: 0 / `EMPTY` before, during and after), every guarded-bootstrap attempt refused, and the focused regression suite plus the DB-free route suites pass 142/142. No canonical data was altered anywhere, and no seeding, ingestion or reconciliation was executed.
