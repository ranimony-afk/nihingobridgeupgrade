# Phase 14.3D-R Safety Closure

**Verdict: GO**

This GO closes the demonstrated 14.3D safety and verification gaps. It does not authorize production ingestion, Supabase contact, or a full-corpus run. A separate production-ingestion authorization gate is still required.

**Parent tree:** `94a247fce5af2a15396f2d0cebb3116e8ebced6e`
**Implementation commit:** `03bf2b71633976d4a402d32224626eaf5f188770`
**Branch:** `arena/01a0d755-nihingobridgeupgrade`
**Date:** 2026-09-25
**Contract:** `reports/gates/PHASE-14.3D-F1-F9-CONTRACT.md`
**Historical report:** `reports/gates/PHASE-14.3D-FULL-JMDICT-INGESTION.md` was not overwritten and is not current approval.

## What was not done

- `data/JMdict.xml` is absent. Its bytes were not hashed. Verification of the official artifact is not claimed.
- The archive SHA-256 is a pin only. No archive was hashed in this session.
- No ingestion script was executed. No database connection was opened. The linked Supabase project was not contacted.
- `data/test-checkpoint.json` was not deleted or modified.
- No schema migration was added or applied. `contentHash`, `artifactBytes`, and `archiveSha256` are optional provenance-registry fields. Reconciliation compares the registry pin with the SHA-256 computed from retained XML bytes.
- D-13 remains uncleared. This closure does not touch it.

## Database identity

`sha256("nihongo-db-target-v1" + NUL + host + NUL + port + NUL + database + NUL + role)`.

The password and connection string are not stored. The role is the PostgreSQL user name. After connect, the connected database name and `current_user` must match the classified target. `inet_server_addr()` is recorded when the server returns it and is not an allow signal.

## 20-point result

| # | Point | Result | Evidence class |
| :--- | :--- | :--- | :--- |
| 1 | Gate 0 tree. Work starts from `94a247f`. The historical 14.3D GO is not current approval. | Pass | Repository |
| 2 | No production write, no ingestion, no committed XML, checkpoint file unchanged. | Pass | This session |
| 3 | CI on `94a247f` characterized independently. Not used as current regression evidence. | Characterized, not green | Environment |
| 4 | F1. Pinned source is `upstream:jmdict:2023-08`, release `2023-08-20`, 206717 entries, XML SHA-256 `a9be8a98…0162`. `2024-07` is refused. Fixture mismatch throws before a snapshot is retained. Official file absent, so official bytes are not verified. | Pass as fail-closed code. Official bytes not verified. | Implementation. Environment absent. |
| 5 | F2. No-flag and `--pilot E` / `pilotStage: "E"` throw before source open, client construction, or checkpoint IO. Explicit full-ingestion authorization still classifies before any source open. | Pass | Implementation |
| 6 | F3. Unknown flags, including `--authorized`, throw before IO. Omitted flags keep defaults. `--pilot` alone remains stage B. | Pass | Implementation |
| 7 | F4. Malformed public inputs still reject before side effects. Existing suite not weakened. | Pass | Implementation |
| 8 | F5. Dictionary ids remain `de-jmdict-${entSeq}`. The 14.2 stamp `JMDICT_SOURCE_REF` stays `upstream:jmdict:2024-07` because foundation tests require it. 14.3D entry points refuse that id. | Pass | Implementation |
| 9 | F6. Default policy is abort. Identical payload skips. Absent id inserts. Differing payload, including `sourceRef`, aborts and leaves the row unchanged unless `conflictPolicy: "update"` is explicit. | Pass | Implementation |
| 10 | Preflight counts come from that same payload comparison. A fixture with one identical row, one changed row, and one new row reports inserts 1, skips 1, conflicts 1, updates 0 under abort and updates 1 under explicit update. | Pass | PGlite integration |
| 11 | F7. Dry-run does not create a checkpoint. An existing checkpoint stays byte-identical when dry-run persistence throws. A failed non-dry-run batch does not advance the checkpoint. Existing F7 snapshot tests pass. | Pass | Implementation and PGlite |
| 12 | F8. `DrizzleDictionaryPersistenceAdapter.upsertBatch` writes one batch in one `db.transaction`. An injected failure after the insert leaves the new id absent and the previously committed row unchanged. `testRollbackTransaction` remains a scratch helper and is not this proof. | Pass | PGlite integration |
| 13 | F9. Resume requires checkpoint version 2, origin `ingestion`, and the source plus target identity above. Missing, corrupt, incompatible, dry-run, and cross-database checkpoints throw and do not restart at zero. | Pass | Implementation |
| 14 | Target classification rejects before `pg.Client`. Unknown is reject. Exact loopback without `disposable` and an exact expected database is reject. Production is reject even if `authorizeProduction` is set. Forbidden domains are exact or dotted suffixes, not substrings. | Pass | Implementation |
| 15 | Pilot stages A–D remain 10, 100, 1,000, and 10,000. Stage E is not a bound and is not authorization. | Pass | Implementation |
| 16 | Provenance can reconcile the pin: registry `contentHash` equals the XML SHA-256 pin. No database migration. | Pass | Implementation |
| 17 | Acquisition procedure is in the F1–F9 contract. The 115MB XML was not committed. | Pass | Documentation |
| 18 | Required closure tests pass, including no writes before rejection. Foundation, dictionary ETL, provenance, and F4/F7 suites that were run were not weakened. | Pass | Implementation |
| 19 | `data/test-checkpoint.json` was isolated, not deleted. Case 11 of the older ingestion suite writes under `tmpdir()`. That older suite was not executed. | Pass | Repository |
| 20 | Separate production-ingestion authorization remains ungranted. | Not granted | Explicit non-authorization |

## Commands run

```text
npm ci --no-audit --no-fund
# exit 0, 444 packages

DATABASE_URL= DOTENV_CONFIG_PATH=/dev/null npx tsc --noEmit --pretty false
# exit 0

npx eslint <changed dictionary, provenance, script, and test files>
# exit 0

DATABASE_URL= DOTENV_CONFIG_PATH=/dev/null npx vitest run \
  tests/jmdict-safety-closure.test.ts \
  tests/jmdict-f4-f7.test.ts \
  tests/dictionary-etl-foundation.test.ts \
  tests/dictionary-etl.test.ts \
  tests/provenance-foundation.test.ts \
  tests/provenance-quality-checks.test.ts
# 6 files, 163 tests passed

# safety file re-run after the pilot-bound assertion
# tests/jmdict-safety-closure.test.ts: 12 passed
```

Not run, and not claimed as evidence: `tests/full-jmdict-ingestion.test.ts`, `tests/dry-run-jmdict.test.ts`, the ingestion scripts, and the full Vitest suite. The first two require `data/JMdict.xml`, which is absent. The older ingestion suite also imports the real database module.

## CI, characterized independently

GitHub Actions run `36103386040`, job `107970527367`, head `94a247f`.

The Test step failed. Typecheck, lint, production build, and the boot assertion were skipped because the test step failed. Annotations on that parent commit:

- `tests/kanji-expansion.test.ts` expected 12 and received 11. Unrelated to this closure. Not modified here.
- `tests/full-jmdict-ingestion.test.ts` and `tests/dry-run-jmdict.test.ts` failed because `data/JMdict.xml` is absent in CI.
- `tests/dictionary-architecture.test.ts` expected 206717 dictionary rows and received 0. That is an empty disposable database, not a hash waiver.

This session did not re-run Actions. Historical CI red is not a regression introduced by this closure, and it is not current approval. CI is not claimed green.

## Residual risk

An operator can mislabel a loopback tunnel by setting `NIHONGO_DB_TARGET_CLASS=disposable` and `NIHONGO_DB_EXPECTED_DATABASE` to the tunneled database name. Loopback is required and is not sufficient. This phase still refuses production-classified targets and forbidden domains before connect. It does not claim a tunnel is impossible.

The CI workflow now sets those two variables for its disposable `localhost` service container. That classifies the CI database only. It does not classify production.

## Verdict

**GO**

14.3D safety gates are closed in the ingestion path and are ready for a separate production-ingestion authorization gate. This verdict does not authorize that ingestion.
