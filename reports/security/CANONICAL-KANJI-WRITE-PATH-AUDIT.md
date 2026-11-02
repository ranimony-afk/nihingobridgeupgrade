# NihongoBridge — Repository-Wide Canonical Kanji Write-Path Security Audit

**Status:** Audit complete (read-only). No application behavior was modified.
**Date:** 2026-10-31
**Auditor:** Arena agent (static code inspection only)
**Review type:** Post-implementation security scoping review of PR #27

---

## 1. Identity

### 1.1 Repository

| Item | Value |
|---|---|
| Repository | `ranimony-afk/nihingobridgeupgrade` (`https://github.com/ranimony-afk/nihingobridgeupgrade`) |
| Audit worktree | `/home/user/nihingobridgeupgrade` |
| Session branch | `arena/76b3ae66-nihingobridgeupgrade` |
| Branch HEAD at audit time | `dbeef971c25e345019a3fd44ec5de165322de978` (identical to `origin/main`) |
| Worktree state before audit | clean (`git status --porcelain` empty) |
| `origin/main` at audit time | `dbeef971c25e345019a3fd44ec5de165322de978` |

### 1.2 Pull request under review

| Item | Value |
|---|---|
| PR | **#27** — `fix(kanji-etl): deny unapproved canonical writes` |
| State | **OPEN** (not draft) |
| Base | `main` |
| Head branch | `arena/6878136a-nihingobridgeupgrade` |
| Head commit (re-fetched live) | **`6fc51009f908b71785861628a4633850009ced9f`** |
| Mergeable | `MERGEABLE` |
| Updated | 2026-10-31T06:41:39Z |
| Diff size | 9 files, **+698 / −16** |

PR #27 was re-fetched live before this audit; the head SHA matches the SHA supplied in the task, so the analysis below is against the current PR content.

### 1.3 CI state at audit time

| Check | Result |
|---|---|
| `Install · Schema · Test · Typecheck · Lint · Build` (run `41177622334`, job `124468338462`) | **SUCCESS** (5m50s) |
| `Vercel` / `Vercel Preview Comments` | SUCCESS |
| `Supabase Preview` | SKIPPED |

**Important CI caveat:** CI does **not** execute the three fail-closed suites. The workflow enumerates an explicit file list (`.github/workflows/ci.yml`, test step). That list contains `tests/kanji-canonical-write-denial.test.ts` (added by this PR) but **not** `tests/kanji-expansion.test.ts`, `tests/kanjidic2-canonical-ingestion.test.ts`, or `tests/kanjidic2-canonical-ingestion-gates.test.ts`. A green CI therefore says nothing about whether those suites are blocked.

### 1.4 Method and blast-radius controls

* Chose the **no-checkout** path for the PR. Ran only `git fetch --no-tags origin pull/27/head:refs/audit/pr27` — a local **audit ref**, not a branch. No branch was created, checked out, renamed, reset, cleaned, stashed, rebased, amended, or merged. That local ref (`refs/audit/pr27`) is disclosed here and left in place so the diff can be reproduced; it can be removed with `git update-ref -d refs/audit/pr27`.
* No commit, no push, no PR created, merged, or closed.
* No database was contacted (no `DATABASE_URL`, no `PG*`, no Supabase/Neon/Vercel env present in the sandbox).
* No ingestion, seeding, reconciliation, verification, or mutation script was executed.
* No test suite was executed (`node_modules` is not installed in this sandbox); every finding below is **code inspection plus file/line evidence**.
* No existing file was edited. The only filesystem change is this new report.

---

## 2. Executive verdict

**PR #27 is a correct and unusually careful implementation of a narrow boundary, and it is NOT a repository-wide guarantee of canonical Kanji write denial.**

The gate itself is sound: it takes no input, reads no environment, has no token, no flag and no default, and it is placed as the first statement of every guarded export. Nothing in this audit found a way to make it return.

But the boundary it defends is **only** these six surfaces:

* `src/etl/kanji/loader.ts` — the five exported loaders
* `src/etl/kanji/pipeline.ts` — `runKanjiETLPipeline` on the non-dry-run branch

and the three test suites. Canonical Kanji rows (`kanji_entries`, `kanji_radicals`, `kanji_composition`) can still be **written today** by at least two independent paths that do not touch that boundary:

1. **`KnowledgeService.ensureSeeded()`** — an application/service-layer writer that is reachable from **six unauthenticated HTTP GET routes**, including `GET /api/ai/retrieve`, which calls it directly. Its only precondition is "`kana_entries` is empty". It inserts into all three canonical tables and is not covered by PR #27 in any way. The underlying `@/db` client applies **no target classification whatsoever**, so this path can write to any database `DATABASE_URL` points at, including production.
2. **`scripts/ingest-kanjidic2.ts`** — a raw `pg` `Client` engine that opens its own transaction and performs `DELETE FROM kanji_entries` + a 13,063-row `INSERT INTO kanji_entries`. It never imports the guarded loaders. Its protection is a target-classification gate driven by **caller-settable environment variables**.

Neither is a hypothetical: both are established by direct code inspection of an executed statement, not inferred.

**Confidence:**
* *High* that the PR #27 guard set itself cannot be bypassed (inputs are non-existent; guard is first-statement; barrel and direct imports are the same functions).
* *High* that `KnowledgeService.ensureSeeded()` and `scripts/ingest-kanjidic2.ts` can write the three canonical tables (the write statements and their reachability were read directly).
* *High* that the three reported suites are blocked before any connection (structural argument: lazy pool + first-statement gate + no module-level `await`).
* *Medium* on operational impact of the `KnowledgeService` path, because the `kana_entries` precondition means it is inert on an already-seeded database; whether production's `kana_entries` is populated is **not** verifiable from this sandbox (see §7).
* *High* that no other in-repository path writes these three tables (complete inventory of write-verb SQL and ORM write calls, §6).

**Headline:** the PR's *implementation* is trustworthy; its *title* implies a scope it does not have. The repository needs a documentation/scope correction now and a boundary-consolidation change later — not a redesign of what PR #27 already did.

---

## 3. What PR #27 actually changes

`git diff dbeef97 refs/audit/pr27`:

| File | Change |
|---|---|
| `src/etl/kanji/canonicalWriteGate.ts` | **new** — 68 lines; `CANONICAL_KANJI_WRITE_DENIED`, `CanonicalKanjiWriteDeniedError`, `denyCanonicalKanjiWrite(operation)` |
| `src/etl/kanji/loader.ts` | +19 — guard as first statement of all five exports |
| `src/etl/kanji/pipeline.ts` | +16 — `if (options?.dryRun !== true) denyCanonicalKanjiWrite(...)` |
| `tests/helpers/trustedDatabaseExecutor.ts` | **new** — 58 lines; `requireTrustedDatabaseExecutor(suite: string): never` always throws |
| `tests/kanji-canonical-write-denial.test.ts` | **new** — 511 lines, 20 database-free tests |
| `tests/kanji-expansion.test.ts` | +6 — gate call in `beforeAll` |
| `tests/kanjidic2-canonical-ingestion-gates.test.ts` | +6 — gate call in `beforeAll` |
| `tests/kanjidic2-canonical-ingestion.test.ts` | +9/−1 — gate call in `describe().beforeAll` |
| `.github/workflows/ci.yml` | +21/−16 — header-comment rewrite **and** `tests/kanji-canonical-write-denial.test.ts` added to the test list |

The five guarded exports and their guard lines (PR #27 tree):

| Export | Guard line | Retained write statements in the (now unreachable) body |
|---|---|---|
| `ensureKanjiSource` | `loader.ts:44` | `loader.ts:53` `db.insert(knowledgeSources)` |
| `loadKanjiRadicals` | `loader.ts:70` | `loader.ts:90` insert, `:124` update → `kanji_radicals` |
| `loadKanjiEntries` | `loader.ts:144` | `loader.ts:164` insert, `:204` update → `kanji_entries` |
| `loadKanjiComposition` | `loader.ts:225` | `loader.ts:238` insert, `:261` update → `kanji_composition` |
| `loadTransformedKanji` | `loader.ts:278` | orchestrates the three above |
| `runKanjiETLPipeline` (non-dry-run) | `pipeline.ts:27–29` | `pipeline.ts:54` → `loadTransformedKanji` |

Barrel `src/etl/kanji/index.ts` re-exports `./loader` and `./pipeline`; there is no second copy of these functions anywhere in the tree (verified: the only importers of `runKanjiETLPipeline` / the loaders outside `src/etl/kanji/` are `tests/kanji-expansion.test.ts` and a comment in `tests/kanjidic2-canonical-ingestion-gates.test.ts`). **No application route or service imports `src/etl/kanji` at all.**

---

## 4. Discovered write paths — classification table

Legend:
* **Covered** = refuses because of PR #27's guards.
* **Uncovered** = executes without consulting PR #27's guards.
* Evidence: *inspected* = the mutating statement and its caller chain were read directly; *inferred* = concluded from proximity/absence of a writer.

| # | Path (file:line) | Tables it can mutate | Reachable as | Authorization / target checks | PR #27 coverage | Evidence | Could reach non-disposable DB if misconfigured? | Recommended action |
|---|---|---|---|---|---|---|---|---|
| **P1** | `src/etl/kanji/loader.ts:43–44, 66–70, 140–144, 221–225, 274–278` (five exports) | `kanji_radicals`, `kanji_entries`, `kanji_composition`, `knowledge_sources` | Exported functions; barrel `@/etl/kanji`; only test consumers today | `denyCanonicalKanjiWrite()` — unconditional | **Covered (denies)** | inspected | No — cannot reach any DB | Keep. Do not weaken. |
| **P2** | `src/etl/kanji/pipeline.ts:27–29` (`runKanjiETLPipeline`) | all three via P1 | Exported function; barrel | `dryRun !== true` ⇒ deny | **Covered (denies)** | inspected | No | Keep. |
| **P3** | `src/services/knowledge/knowledgeService.ts:148–218` — `KnowledgeService.ensureSeeded(executor = db)`; guard `:149–153`; inserts `:165` (radicals), `:186` (kanji), `:207` (composition) | `kanji_radicals`, `kanji_entries`, `kanji_composition` (+ `kana_entries`) | **Application service, route-reachable (six GET routes, see F4)**; also exported static; also called by tests | **None beyond "`kana_entries` count > 0 ⇒ return"** (`:153`). `executor` is a caller-supplied `Pick<typeof db,"select"|"insert">` (`:142`). `@/db` applies **no** target classification (`src/db/index.ts:58–84`, `:105–122`) | **Uncovered** | inspected | **Yes** — any `DATABASE_URL`, TLS-relaxed for non-loopback hosts (`src/db/index.ts:76–82`) | **Highest priority.** Do not patch inside `ensureSeeded` blindly (see §7.2 item 2). |
| **P4** | `scripts/ingest-kanjidic2.ts:457` `BEGIN`; `:463–466` `DELETE FROM kanji_entries WHERE source_ref = $1` (only under `--from-baseline`); `:500–506` `INSERT INTO kanji_entries … ON CONFLICT (character) DO NOTHING`; `:513` `COMMIT` | `kanji_entries` (read: `kanji_radicals`, `:415`) | Standalone CLI (`:590–604`) **and** exported `executeKanjidicIngestion` / `runTwoPassIngestion` | `assertSafeDatabaseUrl` (loopback + provider denylist) + `assertIngestionTarget` (`:127–134`) + `NIHONGO_DB_TARGET_CLASS=disposable` + `NIHONGO_DB_EXPECTED_DATABASE`; plus source-artifact hash and a hardcoded 45-row baseline precondition | **Uncovered** (no gate import; no `requireTrustedDatabaseExecutor`) | inspected | **Only via caller-declared env + loopback**, but the caller sets those variables itself | Immediate scope-documentation; later, executor attestation (§8.3) |
| **P5** | `tests/kanjidic2-canonical-ingestion-gates.test.ts:97` `DELETE FROM kanji_entries`, `:103` `DELETE FROM kana_entries`, `:188` `UPDATE kanji_entries`, `:108`/`:174`/`:184` `ensureSeeded`, `:113` `runKanjiETLPipeline()` | all three (destructive) | Test suite | `requireTrustedDatabaseExecutor()` — first statement of file-level `beforeAll` | **Covered (blocked)** | inspected | No — blocked before connect | Keep blocked; fix reporting semantics (§6.3) |
| **P6** | `tests/kanji-expansion.test.ts:73, :109` (`runKanjiETLPipeline()`), `:16` `ensureSeeded()` | all three | Test suite | `requireTrustedDatabaseExecutor()` — first statement of `beforeAll` | **Covered (blocked)** | inspected | No | Keep |
| **P7** | `tests/kanjidic2-canonical-ingestion.test.ts:179` `executeKanjidicIngestion(2)` (via P4) | `kanji_entries` | Test suite | `requireTrustedDatabaseExecutor()` in `describe().beforeAll` | **Covered (blocked)** | inspected | No | Keep; consider hoisting to file scope (§6.3) |
| **P8** | `tests/kanji-element-filter-service.test.ts:75` `KnowledgeService.ensureSeeded()` | canonical Kanji (via P3) | Test suite | **None** — no trusted-executor gate | **Uncovered** | inspected | **Yes** — writes to whatever `DATABASE_URL` names | Add the gate (§8.4) |
| **P9** | `tests/knowledge-retrieval.test.ts:20–23` `KnowledgeCorpusService.ensureSeeded(); KnowledgeService.ensureSeeded()` | canonical Kanji (via P3) | Test suite | **None** | **Uncovered** | inspected | **Yes** | Add the gate |
| **P10** | `tests/sentence-etl.test.ts:13–17` same pattern | canonical Kanji (via P3) | Test suite | **None** | **Uncovered** | inspected | **Yes** | Add the gate |
| **P11** | `scripts/seed-dictionary-fixtures.ts` → `src/services/dictionary/fixtureSetup.ts:76–115` → `KnowledgeService.ensureSeeded(tx)` (`:108`) | canonical Kanji (via P3) | npm script `dictionary:seed-fixtures` | `NODE_ENV !== "production"`, `PGOPTIONS` unset, plain-URL shape check, `classifyDatabaseTarget` ⇒ DISPOSABLE/ALLOW, live pool identity + `current_database`/`current_user`/`session_user` re-verification, explicit transaction | **Uncovered** by PR #27, but **independently guarded** (a second, different guard family) | inspected | No, if the classifier is sound (defense in depth is good here) | Document as the model to converge on |
| **P12** | `scripts/build-kanji-lexical-graph.ts:64–85` | none (SELECT only; writes a `.md` report at `:372`) | CLI | n/a | n/a | inspected | read-only | No action |
| **P13** | `scripts/reconcile-kanji.ts:76`, `scripts/reconcile-kanji-readings.ts:44` | none (SELECT only; `.md` at `:213` / `:216`) | CLI | n/a | n/a | inspected | read-only | No action |
| **P14** | `scripts/pre-ingestion-audit-kanji.ts:78, 81, 120` | none (SELECT only; `.md` at `:273`) | CLI | n/a | n/a | inspected | read-only | No action |
| **P15** | `scripts/ingest-kanjivg.ts:450–471, 576` (SELECT only); publishes SVG/state under `data/kanjivg-attachment*` (`:748–756`) | none in DB | CLI | `assertIngestionTarget(dbUrl())` at `:551` | n/a | inspected | reads canon tables with only target classification | No action for canon writes |
| **P16** | `scripts/ingest-kanji-decomposition.ts:438–451, 699–704` (SELECT only); publishes graph JSON (`:1125–1130`) | none in DB | CLI | none | n/a | inspected | read-only | No action |
| **P17** | `scripts/ingest-kanji-jmdict-graph.ts:255–265, 392–397` | none (SELECT only) | CLI + exported helpers | `assertIngestionTarget` at `:657` | n/a | inspected | read-only | No action |
| **P18** | `scripts/verify-kanjidic2-ingestion.ts`, `verify-kanjivg-ingestion.ts`, `verify-kanji-decomposition.ts`, `verify-kanji-jmdict-graph.ts`, `reconcile-kanjivg-coverage.ts`, `dry-run-kanjidic2.ts`, `dry-run-kanjivg.ts`, `generate-kanji-jmdict-linkage.ts` | none (SELECT only) | CLI | mixed | n/a | inspected | read-only | No action |
| **P19** | `tests/kanji-decomposition-gates.test.ts:88–`, `tests/kanjivg-canonical-attachment-gates.test.ts:53–` | none (SELECT only) | Test suites | none | n/a | inspected | connect to any `DATABASE_URL` but do not write | Low priority |
| **P20** | `npm run db:push` / `drizzle-kit push` (`package.json:14`; CI `ci.yml:118` with `--force`) | **DDL** on canonical tables (create/alter), not row writes | npm script / CI step | CI: disposable container. Local: **no target classification** | Uncovered (out of PR scope) | inspected (script wiring only; DDL semantics not exercised) | **Yes** — `DATABASE_URL` is passed straight through | Note only; schema changes are out of scope for this task |

No path other than P1/P3/P4/P5–P10 writes a row into `kanji_entries`, `kanji_radicals`, or `kanji_composition`. This was established by scanning every `INSERT INTO` / `DELETE FROM` / `UPDATE … SET` / `TRUNCATE` / `ON CONFLICT` occurrence and every Drizzle `.insert(` / `.update(` / `.delete(` / `.execute(` call across `src/`, `scripts/`, and `tests/`, then tracing each hit.

---

## 5. Evidence-backed findings

### F1 — The gate is genuinely input-free (PR #27's core claim holds)

`src/etl/kanji/canonicalWriteGate.ts:45–70`. `denyCanonicalKanjiWrite(operation: string): void` throws unconditionally; the only parameter is a diagnostic label embedded in the message and stored as `error.operation`. The file contains **no** `process.env`, `process.argv`, token, flag, or default-on branch (grep for `process.`/`argv`/`token`/`flag` returns only the prose comment at line 11). The `void` (not `never`) return type is deliberate and documented: it keeps TypeScript type-checking the retained loader bodies. Runtime behavior is asserted by the DB-free suite.

`tests/helpers/trustedDatabaseExecutor.ts:55–62`: `requireTrustedDatabaseExecutor(suite: string): never` always throws `TRUSTED_DATABASE_EXECUTOR_UNAVAILABLE`. The file contains no `process.env` reference at all, so `DATABASE_URL`, `NIHONGO_DB_TARGET_CLASS`, `NIHONGO_DB_EXPECTED_DATABASE`, loopback hosts, and caller tokens are structurally incapable of opening it. This matches the "no escape hatch" requirement.

### F2 — Guard placement is correct and defensive

Every guard is the **first statement** of its export (`loader.ts:44, 70, 144, 225, 278`; `pipeline.ts:27–29`), so denial precedes client access, transaction acquisition, input traversal, and `result` mutation. `loadTransformedKanji` denies on its own boundary rather than relying on its subordinates. `pipeline.ts` requires the literal boolean `true` (`!== true`), so `"true"`, `1`, `{}`, and forged approval fields cannot open it, and nothing else on `options` is consulted.

### F3 — The barrel is not a second surface

`src/etl/kanji/index.ts` is a pure `export *` re-export list; the functions behind it are the same bindings as the direct module imports. No duplicate implementations exist.

### F4 — **HIGHEST PRIORITY: `KnowledgeService.ensureSeeded()` is an unguarded, route-reachable canonical writer**

`src/services/knowledge/knowledgeService.ts`:

```
142:  type SeedExecutor = Pick<typeof db, "select" | "insert">;
148:  static async ensureSeeded(executor: SeedExecutor = db): Promise<void> {
149:    const [row] = await executor.select({ count: … }).from(kanaTable);
153:    if ((row?.count ?? 0) > 0) return;          // ← the ONLY precondition
158:      await executor.insert(kanaTable)…
165:        .insert(radicalsTable)                   // ← kanji_radicals
186:        .insert(kanjiTable)                      // ← kanji_entries
207:        .insert(compositionTable)                // ← kanji_composition
```

with `kanjiEntries as kanjiTable`, `kanjiRadicals as radicalsTable`, `kanjiComposition as compositionTable` (`:3–6`).

* **What it writes:** 55 element rows + 33 kanji rows + 71 composition edges on an empty `kana_entries` (`src/data/kanji.ts`: `KANJI` 33 records, `ELEMENTS` 54 + `EXTRA_ELEMENTS` 1, `COMPOSITION` 71 `C(...)` entries; `KANJI_SOURCE_REF = "first-party:kanji-mindtree:v1"`, `:11`). All inserts use `onConflictDoNothing()`, so the path is insert-only and never overwrites an existing character — but it *adds* rows and composition edges.
* **Its authorization:** none. It is data-availability bootstrapping, not an authorization check. `kana_entries` emptiness is an accident of database state, not an authority.
* **Its `executor` parameter** (`:142`) lets any caller redirect the writes into a caller-supplied Drizzle transaction — including `src/services/dictionary/fixtureSetup.ts:108`.
* **Reachability — 6 HTTP GET routes, no authentication:**

| Route | Line | Chain |
|---|---|---|
| `GET /api/ai/retrieve` | `src/app/api/ai/retrieve/route.ts:48–49` | calls `KnowledgeService.ensureSeeded()` **directly** |
| `GET /api/kanji` | `src/app/api/kanji/route.ts:24` | `listKanji` (`knowledgeService.ts:325`, `:341`) |
| `GET /api/kanji/[character]` | `src/app/api/kanji/[character]/route.ts:19` | `getKanjiDetail` (`:625`, `:626`) |
| `GET /api/kana` | `src/app/api/kana/route.ts:16, 20` | `searchKana` (`:273–274`), `getKanaChart` (`:224–228`) |
| `GET /api/knowledge/srs` | `src/app/api/knowledge/srs/route.ts:14` | `getKnowledgeStats` (`:876–877`) |
| `GET /api/jlpt/overview`, `GET /api/jlpt/progress` | `route.ts:15` / `:16` | `JLPTKnowledgeService.getLevelOverview` (`jlptKnowledgeService.ts:61`) → `ensureInitialized` (`:49–53`) → `KnowledgeService.ensureSeeded()` |

`proxy.ts` only refreshes an auth cookie (`updateSession`); there is **no route gating**, and `src/middleware.ts` does not exist. `GET /api/kanji`, `/api/kana`, `/api/kanji/[character]`, `/api/ai/retrieve` are ordinary learner-facing read endpoints.

* **Target classification:** `src/db/index.ts:58–84` builds a `Pool` from `process.env.DATABASE_URL` with **no** loopback check, no provider denylist, and no disposable-target classification — and for non-loopback hosts it explicitly relaxes certificate verification (`:76–82`) because the Supabase pooler's chain does not verify. So P3 can write canonical rows to **whatever database production points at**, if its `kana_entries` happens to be empty.
* **Not covered by PR #27:** the PR does not touch this file. Its own description lists `KnowledgeService.ensureSeeded()` as explicitly *out of scope*.

**Threat model this creates:** on any environment whose `kana_entries` is empty — a fresh deploy, a restore, a truncation, a new Supabase branch, a misconfigured staging URL — the first anonymous `GET /api/ai/retrieve` (or `/api/kanji`) inserts 33 first-party Kanji rows and 71 composition edges into the canonical tables, with `source_ref = first-party:kanji-mindtree:v1`. Downstream, `assertIngestionTarget`'s "exactly 45 first-party rows (33 mindtree + 12 corpus)" precondition means a subsequent canonical ingestion would then behave differently, and the KANJIDIC2 engine's `ON CONFLICT (character) DO NOTHING` would silently skip those 33 characters. That is a **data-integrity** consequence, not only an authorization one.

### F5 — **`scripts/ingest-kanjidic2.ts` does independently write canonical rows** (answers the first specific question: **yes**)

It imports only `pg`, `crypto`, `fs`, the XML parser/transformer, the provenance registry, and `classifyDatabaseTarget`. It does **not** import `src/etl/kanji/loader`, `pipeline`, `canonicalWriteGate`, or `tests/helpers/trustedDatabaseExecutor`.

Write sequence, inspected directly:

```
372:  const client = new Client({ connectionString: dbUrl });   // own connection
457:  await client.query("BEGIN");
463:    await client.query("DELETE FROM kanji_entries WHERE source_ref = $1", [sourceRef]);  // --from-baseline only
500:    INSERT INTO kanji_entries (id, character, …) VALUES …     // batches of 200
505:    ON CONFLICT (character) DO NOTHING
513:  await client.query("COMMIT");
```

It performs its own read of `kanji_radicals` (`:415`) for the radical map and reads `kanji_entries` for its baseline snapshot (`:430`). Its protective gates are real and layered — pinned artifact SHA/byte/record-count (`:157–174`), `assertIngestionTarget` (`:366`, defined `:127–134`), provenance registry membership (`:369`), a hardcoded first-party baseline precondition that aborts **before** the first write (`:391–408`), exact reconciliation accounting (`:319–340`), one transaction with rollback, and a post-commit `13108` row assertion (`:521–527`).

But those gates are a **different family** from PR #27's:

* the target classification trusts `process.env.NIHONGO_DB_TARGET_CLASS === "disposable"` and `NIHONGO_DB_EXPECTED_DATABASE`, which the *caller* sets — the same class of self-declaration that `trustedDatabaseExecutor.ts` explicitly refuses to accept;
* it is not the executor-provenance attestation PR #27 introduced;
* `DELETE FROM kanji_entries` is the most destructive canonical statement in the repository, and it is reachable from an exported function.

### F6 — Which other scripts actually mutate the three canonical tables: **none**

Every remaining Kanji script is read-only against the canonical tables, with output going to `data/` or `reports/`:

* `reconcile-kanji.ts`, `reconcile-kanji-readings.ts`, `pre-ingestion-audit-kanji.ts`, `build-kanji-lexical-graph.ts` — `SELECT` only, plus `writeFileSync` of a Markdown report (`:213`, `:216`, `:273`, `:372`).
* `ingest-kanjivg.ts` — `SELECT` only (`:450–471`, `:576`); its "ingestion" is an atomic file publish into `data/kanjivg-attachment*` (`:748–756`).
* `ingest-kanji-decomposition.ts` — `SELECT` only (`:438–451`, `:699–704`); publishes graph JSON (`:1125–1130`).
* `ingest-kanji-jmdict-graph.ts` — `SELECT` only (`:255–265`, `:392–397`).
* all `verify-*`, `reconcile-kanjivg-coverage.ts`, `dry-run-kanjidic2.ts`, `dry-run-kanjivg.ts`, `generate-kanji-jmdict-linkage.ts` — `SELECT` only; no `COPY`, no bulk-load path anywhere.
* `src/services/knowledge/kanjiReadingService.ts`, `kanjiLexicalGraphService.ts` — **read-only** (no insert/update/delete).
* `src/services/knowledge/corpusService.ts` — writes `knowledge_sources`, `dictionary_entries`, `grammar_patterns`, `example_sentences` only; it does **not** write the canonical Kanji tables (`:55, 90, 97, 104`).

So the honest statement is: **two** non-test canonical writers exist outside PR #27's boundary (P3 and P4), plus the guarded loaders/pipeline (P1/P2), plus destructive test fixtures (P5–P7). Per the task's warning, `new Client(...)` was not treated as evidence of a write: each file's statements and callers were traced.

### F7 — `KnowledgeService.ensureSeeded()` can write canonical tables, and these callers reach it

Yes (see F4). Callers:

* **Routes (production):** `/api/ai/retrieve` (direct), `/api/kanji`, `/api/kanji/[character]`, `/api/kana`, `/api/knowledge/srs`, `/api/jlpt/overview`, `/api/jlpt/progress` (transitive via `listKanji`, `listElements`, `getKanjiDetail`, `buildMindTree`, `getKnowledgeStats`, `addKanjiToSrs`, `ensureInitialized`).
* **Service:** `JLPTKnowledgeService.ensureInitialized` (`jlptKnowledgeService.ts:49–53`).
* **Script:** `scripts/seed-dictionary-fixtures.ts` → `fixtureSetup.ts:108` (inside an independently guarded disposable-only transaction).
* **Tests:** `kanji-expansion.test.ts:16` (blocked), `kanjidic2-canonical-ingestion-gates.test.ts:108` (blocked), `kanji-element-filter-service.test.ts:75`, `knowledge-retrieval.test.ts:20–23`, `sentence-etl.test.ts:13–17` (**not** blocked).

### F8 — Are application routes able to invoke canonical mutation paths? **Yes — P3. No route reaches P1, P2, or P4.**

* **P1/P2 (guarded loaders, pipeline):** zero importers under `src/app/**` or `src/services/**`. A route-based trigger does not exist today.
* **P4 (`scripts/ingest-kanjidic2.ts`):** `scripts/` is not part of the Next.js build graph; its CLI body runs only under `process.argv[1]?.endsWith("ingest-kanjidic2.ts")` (`:590`). No route imports it.
* **P3:** reachable from six GET routes, unauthenticated, on a cold/empty `kana_entries`. This is the answer that matters for the "repository-wide" question.

### F9 — Are the three blocked suites safely blocked before database access? **Yes, with three caveats**

Structural argument (all verified):

1. The gate call is the **first statement** of the first `beforeAll` in each suite (`kanji-expansion.test.ts:12–17`; `kanjidic2-canonical-ingestion-gates.test.ts:123–127`; `kanjidic2-canonical-ingestion.test.ts:32–37`).
2. `@/db` cannot connect at import time: `resolvePool()` returns `undefined` without `DATABASE_URL` (`src/db/index.ts:87–96`), and the `pool` is a `Proxy` whose `ACCESS_METHODS` (`query`, `connect`, `end`, `release`) call `throwUnconfigured` when unconfigured (`:102–120`). `drizzle(pool)` opens nothing.
3. `new Client(...)` in these suites lives inside `withClient`/`dbUrl()` helpers that are only called from test bodies and later hooks — never at module scope.
4. No module-level `await` exists in any of the three files.
5. `requireTrustedDatabaseExecutor` has no `process.env` reads, so no environment can satisfy it.

Caveats:

* **Reporting semantics.** A throw in `beforeAll` makes the suite report as **failed**, not skipped. `npm test` (`vitest run`, `vitest.config.ts` includes `tests/**/*.test.ts`) is therefore **red** — as the PR body honestly states ("they do not pass"). But "blocked" and "skipped" are not the same signal, and a future reader may mistake red for regression. This deserves an explicit note (and, later, a `describe.skipIf`-style negative control rather than an always-throwing hook).
* **Placement inconsistency.** In `kanjidic2-canonical-ingestion.test.ts` the gate is inside `describe(...).beforeAll` rather than file scope, so the DB-free tests in that file (e.g. test 1 on `assertSafeDatabaseUrl`) are also blocked. That is fail-safe, but it is inconsistent with the other two and it means the file's non-DB value is lost.
* **Coverage is by convention, not enforcement.** Nothing prevents a new suite from calling `KnowledgeService.ensureSeeded()` without the gate — and three such suites already exist (P8–P10).

### F10 — Is PR #27's title and description precise about its security boundary? **Title: no. Description: mostly, but it omits the two real gaps.**

* **Title** `fix(kanji-etl): deny unapproved canonical writes` reads as repository-wide. The implementation is limited to `src/etl/kanji/{loader,pipeline}.ts`. It should name the boundary.
* **Body** opens with "**Shared** canonical Kanji ETL writes now fail closed" — accurate — and its Known-limitations section is unusually candid: it says the `@/db` mock "does not prove that no other code path opens a raw `pg` connection or reaches the network; such paths are outside the five guarded exports," and it correctly scopes `KnowledgeService.ensureSeeded()` out. That is materially honest.
* **But** it never names the two concrete uncovered canonical writers (`KnowledgeService.ensureSeeded`, `scripts/ingest-kanjidic2.ts`), so a reviewer can reasonably conclude that "unapproved canonical writes" are denied repository-wide. It also stays silent on the fact that `ensureSeeded` is route-reachable from `GET /api/ai/retrieve`.
* **One factual inaccuracy:** "CI's existing database-suite list is unchanged" — the diff **does** add `tests/kanji-canonical-write-denial.test.ts` to that list, and rewrites the CI header comment block (removing the "ACTIVATION REQUIRED / staged at `infra/github-actions-ci.yml`" note). Neither weakens anything (adding a DB-free test is strictly good), but the description should match the diff.
* **Accurate claims verified:** 20-test DB-free suite; guard-removal mutation testing; `npm run typecheck` / `lint` / `build`; CI green; the three DB suites not executing.

---

## 6. Explicitly unresolved questions

1. **Is `kana_entries` populated in the deployed (production/staging) database?** P3 is inert if it is. Answering this requires reading a non-disposable database, which is prohibited here. **This single fact determines P3's real-world exploitability**, and only the owner can settle it.
2. **Does any deployment target serve these routes publicly?** `GET /api/ai/retrieve` and `/api/kana` appear in the app router with no auth wrapper; whether ingress rules, Vercel protection, or a WAF restrict them is not visible in-repo.
3. **Vitest's exact reporting for a `beforeAll` throw** (failed vs skipped, per-file) was not observed, because this sandbox has no `node_modules` and no database. It is asserted from code structure, not executed. The PR body's "BLOCKED (fail closed)" wording is consistent with the code but was not reproduced here.
4. **Whether `assertIngestionTarget`'s self-declared `NIHONGO_DB_TARGET_CLASS` is acceptable policy** for P4. It is loopback-only plus a provider denylist plus an exact database-name match, so the *reachable* blast radius is a local database the operator named — but the approval is caller-generated, which is exactly what PR #27 refused to accept elsewhere. This is a policy decision, not a code defect.
5. **DDL scope.** `npm run db:push` (and CI's `drizzle-kit push --force`) alters canonical table definitions against whatever `DATABASE_URL` names, with no classification. Row-level denial does not cover DDL, and schema changes are out of scope for this task.
6. **Out-of-repository writers.** Vercel cron jobs, Supabase Studio SQL, `psql` sessions, and any external service can write these tables; nothing in the repository can deny that.
7. **`KnowledgeService.ensureSeeded` behavioral contract.** Whether any current deployment *depends* on lazy seeding of a cold database (e.g. a demo environment that relies on the first request populating Kanji) is not determinable from code alone. This governs how much of §8.2 can be done without a behavior change.

---

## 7. Recommendations

### 7.1 Immediate — documentation and scope only (no code, no behavior change)

These are safe to do now and would make PR #27's claim match its content.

1. **Retitle PR #27** to name the boundary, e.g.
   `fix(kanji-etl): deny unapproved writes through the shared Kanji ETL loaders and pipeline`.
2. **Add a "Not protected by this PR" section** to the description that names both uncovered writers with file:line and states the route reachability:
   * `src/services/knowledge/knowledgeService.ts:148–218` — `KnowledgeService.ensureSeeded()` inserts into `kanji_radicals`/`kanji_entries`/`kanji_composition`; called directly by `GET /api/ai/retrieve` and transitively by `GET /api/kanji`, `/api/kanji/[character]`, `/api/kana`, `/api/knowledge/srs`, `/api/jlpt/overview`, `/api/jlpt/progress`; sole precondition is `kana_entries` emptiness.
   * `scripts/ingest-kanjidic2.ts:457–513` — independent raw `pg` writer of `kanji_entries` (including `DELETE FROM kanji_entries`), guarded by target classification, not by this PR.
3. **Correct the CI sentence** to: "the database-suite list gains one DB-free test file (`tests/kanji-canonical-write-denial.test.ts`) and the workflow header comment is rewritten; no existing DB suite entry was added or removed."
4. **State the blocked-suite reporting nuance**: the three suites report as *failed*, not skipped, so full-suite `npm test` is red by design.
5. **Land this audit report** as the tracked inventory (`reports/security/CANONICAL-KANJI-WRITE-PATH-AUDIT.md`), and recommend a follow-up issue that references §4's table. (No issue was created: PR/issue creation was not authorized.)
6. **Do not** weaken `canonicalWriteGate.ts` or `trustedDatabaseExecutor.ts` to make anything green.

### 7.2 Future security implementation — minimum safe remediation

Ordered by risk reduction per unit of behavior change. Items 1–3 are required for a "repository-wide" guarantee; item 4 converts an audit into an enforceable invariant.

**1. Make the canonical-write boundary a single module, and put `@/db` under target classification for canonical writes.**
Today there are three guard families: `denyCanonicalKanjiWrite` (ETL loaders), `assertIngestionTarget` (scripts), `classifyDatabaseTarget` + `requireTrustedDatabaseExecutor` (fixtures/tests). A repository-wide guarantee needs **one** boundary that every canonical Kanji write goes through, consulting target classification (reuse `src/etl/dictionary/targetClassification.ts`, already reviewed) and refusing non-disposable targets. This is additive; it does not weaken anything.

**2. Separate "seed a cold database" from "serve a read request" (P3).**
This is the highest-priority *code* change and the only one with user-visible behavior impact, so it needs its own authorization:
* remove `await this.ensureSeeded()` from the read/write methods (`knowledgeService.ts:228, 274, 285, 341, 423, 477, 626, 691, 748, 821, 877`) and from `GET /api/ai/retrieve` (`route.ts:48–49`);
* move first-party bootstrap behind an explicit, target-classified script (the `fixtureSetup.ts` / `seedDictionaryFixturesForDisposableDatabase` pattern already exists and is the correct model: production-disabled, disposable-only, single transaction, pool identity re-verified);
* if lazy seeding must survive, gate it on target classification **and** a canonical-write boundary call rather than `kana_entries` emptiness.
Do not simply insert `denyCanonicalKanjiWrite()` into `ensureSeeded`: that would break every read route on a cold database and is a behavior change in disguise.

**3. Bring P4 under the same attestation (P4).**
`scripts/ingest-kanjidic2.ts` should consult the same boundary as §7.2(1) in addition to its existing gates — keeping `assertSafeDatabaseUrl`, the artifact contract, the baseline precondition, the single transaction, and the post-verify. The minimum change is to stop treating caller-declared `NIHONGO_DB_TARGET_CLASS` as sufficient proof of *executor provenance* for a destructive canonical write, matching the standard PR #27 already set for tests.

**4. Add a static invariant test (this is what makes it a guarantee).**
The repository already has this pattern (`tests/cms-learner-publication.test.ts:690` scans source text for forbidden imports). Add a DB-free test that:
* scans `src/**` and `scripts/**` for `INSERT INTO kanji_entries|kanji_radicals|kanji_composition`, `DELETE FROM` the same, `UPDATE … SET` the same, and Drizzle `.insert(kanjiEntries|kanjiRadicals|kanjiComposition)` / `.update(` on those bindings;
* fails unless each hit is on a reviewed allowlist **and** the file imports the single canonical-write boundary;
* also asserts that no route handler under `src/app/api/**` transitively imports the guarded ETL loaders except through the boundary.
This test is cheap, database-free, and turns "we audited it once" into "a regression cannot land silently."

**5. Extend the trusted-executor gate to every suite that touches canonical tables.**
At minimum P8–P10 (`kanji-element-filter-service`, `knowledge-retrieval`, `sentence-etl`), which currently seed canonical rows with no gate. Consider whether P19's read-only suites should also be gated, per the PR's stated "database-capable suites" policy — that is a policy call, not a write risk.

**6. Optional defense in depth (needs schema/ops change — out of scope here).**
A restrictive PostgreSQL role or a row-level trigger that only the ingestion role can write through would make the guarantee hold even for out-of-repository writers (SQL 6 above). This is the only measure that survives a future application code path nobody audited.

### 7.3 Verification plan for any future implementation

Any PR implementing §7.2 must demonstrate, in its own validation table:

**Database-free (must run in CI on every PR):**
1. `npx vitest run tests/kanji-canonical-write-denial.test.ts` — still 20/20; **unchanged** behavior of P1/P2.
2. New static-invariant test (7.2.4) — passes on the tree; **fails** when a scratch branch reintroduces an unguarded `INSERT` into `kanji_entries` (mutation-tested, like the PR's existing guard-removal methodology).
3. `npm run typecheck`, `npm run lint`, `npm run build` — clean.
4. A new DB-free test proving `GET /api/ai/retrieve`, `/api/kanji`, `/api/kana` **cannot** reach any `.insert(` on canonical tables when the target is unclassified — e.g. a recording `@/db` proxy in the style already used in `tests/kanji-canonical-write-denial.test.ts` (throws on any property access; proves no `insert`/`transaction` is touched).

**Targeted, disposable-only (explicitly provisioned; never production):**
5. On an **empty** disposable database, call each of the six routes and assert zero rows in the three canonical tables (or assert the documented, reviewed bootstrap behavior).
6. On a **seeded** disposable database, assert the routes are unchanged (row counts and content digest identical before/after) — the PR #26 MindTree behavior must be preserved (`npx vitest run --config vitest.mindtree.config.ts`, currently 70/70).
7. `tests/kanji-element-filter-service.test.ts`, `tests/knowledge-retrieval.test.ts`, `tests/sentence-etl.test.ts` — still pass on disposable, and now report **blocked** (not failed) when no trusted executor exists.
8. `scripts/ingest-kanjidic2.ts` against a disposable database: unchanged success path (13,063 insert / 44 keep / 1 conflict) and unchanged refusal path when the target classification is absent.
9. Canonical digests (`md5(string_agg(...))` over `kanji_entries`, plus `kanji_radicals`/`kanji_composition` counts) identical before and after every read-only route sweep.
10. Confirm no new environment variable, caller token, or flag participates in any write decision — grep the diff for `process.env` in write paths and require zero new occurrences.

**Explicitly forbidden in that work:** merging PR #27 into `main`, deploying, touching production/staging/Supabase/Neon, running ingestion against anything non-disposable, and adding an environment escape hatch to turn any of the above green.

---

## 8. Answers to the specific questions

| Question | Answer |
|---|---|
| Does `scripts/ingest-kanjidic2.ts` independently insert or delete canonical rows without passing through the guarded shared loaders? | **Yes.** Raw `pg` `Client` at `:372`; `BEGIN` `:457`; `DELETE FROM kanji_entries` `:463–466`; batched `INSERT INTO kanji_entries … ON CONFLICT (character) DO NOTHING` `:500–506`; `COMMIT` `:513`. It imports none of `loader.ts`, `pipeline.ts`, `canonicalWriteGate.ts`, or `trustedDatabaseExecutor.ts`. |
| Which other scripts actually mutate the three canonical Kanji tables? | **None.** Every other Kanji script is `SELECT`-only against the canonical tables and writes to `data/` or `reports/` (P12–P18). The only other non-test canonical writer in the repository is `KnowledgeService.ensureSeeded()` (P3). |
| Can `KnowledgeService.ensureSeeded()` write to canonical tables, and what callers reach it? | **Yes** — `knowledgeService.ts:165` (`kanji_radicals`), `:186` (`kanji_entries`), `:207` (`kanji_composition`), gated only by the `kana_entries` count at `:149–153`. Reached by 6 GET routes (directly by `/api/ai/retrieve`), `JLPTKnowledgeService.ensureInitialized`, `fixtureSetup.ts:108`, and 6 test suites (3 blocked, 3 not). |
| Are any application routes able to invoke canonical mutation paths? | **Yes, via P3 only.** No route imports `src/etl/kanji` (P1/P2 unreachable from HTTP) and no route imports `scripts/` (P4 unreachable from HTTP). |
| Are the three blocked suites safely blocked before database access? | **Yes** — first-statement gate, lazy pool, no module-level `await`, and a gate helper with no `process.env` reads. Caveat: they report as **failed**, not skipped; and gate coverage is convention, not enforcement (three more seeding suites are ungated: P8–P10). |
| Is PR #27's title and description precise about its actual security boundary? | **Title: no** (reads repository-wide; it covers 6 exports + 3 suites). **Description: mostly** — honest about the `@/db` mock's limits and about `ensureSeeded` being out of scope, but it never names the two concrete uncovered writers, and "CI's existing database-suite list is unchanged" is contradicted by the diff. |
| What is the minimum safe remediation that does not weaken any existing guard? | (a) Documentation/scope correction (§7.1, immediate, no code). (b) One consolidation boundary module that every canonical write consults, reusing the reviewed `classifyDatabaseTarget` (§7.2 item 1) — additive only. (c) Move lazy seeding out of read routes to a target-classified bootstrap script (§7.2 item 2), as its own authorized change. (d) A DB-free static invariant test with an allowlist (§7.2 item 4). No existing guard is touched, relaxed, or made configurable in any of these. |

---

## 9. Attestation

* **No database was accessed.** No `DATABASE_URL` or `PG*` variable existed in the audit environment; no connection string was used; no client was connected; no query was issued. No Supabase, Neon, Vercel, production, staging, or disposable database was contacted.
* **No ingestion, seeding, reconciliation, verification, or mutation script was executed**, and no test suite was executed.
* **No existing file or guard was changed.** `git status` was clean before the audit; the only change is the addition of this report. `canonicalWriteGate.ts`, `trustedDatabaseExecutor.ts`, `loader.ts`, `pipeline.ts`, all scripts, all tests, the schema, datasets, dependencies, and lockfiles are untouched.
* **No branch, commit, or PR operation was performed.** No reset, clean, stash, delete, force-push, rebase, amend, merge, or push. No PR was created, merged, or closed; PR #27 remains OPEN at `6fc51009f908b71785861628a4633850009ced9f`.
* **No environment-variable, caller-token, caller-flag, or other untrusted escape hatch was added or proposed as a bypass.** Every recommendation in §7.2 *adds* a refusal; none removes one.
* The only repository mutation is the local git ref `refs/audit/pr27` created by `git fetch` for diffing (a ref, not a branch — no checkout, no commit). It may be removed with `git update-ref -d refs/audit/pr27`.

**Verdict:** PR #27 is **narrowly scoped and well implemented**, but **insufficient for a repository-wide guarantee**. The highest-priority uncovered paths are, in order: (1) `KnowledgeService.ensureSeeded()` via six unauthenticated GET routes reaching any `DATABASE_URL`; (2) `scripts/ingest-kanjidic2.ts`'s destructive canonical `kanji_entries` write behind a caller-declared target class; (3) three canonical-seeding test suites with no trusted-executor gate. Recommended next action: **leave PR #27's guards exactly as they are, and land the §7.1 scope correction plus this report** — then authorize §7.2 item 2 (remove lazy seeding from read routes) as the first security implementation, because it is the only path that an unauthenticated request can reach today.
