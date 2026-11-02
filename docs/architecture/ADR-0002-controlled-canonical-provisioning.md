# ADR-0002 — Controlled provisioning of first-party canonical Kanji data

- Status: **Accepted for implementation; execution requires operator authorization**
- Owner-approved acceptance target: **45 Kanji / 63 elements / 90 composition edges**, kana 208
- Release separation and gates: `reports/release/PR-SEPARATION-AND-RELEASE-PACKAGE.md`
- Date: 2026-11-02
- Supersedes: nothing. Complements PR #27 (canonical write denial) and PR #29
  (no request-time lazy seeding).
- Related: `docs/operations/PRODUCTION-CANONICAL-PROVISIONING-RUNBOOK.md`,
  `reports/security/PRODUCTION-CANONICAL-DATA-GAP.md`

## Context

Production holds 208 kana rows, 33 Mind Tree kanji, 55 elements and 71 composition
edges, all `first-party:kanji-mindtree:v1`. The repository defines a first-party
foundation of 45 headwords (33 Mind Tree + 12 curated corpus), 63 elements and
90 composition edges; `scripts/ingest-kanjidic2.ts:404` refuses to ingest upstream
KANJIDIC2 data unless exactly 45 first-party rows are present.

Three defects combined to produce the gap:

1. **One bootstrap dataset, two expected datasets.** `KnowledgeService.ensureSeeded()`
   seeds `src/data/kanji.ts` only. The 12 corpus rows in `src/etl/kanji/fixture.ts`
   are written exclusively by `runKanjiETLPipeline()` (`src/etl/kanji/pipeline.ts:12`),
   which no `src/` module imports: its only callers are tests and scripts.
2. **A database-state guard pretending to be a dataset check.** The bootstrap guard read
   `kana_entries` and returned early when it was non-empty, so a database with 208 kana
   rows and an incomplete Kanji foundation looked "already seeded" forever.
3. **No authorized write path existed at all.** `fixtureSetup.ts:40` refuses
   `NODE_ENV=production`; `ingest-kanjidic2.ts` is loopback-only and writes
   `kanji_entries` only; `provision-*-ci.ts` write no rows;
   `src/etl/dictionary/targetClassification.ts:157` refuses every production write by
   design. The only writer that could insert the 12 rows
   (`src/etl/kanji/loader.ts:148`) is an unguarded, shared test/script path that also
   issues `UPDATE` statements.

## Decision

Adopt **Option 1 — a one-time operator-controlled provisioning command**, implemented as
`scripts/provision-kanji-corpus.ts` plus the pure model in
`src/services/knowledge/canonicalDataset.ts` and the SQL boundary in
`src/services/knowledge/canonicalStore.ts`.

The command is:

- **dry-run by default** — the default mode writes nothing;
- **insert-only** — existing rows are never updated, replaced or deleted; a content
  difference is a stop condition;
- **single-transaction, advisory-locked, re-planned in-transaction** — no partial state;
- **validated before and after** — dataset completeness, duplicates, provenance, dangling
  references, and a digest proving pre-existing rows did not move;
- **explicitly authorized per run** — operator identity, approval reference, target class
  and a target identity hash are all required, and the run emits a secret-free audit
  record.

### Options evaluated

| Option | Verdict | Why |
|---|---|---|
| **1. Operator-controlled CLI (chosen)** | Adopt | Uses only the privileges the operator already holds; no new trust boundary inside the application; smallest surface that can be audited and rehearsed on a disposable database. |
| **2. Restricted database function** | Reject for now | Would put a write-capable object in production that any role with `EXECUTE` could call, requires `CREATE FUNCTION` rights and a migration, and the repository has no migration for functions — it would also make the fixed dataset a schema artifact that drifts from `src/etl/kanji/fixture.ts`. Revisit only if the platform removes operator shell access. |
| **3. Reuse the existing ingestion script** | Reject | `scripts/ingest-kanjidic2.ts` is loopback-only (`assertSafeDatabaseUrl`, ~line 91), writes `kanji_entries` only, and requires the 45-row baseline to already exist — it cannot create the baseline it depends on. |
| Reuse `runKanjiETLPipeline()` | Reject | It is the shared test path: unguarded writes, `UPDATE`s on existing rows (`loader.ts:108`, `:187`, `:243`), and no kana/state awareness. Making it production-capable would weaken PR #27. |

## Consequences

### Authorization and trust boundary

The application holds no production provisioning authority. The tool runs as a human
operator with a least-privilege role (`SELECT`/`INSERT` on the three Kanji tables,
`SELECT` on `kana_entries`). The flags (`--operator`, `--approval-ref`,
`--accept-target-class`, `--confirm-target`) are **intent and accountability controls,
not authentication**: they make an accidental run against the wrong database hard and
leave a record of who intended what. Authorization itself is the credential plus the
approved change record. No bypass flag, environment variable, request parameter or
service-role key is accepted.

### Roles and permissions

- `SELECT, INSERT` on `kanji_radicals`, `kanji_entries`, `kanji_composition`
- `SELECT` on `kana_entries`
- No `UPDATE`, `DELETE`, `TRUNCATE`, `CREATE`, no schema ownership.
- The application runtime role does not gain any of the above.

### Transaction, concurrency, retry

`BEGIN` → `pg_advisory_xact_lock(7416299504429250983)` → re-read → re-plan → insert →
validate → `COMMIT`, or `ROLLBACK` on any failure. A second concurrent operator blocks
on the advisory lock and then sees a complete dataset (no-op). Retrying after a rollback
is safe because the plan is derived from live state; retrying after a commit is a no-op.

### Failure behaviour

| Failure | Result |
|---|---|
| Plan blocker (drift, id collision, dangling reference) | Refused before any write |
| Insert error / connection loss mid-run | Full rollback, zero rows |
| Post-write invariant failure | Full rollback, zero rows |
| Kana baseline mismatch | Full rollback, zero rows |
| Missing schema | Refused before any write |

### Idempotency

Re-running against a complete dataset inserts nothing and reports `already-complete`,
verified by test (`tests/kanji-canonical-provisioning.test.ts`).

### Operational ownership

The provisioning run is owned by the operator named in `--operator` and the approver
named in the change record. No automated system (CI, cron, route, deploy hook) triggers
it. The application's ongoing responsibility is limited to *reporting* state via
`KnowledgeService.getCanonicalKanjiState()`.

### Release separation

This ADR and its implementation ship as a **stacked PR** on the narrow request-path fix
(`c52ea82`), not independently on `main`: the bootstrap decision is only safe once request paths stop
calling `ensureSeeded()`, and the forward guard commit edits the isolation test that PR #29 creates.
Dependency matrix and exact integration sequence: `reports/release/PR-SEPARATION-AND-RELEASE-PACKAGE.md`.

### Interaction with PR #27 and PR #29

- PR #27 guards the ETL loader's exported writers. The provisioner does not import
  `src/etl/kanji/*` writers, so the guard is neither bypassed nor weakened; the two
  mechanisms are complementary (defence in depth: request-path and test-path denial plus
  one authorized operator path).
- PR #29 removes request-time seeding. The bootstrap guard change here removes the
  remaining database-state assumption behind it; read paths still never seed.

### What this ADR does not claim

- That production was provisioned.
- That the deployed schema equals `src/db/schema.ts`.
- That the 12 corpus records are linguistically reviewed for production; they are the
  repository's curated pilot corpus, unchanged, and their provenance
  (`first-party:kanji-corpus:v1`) is the repository's own declaration.

## Implementation map

| File | Role |
|---|---|
| `src/services/knowledge/canonicalDataset.ts` | Dataset definitions from repository source data; state classification; insert-only planning; post-write invariants; digests. Pure. |
| `src/services/knowledge/canonicalStore.ts` | Read/verify/provision SQL boundary; `Queryable` interface satisfied by `pg` and PGlite. |
| `src/services/knowledge/canonicalBootstrapGuard.ts` | Pure bootstrap decision (empty → seed, complete → no-op, anything else → refuse). |
| `src/services/knowledge/provisioningTarget.ts` | Target classification + execute preconditions; returns only a class and a hash. |
| `src/services/knowledge/knowledgeService.ts` | Guard wired into `ensureSeeded`; read-only `readKanjiBootstrapCounts` and `getCanonicalKanjiState`. |
| `scripts/provision-kanji-corpus.ts` | CLI: `verify` / `dry-run` / `execute`, exit codes, audit JSON. |
| `docs/operations/PRODUCTION-CANONICAL-PROVISIONING-RUNBOOK.md` | Human procedure, approval checkpoints, recovery. |
