# Phase 14.3D — Checkpoint, resume, and conflict audit

**Full official corpus:** NOT EXECUTED this pass. Fixture results below are not a 206717-row proof.

**Command:**

```text
DATABASE_URL= DOTENV_CONFIG_PATH=/dev/null npx vitest run \
  tests/jmdict-source-contract.test.ts \
  tests/jmdict-safety-closure.test.ts \
  tests/jmdict-cli-load.test.ts
```

**Result:** 21 passed, 1 skipped, exit 0. Duration 13.91s. The skip is the retained official file. `data/test-checkpoint.json` remained `9a91cadb19791197ced68f50076ab8537ffb794b625290d424949bd8eeb8afd4`.

Checkpoint contract, from the passing fixture tests: version 2, origin `ingestion`, source id, source hash, release, transformation version, schema contract, id strategy, and target identity hash. The checkpoint is written after `upsertBatch` returns. A missing, corrupt, version-1, dry-run, cross-database, or source-hash-mismatched checkpoint throws. It does not restart at zero.

## Stress cases

| Case | Scope | Result |
| :--- | :--- | :--- |
| A. Empty database, full 206717-row run | Official corpus | NOT EXECUTED |
| B. Process interrupted inside an open batch | Official corpus / live server | NOT EXECUTED. A prior SIGTERM observation in this workspace was not a settled proof and is not reused. |
| B. Injected failure after writes inside one batch | PGlite fixture | PASS. `does not leave partial rows or advance the checkpoint when a short batch fails`. Prior id remained. Checkpoint bytes unchanged. |
| C. Duplicate rerun of the full corpus | Official corpus | NOT EXECUTED |
| C. Same fixture batch submitted again | PGlite, 717-row fixture | PASS. `commits 717 rows, resumes from that cursor, and retries only after a failed short batch` covers resume from the committed cursor and a later retry. It is not case C for the official file. |
| D. Changed source row for an existing id | PGlite fixture | PASS. Default policy aborts, stored headword unchanged, checkpoint not rewritten. Explicit `conflictPolicy: "update"` is required to change the row. |
| E. Source identity change | Fixture checkpoint and source contract | PASS. `sourceHash` mismatch throws. `upstream:jmdict:2024-07` throws. A short file with the wrong size, hash, or release throws before any checkpoint write, including when `DATABASE_URL` is a forbidden URL. |
| F. Partial batch failure | PGlite fixture | PASS. Same injected-failure test as case B. One transaction. Failed id absent. |
| G. Checkpoint version mismatch | Fixture file | PASS. Version 1 / missing origin throws `/incompatible\|origin/`. Corrupt JSON throws. Cross-target identity throws. |
| H. Clean rerun after a completed full corpus | Official corpus | NOT EXECUTED |

Idempotency on the fixture path is the skip of an identical payload, not a second full-file run. Preflight counts on the fixture path come from that same comparison: insert, identical skip, and conflict are counted rather than hardcoded.

## Performance

| Measurement | Result |
| :--- | :--- |
| Full-corpus parse / dry-run throughput | NOT EXECUTED. Official XML absent. |
| Full-corpus insert throughput | NOT EXECUTED. |
| Fixture suite | 13.91s for the three files above, including PGlite startup. Not an ingestion rate. |

No throughput number from an interrupted run is adopted as a baseline.

## Conflict rule

Default remains abort. Identical payload skips. A differing payload, including `sourceRef`, does not update unless `conflictPolicy` is explicitly `update`. Rows are not deleted to resolve a conflict. This pass did not change that rule.
