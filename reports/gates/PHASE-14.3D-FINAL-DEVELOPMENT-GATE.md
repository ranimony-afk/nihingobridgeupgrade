# Phase 14.3D — Final Development Gate

**Verdict: GO**

This is a software development gate. It is not production-ingestion authorization, not a Supabase contact, and not permission to start Phase 14.4.

**PRODUCTION INGESTION AUTHORIZED: NO**

**PHASE 14.4 AUTHORIZED: NO**

## Baseline before this session's edits

| Field | Value |
| :--- | :--- |
| Branch | `arena/01a0d755-nihingobridgeupgrade` |
| Local HEAD | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| `origin/main` | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| Working tree | Dirty with the existing Phase 14.3D safety implementation. Not reset, cleaned, or stashed. |
| `04f34a579e7708791bd2ac79014d56926f86de6f` | Absent from this object store. Not used as evidence. |
| `9dc8e3f`, `820e97a`, `b7d4bac` | Absent locally. Not used as evidence. |
| Historical GO reports | Not current approval. Not overwritten. |
| `DATABASE_URL` and every `NIHONGO_DB_*` variable | Unset at inspection. No `.env` file. |
| `data/JMdict.xml` | Absent at inspection. |
| `data/test-checkpoint.json` | Present. SHA-256 `9a91cadb19791197ced68f50076ab8537ffb794b625290d424949bd8eeb8afd4`. |

The two named gaps were already patched in the dirty tree before this session's tests: the final partial batch shared `commitIngestionBatch` with full batches, and `@/db` was no longer imported at module load. This session verified those fixes, extended the short-batch proof, and acquired the pinned corpus outside git.

## Implementation

- `scripts/ingest-full-jmdict.ts`: every primary batch, including a final batch smaller than the batch size, calls `commitSourceBatch` with the version-2 checkpoint binding. The checkpoint is written only after `upsertBatch` returns. Dry-run passes no checkpoint and does not evaluate `@/db` or the Drizzle adapter module. `server-only` remains on `src/db/index.ts`.
- Idempotency run 2 still does not rewrite the checkpoint. A re-read from the start must not rewind the resume cursor.
- Write execution that imports `@/db` requires Node's `react-server` export condition. That is the package's own server condition, not a shim. Plain `tsx` writes fail closed on `server-only`. Dry-run does not need the condition.

No second ingestion implementation, persistence adapter, or database layer was added.

## Source evidence

Acquired this session from public `Jitendex/edrdg-dictionary-archive` file `JMdict/JMdict.br` via `gh api` with the raw accept header. The current weekly EDRDG file was not used. The archive was hashed before decompression. Both files are gitignored and were not committed.

| Field | Result |
| :--- | :--- |
| Archive bytes | `13383352` |
| Archive SHA-256 | `608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16` |
| XML bytes | `115331197` |
| XML SHA-256 | `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162` |
| Release | `2023-08-20` |
| Source id | `upstream:jmdict:2023-08` |
| Entry count | `206717`, asserted by `verifySourceContract` during the disposable pilot |

`tests/jmdict-source-contract.test.ts`: 4 passed, including the retained-file case. The official-file case still skips when the XML is absent. It was not weakened.

## Checkpoint evidence

Fixture proof in `tests/jmdict-safety-closure.test.ts`, disposable PGlite, no network database:

- A 717-row batch, smaller than the normal size of 1,000, inserted 717 rows and wrote checkpoint version 2, origin `ingestion`, with the committed cursor, source hash, and disposable database identity. `loadResumeCheckpoint` accepted it.
- Repeating that batch skipped 717 and inserted 0. The cursor did not move. Row count stayed 717.
- A differing payload aborted. The stored headword stayed `水`. The resume checkpoint bytes did not change. Explicit `conflictPolicy: "update"` then changed that headword to `改` and still did not rewrite the resume checkpoint.
- A following 5-row batch injected a failure after its writes. Those ids were absent, the prior 717 rows remained, and the checkpoint bytes did not change. Resume still returned the previous cursor. A missing checkpoint file threw instead of restarting at zero.
- Retry of that 5-row batch inserted 5. The new cursor was strictly after the previous safe cursor.

Live proof through `executeIngestion` on the classified disposable server, pilot stage A, batch size 1,000, so the only batch was a final partial batch of 10:

```text
[BATCH_START] Final partial Batch #1 (size: 10)...
[BATCH_COMMIT] Batch #1 committed: Ins=10, Upd=0, Skip=0
[CHECKPOINT] Checkpoint saved at ent_seq=1000110 (10 processed)
```

The saved checkpoint was version 2, origin `ingestion`, source `upstream:jmdict:2023-08`, release `2023-08-20`, source hash `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162`, cursor `1000110`, and database identity `c5a3e2735a475059b245b3aea0e194655f1f530e59125131a8e5557c128b093f` for `127.0.0.1:54329/postgres` role `postgres`.

## CLI process evidence

`npx tsx scripts/ingest-full-jmdict.ts --dry-run` was launched as a separate process with `DATABASE_URL` unset. It did not use the Vitest `server-only` alias.

Result: exit 0, `DRY_RUN_COMPLETE`, `processedCount` 206717, `checkpointMutated` false. No `server-only` error, no `BATCH_COMMIT`, no connection string. `data/jmdict-checkpoint.json` was not created. `data/test-checkpoint.json` stayed `9a91cadb19791197ced68f50076ab8537ffb794b625290d424949bd8eeb8afd4`.

## Disposable database evidence

Target classified before the ingestion connection:

| Field | Value |
| :--- | :--- |
| Decision | `ALLOW` only after class `disposable` and expected database `postgres` |
| Host | `127.0.0.1` |
| Port | `54329` |
| Database | `postgres` |
| Role | `postgres` |
| Engine | PostgreSQL 18.3 (PGlite 0.5.8) |
| `inet_server_addr()` | null. Not used as an allow signal. |
| Identity hash | `c5a3e2735a475059b245b3aea0e194655f1f530e59125131a8e5557c128b093f` |

Loopback alone was not treated as authorization. No production host was contacted.

| Check | Result |
| :--- | :--- |
| Short batch | 10 rows inserted by the final partial batch. Checkpoint advanced to `1000110`. |
| Repeat | Inserted 0, updated 0, skipped 10. Count stayed 10. Cursor stayed `1000110`. |
| Default abort | Headword of `de-jmdict-1000110` was set to `CONFLICT-SENTINEL`. The batch aborted. The sentinel remained. Count stayed 10. Checkpoint bytes were unchanged. |
| Explicit update | `--conflict-policy update` updated 1, skipped 9, and restored the headword to `CDプレーヤー`. |
| Resume | Resumed from `1000110`, not from zero. Inserted the next 10 ids, all after that cursor. Checkpoint advanced to `1000230` only after that commit. |
| Isolation | `users`, `srs_cards`, `srs_reviews`, `cms_content_items`, `cms_audit_log`, `kanji_entries`, and `grammar_patterns` stayed at 0. |
| Failure rollback | Proven on disposable PGlite by an injected failure after writes. The new ids were absent and the checkpoint did not advance. The live server has no CLI failure-injection flag; the conflict abort above is the live failed-batch proof. |

The pilot then threw `[FINAL_RECONCILIATION] Field mismatches in random sample: 99`. That sample assumes the full corpus is loaded. A 10-row or 20-row pilot cannot satisfy it. The throw happened after the successful batch commit and checkpoint write. It is a known bound, not a partial-batch checkpoint failure, and full ingestion was not run to make the sample pass.

## Verification matrix

| # | Item | Result |
| :--- | :--- | :--- |
| 1 | Source contract | PASS |
| 2 | Source hashing | PASS |
| 3 | Release validation | PASS |
| 4 | Parser | PASS |
| 5 | Transformation | PASS |
| 6 | Deterministic IDs | PASS |
| 7 | Provenance | PASS |
| 8 | Target classification | PASS |
| 9 | CLI authorization | PASS |
| 10 | Unknown flags | PASS |
| 11 | Pilot bounds | PASS |
| 12 | Conflict policy | PASS |
| 13 | Transaction atomicity | PASS |
| 14 | Checkpoint creation | PASS |
| 15 | Checkpoint failure behavior | PASS |
| 16 | Resume validation | PASS |
| 17 | Database identity | PASS |
| 18 | Dry-run behavior | PASS |
| 19 | Process-level CLI | PASS |
| 20 | Isolation | PASS |
| 21 | Idempotency | PASS |
| 22 | Failure recovery | PASS |
| 23 | Tests | PASS |
| 24 | Documentation | PASS |

## Tests

```text
DATABASE_URL= DOTENV_CONFIG_PATH=/dev/null ./node_modules/.bin/vitest run \
  tests/jmdict-safety-closure.test.ts \
  tests/jmdict-source-contract.test.ts \
  tests/jmdict-f4-f7.test.ts \
  tests/dictionary-etl-foundation.test.ts \
  tests/dictionary-etl.test.ts \
  tests/provenance-foundation.test.ts \
  tests/jmdict-cli-load.test.ts
# 7 files, 142 passed

DATABASE_URL= DOTENV_CONFIG_PATH=/dev/null ./node_modules/.bin/vitest run \
  tests/provenance-quality-checks.test.ts
# 31 passed

DATABASE_URL= DOTENV_CONFIG_PATH=/dev/null ./node_modules/.bin/tsc --noEmit --pretty false --incremental false
# passed

./node_modules/.bin/eslint \
  scripts/ingest-full-jmdict.ts \
  tests/jmdict-safety-closure.test.ts \
  tests/jmdict-cli-load.test.ts \
  src/etl/dictionary/persistenceAdapter.ts \
  src/etl/dictionary/jmdictContract.ts \
  src/etl/dictionary/targetClassification.ts \
  src/etl/dictionary/persistencePlan.ts
# passed
```

Not run, and not claimed: the full Vitest suite, `tests/full-jmdict-ingestion.test.ts` as a separate invocation, GitHub Actions, and `next build`. The full-ingestion suite needs the official XML and a database module; the official XML checks that matter for this gate were run through the source-contract test, the process-level dry-run, and the disposable pilot.

## Known limitations

- A bounded pilot cannot pass the engine's 100-record full-corpus sample. That is expected and was not weakened.
- A full 206,717-row disposable write was not executed. This gate does not authorize it.
- Plain `tsx` without `--conditions=react-server` cannot import `@/db`. Dry-run does not import it. Writes fail closed unless the process is a server-condition run. `server-only` was not removed and was not shimmed.
- `inet_server_addr()` was null on PGlite. It was recorded and was not an allow signal.
- CI on `94a247f` was not re-run.

## Production status

No production database was contacted. No production credential was requested, printed, or committed. Production ingestion was not run. A later production gate still requires an injected `DATABASE_URL`, exact host and database verification, read-only inspection, inventory, zero-conflict preflight, backup evidence, and explicit operator authorization.

## Commit

| Field | Value |
| :--- | :--- |
| Implementation commit | `5b20ce580686248c7d0be979ce93ed8a23313738` |
| Parent | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| Branch | `arena/01a0d755-nihingobridgeupgrade` |
| Corpus or credentials in the commit | None |

This SHA was verified after the implementation commit. It is the commit that contains the safety implementation, the short-batch checkpoint fix, and this gate report before this SHA line was added.

## Verdict

```text
PHASE 14.3D FINAL DEVELOPMENT GATE: GO
PRODUCTION INGESTION AUTHORIZED: NO
PHASE 14.4 AUTHORIZED: NO
```
