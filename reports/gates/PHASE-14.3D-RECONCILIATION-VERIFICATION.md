# Phase 14.3D — Reconciliation Verification

**Verdict: GO**

GO means the current working-tree implementation of Phase 14.3D was independently verified. It does not authorize production ingestion.

**FULL INGESTION AUTHORIZED: NO**

**PHASE 14.4A AUTHORIZED: NO**

## A. Gate verdict

**GO**

## B. Repository identity

| Field | Value |
| :--- | :--- |
| Branch | `arena/01a0d755-nihingobridgeupgrade` |
| HEAD before this reconciliation | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| Reconciliation commit | `9dc8e3f9aa932709144708af80279918c7fb96f5` |
| Remote `main` | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| Claimed verification commit `04f34a579e7708791bd2ac79014d56926f86de6f` | Not a commit. Absent locally (`git cat-file` fails) and absent on GitHub (HTTP 422). |
| Working tree | Dirty safety-closure files were present and were not discarded. |
| Remote branch at inspection | Did not exist. |
| Remote branch after this gate | Pushed. Implementation commit `9dc8e3f9aa932709144708af80279918c7fb96f5`. Not merged to `main`. |

Remote inspection was performed with the GitHub API, not from stale local refs.

PR #12 is merged.

| Field | Value |
| :--- | :--- |
| State | `MERGED` |
| Head SHA | `da71127ce7bccff3302fd376e4bab27e92c54af6` |
| Merge SHA | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| Base | `main` |
| Title | `fix(etl): close Phase 14.3D F4/F7 integrity gaps` |
| Final F1–F9 report on `main` | Absent |

`94a247f` is the authoritative remote commit. It is the F4/F7 merge, not the later safety closure. That later closure exists only in this working tree. Its named commit was a claim, not an object. Historical gate reports were not treated as current proof.

The committed `verifySourceContract` hashes the whole file but does not read the release marker from the bytes. It also accepts `--authorized` as an alias. The working tree rejects that alias, scans the release marker past the first 8192 bytes, and classifies the target before `pg.Client`. Those differences are why the working tree, not `94a247f` alone, was the implementation under test.

## C. Source verification

Acquired this session from the public Jitendex EDRDG archive file `JMdict/JMdict.br`, which that repository documents as the 2023-08-20 base. The archive was hashed before decompression. No other release was substituted. Neither file was committed. Both are gitignored.

| Field | Value |
| :--- | :--- |
| Archive size | `13383352` |
| Archive SHA-256 | `608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16` |
| XML size | `115331197` |
| XML SHA-256 | `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162` |
| Release | `2023-08-20` |
| Release offset | byte `22938` |
| First 8192 bytes contain the release marker | No |
| Entry open / close / ent_seq | `206717` / `206717` / `206717` |
| `2024-07` present | No |
| Source id | `upstream:jmdict:2023-08` |

The repository verifier accepted the same file: source `upstream:jmdict:2023-08`, release `2023-08-20`, size `115331197`, SHA-256 as above, entry count `206717`.

## D. F1–F9 matrix

| Gate | Requirement | Implementation | Evidence | Result | Remaining risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| F1 | Source id, release, size, SHA-256, entry count, rejection of 2024-07, no 8192-byte assumption | Working-tree `JmdictByteScan` streams to `<JMdict>` or 1 MiB and counts tags in the hash pass. Official pins are enforced only for the pinned hash. | Independent byte hash and count. `tests/jmdict-source-contract.test.ts` passed, including the retained file. Release marker is at byte 22938. | Pass | Not present on remote `94a247f`. |
| F2 | No write without the explicit flag. Pilot cannot authorize a full write. Classification before a write connection. | `assertIngestionAuthorization` runs before source or database work. `validateEnvironmentSafety` classifies before `pg.Client`. Production is refused even if a production flag is set. | Safety-closure tests passed. Disposable preflight classified `127.0.0.1:55432` as `DISPOSABLE` before the read-only plan. | Pass | A loopback tunnel can still be mislabeled if both classification variables are set. Loopback alone is rejected. |
| F3 | Unknown flags fail. `--authorized` is not an alias. Omitted defaults remain. Pilot A–D stay bounded. Stage E cannot bypass the flag. | `SUPPORTED_CLI_FLAGS` has no `--authorized`. `PILOT_BOUNDS` are 10, 100, 1000, 10000. | Safety-closure CLI tests passed. | Pass | Remote `94a247f` still treats `--authorized` as an alias. |
| F4 | Malformed stage, batch, conflict policy, CLI options, and configuration fail before side effects. | `validateIngestionOptions` and `prepareCli` reject them before IO. | `tests/jmdict-f4-f7.test.ts` and safety-closure tests passed. | Pass | None observed. |
| F5 | IDs are `de-jmdict-${entSeq}`. Checkpoint is versioned and binds source, release, hash, and database identity. Dry-run and rollback do not advance it. | `CHECKPOINT_VERSION` is 2. Checkpoint save happens only after a successful full-size batch. | Dry-run left `data/test-checkpoint.json` unchanged (`9a91cadb19791197ced68f50076ab8537ffb794b625290d424949bd8eeb8afd4`). No `data/jmdict-checkpoint.json` was created. Pilot rows used `de-jmdict-${entSeq}`. | Pass, with a limit | The final partial batch does not write a checkpoint. A crash during a short pilot would not have a resume cursor. It also cannot silently resume from zero. |
| F6 | Default abort. New insert, identical skip, differing abort, explicit update only. `sourceRef` is part of the payload. | `resolveConflictPolicy` defaults to abort. `payloadsEqual` includes `sourceRef`. | In-memory and PGlite adapter tests passed. Disposable pilot inserted 10, repeated with 0 inserts and 10 skips, then aborted when one headword differed. The sentinel was not overwritten. | Pass | Full-corpus conflict behavior was not executed. The empty-target plan had 0 conflicts. |
| F7 | Retained bytes, hash, parser, candidates, accepted batch, and adapter are protected from pathname replacement. Accepted batches are frozen. | Snapshot descriptor is unlinked after hashing. `acceptSourceBatch` checks source ownership and freezes payloads. | Existing F4/F7 suite passed. The real file hash matched the independent hash. | Pass | None observed. |
| F8 | One adapter batch is one transaction. Injected failure leaves the prior state. | `DrizzleDictionaryPersistenceAdapter.upsertBatch` writes inside `db.transaction` and throws after the writes when fault injection is set. The CLI cannot set that flag. | Safety-closure PGlite test passed: failed batch left the prior row and did not change a checkpoint. This is not a scratch helper. | Pass as disposable proof | Not certified on production PostgreSQL. |
| F9 | Resume rejects corrupt, missing, wrong hash, wrong release, wrong database, dry-run origin, and incompatible version. No silent restart at zero. | `loadResumeCheckpoint` throws on every one of those cases. | Safety-closure tests passed. No full-corpus resume was attempted. | Pass | A missing checkpoint refuses resume. It does not invent a cursor. |

## E. Test matrix

| Suite | Executed | Result | Mutation risk |
| :--- | :--- | :--- | :--- |
| `tests/jmdict-source-contract.test.ts` | Yes | Passed in the 127-test run, including the retained file | Reads `data/test-checkpoint.json`. Bytes unchanged. |
| `tests/jmdict-safety-closure.test.ts` | Yes | Passed | Temp files only. Does not open the committed checkpoint. |
| `tests/jmdict-f4-f7.test.ts` | Yes | Passed | Temp fixtures only. |
| `tests/dictionary-etl-foundation.test.ts` | Yes | Passed | No corpus write. |
| `tests/provenance-foundation.test.ts` | Yes | Passed | No corpus write. |
| Combined safe suite | Yes | 5 files, 127 passed | Checkpoint hash unchanged. |
| `tests/dry-run-jmdict.test.ts` | No | Not run | Writes `reports/gates/jmdict-dry-run-stats.json`. |
| `tests/full-jmdict-ingestion.test.ts` | No | Not run | Opens the real corpus and the application database. Not safe as a blind suite. |
| Typecheck | Yes | `tsc --noEmit` passed | None |
| Lint | Yes | ESLint passed on the changed dictionary, script, and test files | None |
| Build | No | Not re-run | None |
| Disposable engine dry-run, preflight, and stage-A pilot | Yes | Passed, with the expected post-pilot sample gap below | Disposable database only. Committed checkpoint unchanged. |

## F. Database

| Field | Value |
| :--- | :--- |
| Database contacted | Yes. Disposable in-memory PGlite 0.5.8 only. |
| Host | `127.0.0.1` |
| Port | `55432` |
| Database | `postgres` |
| Role | `postgres` |
| Classification | `DISPOSABLE` |
| Identity hash | `ed57c28fd67c021ec748bee6531115b0f423d790b197ed63a07a93ee1679fcc9` |
| `inet_server_addr()` | null. Not used as an allow signal. |
| Production contacted | No |
| Supabase contacted | No |
| Schema changed in the repository | No |
| Rows written to production | No |
| Disposable dictionary rows written | 10, by bounded pilot stage A. Not the 206717-row corpus. |
| Checkpoint changed | No. `data/test-checkpoint.json` remained 561 bytes, SHA-256 `9a91cadb19791197ced68f50076ab8537ffb794b625290d424949bd8eeb8afd4`. |

A sandbox listener on `169.254.0.21:55432` forwarded toward the local port. It was not used. Classification required the explicit disposable class and the expected database name. Loopback was not treated as sufficient.

Preflight against the empty disposable table was read-only:

| Plan | Value |
| :--- | :--- |
| Existing rows | 0 |
| Planned inserts | 206717 |
| Planned skips | 0 |
| Planned conflicts | 0 |
| Planned updates | 0 |
| Unexpected ids | 0 |

Engine dry-run returned `DRY_RUN_COMPLETE`, processed `206717`, and did not mutate a checkpoint.

Streaming dry-run, separately measured: 10.746s, 19237 records/sec, peak 368 MB. Parsed 206717, rejected 0, accepted 206717, id collisions 0, provenance mismatches 0.

Pilot stage A persisted 10 rows in 0.49s. Repeat run inserted 0, updated 0, skipped 10. A differing headword aborted. The other nine rows stayed. Isolation tables `users`, `srs_cards`, `srs_reviews`, `cms_content_items`, `cms_audit_log`, `test_sessions`, `kanji_entries`, and `grammar_patterns` stayed at 0.

The engine's own 100-record corpus sample then reported 1 matched and 99 missing, and threw. That is the expected result of a 10-row pilot. It is not a field mismatch of the persisted rows. Full ingestion was not run, so that sample was not expected to pass.

## G. Security

- Target classification is explicit. Unknown, forbidden, bare loopback, and production targets are rejected before `pg.Client`.
- Full ingestion still requires `--authorize-full-ingestion`. This session did not pass it.
- No password, token, or connection string was written to a checkpoint or to this report.
- Production was not contacted.
- D-13 remains an uncleared deployment gate in the A12/A13 reports. This session did not re-test rate limiting and does not clear it.

## H. Changed files

Pre-existing and preserved, not discarded:

- `.env.example`
- `.github/workflows/ci.yml`
- `scripts/dry-run-jmdict.ts`
- `scripts/ingest-full-jmdict.ts`
- `scripts/pilot-jmdict-db.ts`
- `scripts/preflight-check.ts`
- `scripts/verify-full-ingestion.ts`
- `src/etl/dictionary/index.ts`
- `src/etl/dictionary/jmdictContract.ts`
- `src/etl/dictionary/loader.ts`
- `src/etl/dictionary/persistenceAdapter.ts`
- `src/etl/dictionary/persistencePlan.ts`
- `src/etl/dictionary/pipeline.ts`
- `src/etl/dictionary/targetClassification.ts`
- `src/etl/dictionary/types.ts`
- `src/services/knowledge/provenance/registry.ts`
- `src/services/knowledge/provenance/types.ts`
- `tests/dictionary-etl-foundation.test.ts`
- `tests/full-jmdict-ingestion.test.ts`
- `tests/jmdict-safety-closure.test.ts`
- `tests/jmdict-source-contract.test.ts`
- `reports/gates/PHASE-14.3D-F1-F9-CONTRACT.md`
- `reports/gates/PHASE-14.3D-FINAL-F1-F9-VERIFICATION.md`
- `reports/gates/PHASE-14.3D-FINAL-INGESTION-RECONCILIATION.md`
- `reports/gates/PHASE-14.3D-SAFETY-CLOSURE.md`

Added by this reconciliation:

- `reports/gates/PHASE-14.3D-RECONCILIATION-VERIFICATION.md`

Ignored and not committed:

- `data/JMdict.xml`
- `data/JMdict.br`

Unchanged:

- `data/test-checkpoint.json`

## I. Final authorization state

**FULL INGESTION AUTHORIZED: NO**

**PHASE 14.4A AUTHORIZED: NO**

## CI

Latest completed run on remote `main`: `36103386040`, head `94a247f`, conclusion failure. The Test step failed. Typecheck, lint, and build were skipped.

| Failure | Class |
| :--- | :--- |
| `tests/kanji-expansion.test.ts` expected 12 and received 11 | UNRELATED |
| `data/JMdict.xml` absent in CI for the full-ingestion and dry-run suites | ENVIRONMENT-DEPENDENT |
| `tests/dictionary-architecture.test.ts` expected 206717 rows and received 0 | ENVIRONMENT-DEPENDENT |
| Node 20 deprecation warning | Not a test failure |

This session did not change Kanji tests and did not commit the corpus. Local typecheck and lint passed. CI on the new reconciliation commit has not run. Red CI is not hidden.

## Sample reconciliation

The ten persisted pilot rows were compared with the transformer output. Nine matched on id, headword, reading, romaji, part of speech, senses, tags, kanji characters, common flag, JLPT, and `sourceRef`. `de-jmdict-1000000` remained `CONFLICT-SENTINEL` in headword only, which is the abort proof. Every persisted `sourceRef` was `upstream:jmdict:2023-08`.

Representative dry-run records:

| Case | Id | Headword | Reading |
| :--- | :--- | :--- | :--- |
| Kana-only, two senses | `de-jmdict-1000000` | `ヽ` | `ヽ` |
| Multiple readings and senses | `de-jmdict-1000040` | `〃` | `おなじ` |
| Multiple parts of speech | `de-jmdict-1000090` | `○` | `まる` |
| Kanji-containing vocabulary | `de-jmdict-1000100` | `ABC順` | `エービーシーじゅん` |

The first ten source entries are repetition marks and symbols, so the pilot did not persist a later ordinary vocabulary row. That is a bound, not a transform failure. The dry-run counted 30936 multi-orthography entries and 33700 multi-reading entries across the corpus.

## Provenance

The registry `contentHash` equals the independently computed XML SHA-256. The verifier rejects the file if those differ. The disposable `knowledge_sources` row records id `upstream:jmdict:2023-08`, version `2023-08`, license `CC-BY-SA-4.0`, and record count `206717`. That table has no content-hash column. The hash was not copied into a new column. Adding one would be a schema change and was not done.

## Remaining risks

- `04f34a5` cannot be recovered. A new commit of this working tree is a new baseline, not that hash.
- Remote `main` still lacks the byte-level release scan until this branch is reviewed and merged.
- The 206717-row write was not performed and is not authorized.
- F8 is a PGlite proof.
- The engine's 100-record sample assumes the full corpus is already loaded. A bounded pilot cannot satisfy it.
- A partial final batch does not advance the checkpoint.
- D-13 remains uncleared.
- CI on `94a247f` is red for the explained reasons above.

## Production authorization

This session stops before any Supabase connection, production preflight, or full ingestion. The next gate, if separately authorized, is the production ingestion authorization gate. Phase 14.4A does not start from this result.
