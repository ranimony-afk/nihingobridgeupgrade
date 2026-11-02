## What this PR is

**Controlled provisioning of the first-party Kanji foundation to the owner-approved target:
45 Kanji / 63 elements / 90 composition edges** (kana unchanged at 208).

> **Dependency: STACKED.** This PR is based on `release/pr29-narrow` (the narrow request-path fix,
> commit `c52ea82`), not on `main`. It is *not* independently mergeable against `main`:
> `tests/kanji-read-path-write-isolation.test.ts` and the `knowledgeService.ts` context come from
> that PR, and the fail-closed bootstrap decision is only safe once request paths stop calling
> `ensureSeeded()`. Merge order: **#27 → narrow #29 → this PR**. After the narrow PR merges, this PR
> is retargeted to `main` (no rebase, no force-push) and CI is re-run on the updated head.

## Contents

### Dataset model and bootstrap decision

- `src/services/knowledge/canonicalDataset.ts` — the two first-party datasets built from repository
  source data (`src/data/kanji.ts` → 33/55/71; `src/etl/kanji/fixture.ts` → 12/8/19), state
  classification, insert-only planning, post-write invariants, digests. Pure, no I/O.
- `src/services/knowledge/canonicalBootstrapGuard.ts` — empty → seed; Mind Tree complete → no-op;
  anything else → `CanonicalBootstrapStateError`. The old guard keyed on `kana_entries`, which is why
  a database with 208 kana rows and 33 Kanji headwords was treated as finished.
- `knowledgeService.ts` — guard wired in, plus read-only `readKanjiBootstrapCounts()` and
  `getCanonicalKanjiState()` (`FULLY_PROVISIONED` / `EMPTY` / `PARTIALLY_PROVISIONED` /
  `INCONSISTENT` / `UNKNOWN`).

### Provisioning

- `scripts/provision-kanji-corpus.ts` — `--mode=verify|dry-run|execute`; dry-run is the default.
- `src/services/knowledge/canonicalStore.ts` — one transaction, advisory lock, re-read/re-plan,
  insert-only, invariant validation, rollback on any failure.
- `src/services/knowledge/provisioningTarget.ts` — target class + identity hash; refuses
  connection-string options; emits no host, database, user or credential.

### Why 45 and not 33+12 rows alone

Two of the 12 headwords name a primary element outside the Mind Tree set (`el-shinnyou`, `el-kin`)
and 8 distinct elements appear across their 19 composition edges. `primary_radical_id` and
`element_id` have no foreign keys, so a 12-row-only insert would "succeed" and leave dangling
references. The atomic unit is 12 headwords + 8 elements + 19 edges.

### Docs

- `docs/operations/PRODUCTION-CANONICAL-PROVISIONING-RUNBOOK.md` — operator procedure.
- `docs/architecture/ADR-0002-controlled-canonical-provisioning.md` — option evaluation, trust boundary.
- `reports/security/PRODUCTION-CANONICAL-DATA-GAP.md` — record-level 12-headword gap report.
- `reports/release/PR-SEPARATION-AND-RELEASE-PACKAGE.md` — dependency matrix and release gates.

## Security posture

- Insert-only by construction: no `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `DROP` or upsert anywhere
  in the provisioning path (static test). Drift or a unique-character collision is a stop, never an
  overwrite.
- The documented least-privilege role (`SELECT, INSERT` on the three canonical tables, `SELECT` on
  `kana_entries`) is **proven sufficient and proven unable to mutate** by tests that create such a
  role, run the whole operation under it, and assert `UPDATE`/`DELETE`/`TRUNCATE`/`ALTER` are denied.
  A read-only role fails closed with zero rows written.
- CLI flags are accountability controls, not authentication — stated in the ADR. The real controls are
  the least-privilege credential plus the approved change record.
- No route, cron job, deploy hook or CI step can invoke the provisioner; a test walks `src/app` and
  fails if any file imports the provisioning writer.
- PR #27's canonical write denial is neither used nor weakened: the provisioner does not import the
  ETL writers.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npx eslint .` | 0 errors, 3 pre-existing warnings |
| `npm run build` | pass |
| `tests/kanji-canonical-dataset-state.test.ts` | 22/22 (DB-free) |
| `tests/kanji-canonical-provisioning.test.ts` | 13/13 (PGlite, disposable) |
| `tests/kanji-provisioning-cli-contract.test.ts` | 12/12 (DB-free) |
| `tests/kanji-read-path-write-isolation.test.ts` | 12/12 (DB-free) |
| PR #27 denial suite on the combined tree | 20/20 |
| End-to-end CLI on a disposable PGlite wire server | verify → `PARTIALLY_PROVISIONED` (33/55/71); dry-run → 12/8/19; execute → 45/63/90 with untouched-row digest unchanged; re-execute → `already-complete` |

## Not in this PR

No production connection, no production write, no migration, no merge, no deployment. Production
execution remains a separately authorized operator action.
