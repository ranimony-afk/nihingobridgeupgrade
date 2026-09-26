# Phase 14.3D — Final F1–F9 Verification

**Verdict: GO**

GO means 14.3D is technically ready for a separate explicit ingestion-authorization gate. It does not authorize production ingestion, Supabase contact, a full-corpus write, or Phase 14.4A.

**FULL INGESTION AUTHORIZED: NO**

## Repository

| Field | Value |
| :--- | :--- |
| Branch | `arena/01a0d755-nihingobridgeupgrade` |
| Verification commit | `04f34a579e7708791bd2ac79014d56926f86de6f` |
| Parent HEAD before this verification | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| Named commits `a43c416` and `03bf2b7` | Not present in this object store. The safety-closure work was preserved as uncommitted files and is included in this verification commit. |
| Working tree | Not reset, cleaned, stashed, or rebased. |
| Historical report | `reports/gates/PHASE-14.3D-FULL-JMDICT-INGESTION.md` was not overwritten. |

The earlier contract file uses a different F5–F9 numbering. This report uses the numbering required for this verification.

## Source

Independently computed from the retained bytes on 2026-09-25. The hash in source code was not treated as proof.

| Field | Value |
| :--- | :--- |
| Path | `data/JMdict.xml` (gitignored) |
| Archive | `data/JMdict.br` (gitignored) |
| Release | `2023-08-20`, from `<!-- JMdict created: 2023-08-20 -->` |
| sourceRef | `upstream:jmdict:2023-08` |
| XML size | `115331197` |
| XML SHA-256 | `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162` |
| Archive size | `13383352` |
| Archive SHA-256 | `608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16` |
| Entry count | `206717` `<entry>`, `206717` `</entry>`, `206717` `<ent_seq>` |
| 2024-07 | Absent |

The release comment is at byte offset 22938. The first 8192 bytes do not contain it. The verifier now streams until `<JMdict>` or 1 MiB, whichever comes first, and counts entry tags in the same hash pass. It does not load the corpus into one buffer and does not treat file existence as sufficient.

Acquisition source: public `Jitendex/edrdg-dictionary-archive` base file `JMdict/JMdict.br`, which that repository documents as the 2023-08-20 EDRDG snapshot. The current weekly EDRDG file was not used. The archive was hashed before decompression.

## F1–F9 matrix

| Gate | Requirement | Evidence | Result |
| :--- | :--- | :--- | :--- |
| F1 | Source identity from actual bytes: size, SHA-256, release, source id, entry count. | `verifySourceContract` on `data/JMdict.xml` passed. First 8192 bytes lack the release comment. `tests/jmdict-source-contract.test.ts` passed, including the retained-file case. | Pass |
| F2 | Classify the target before client construction. Loopback is not authorization. Forbidden hosts stay forbidden. | Executed against disposable `127.0.0.1:54329/postgres`, role `postgres`, class `DISPOSABLE`, identity `c5a3e2735a475059b245b3aea0e194655f1f530e59125131a8e5557c128b093f`. `inet_server_addr()` was null and was not used as an allow signal. Unit tests reject unknown, bare loopback, forbidden, and production before `pg.Client`. | Pass |
| F3 | Dry-run validates the source and does not write rows or checkpoints. | `executeIngestion({ dryRun: true })` processed 206717 entries in 10.53s (19629 rec/sec), wall clock 11.2s. Status `DRY_RUN_COMPLETE`. `data/test-checkpoint.json` unchanged. No resume checkpoint created. Disposable row count stayed 0. | Pass |
| F4 | Malformed CLI and API inputs fail before source open, client creation, checkpoint write, or adapter use. | `tests/jmdict-f4-f7.test.ts` F4 cases passed. Unknown flags, invalid stage, invalid batch, and invalid conflict policy are covered there and in `tests/jmdict-safety-closure.test.ts`. | Pass |
| F5 | Checkpoint binds source, hash, release, database identity, version, and origin. A failed batch and a dry-run do not advance it. | Fixture tests in `tests/jmdict-safety-closure.test.ts` and `tests/jmdict-f4-f7.test.ts` passed. The real dry-run left checkpoint bytes unchanged. A successful full-corpus checkpoint was not created because the write is forbidden. | Pass, with that limit |
| F6 | Resume fails closed on hash, release, database, version, malformed JSON, dry-run origin, or missing file. No silent restart at zero. | `loadResumeCheckpoint` tests passed. No full-corpus resume was attempted. | Pass |
| F7 | Retained source bytes, immutable accepted batches, pathname substitution rejected. | Existing F7 suite passed. The real file was hashed by the repository verifier and again by an independent streaming hash. Both matched the pin. | Pass |
| F8 | Default policy abort. Identical skip, new insert, differing abort, explicit update only. Counts come from payload comparison. | In-memory and PGlite tests passed, including a preflight fixture with one real conflict. Full-corpus preflight against an empty disposable table computed inserts 206717, skips 0, conflicts 0, updates 0. Those zeros are the comparison result, not hardcoded counters. | Pass |
| F9 | One adapter batch is one transaction. Failure leaves no partial rows and does not advance the checkpoint. | PGlite proof in `tests/jmdict-safety-closure.test.ts` passed. This is not production PostgreSQL certification. | Pass as disposable proof |

## Tests

| Suite | Result |
| :--- | :--- |
| Source contract | 4 passed, including the retained pinned file |
| F4/F7 | Passed in the 167-test bounded run |
| Dictionary foundation | Passed |
| Provenance foundation and quality | Passed |
| Dictionary ETL | Passed |
| Safety closure, including transaction and conflict | 12 passed |
| Combined bounded suite | 7 files, 167 passed, then source-contract re-run 4 passed |
| Typecheck | `tsc --noEmit` passed |
| Lint | ESLint on the changed dictionary, script, and test files passed |
| Build | `next build` passed in 10.4s compile, TypeScript 13.6s, 13 static pages |
| CI | Not re-run. Latest main run `36103386040` on `94a247f` failed in Test. Typecheck, lint, and build were skipped there. See CI status. |

The official-file case skips when `data/JMdict.xml` is absent, so CI does not gain a new failure from a file that must not be committed. Locally the file was present and the case passed.

## Database

| Field | Value |
| :--- | :--- |
| Target class | `DISPOSABLE` |
| Host | `127.0.0.1` |
| Port | `54329` |
| Database | `postgres` |
| Role | `postgres` |
| Identity hash | `c5a3e2735a475059b245b3aea0e194655f1f530e59125131a8e5557c128b093f` |
| Engine | In-memory PGlite wire server, not Supabase and not a tunnel |
| Production contacted | No |
| Rows written | 0 |
| Preflight | Read-only. 27.2s. Existing rows 0. Planned inserts 206717. Planned skips 0. Planned conflicts 0. Planned updates 0. Estimated ingestion batches at size 1000: 207. |

## Changed files

Verifier fix:

- `src/etl/dictionary/jmdictContract.ts`
- `src/etl/dictionary/index.ts`
- `scripts/ingest-full-jmdict.ts`
- `tests/jmdict-source-contract.test.ts`
- `tests/jmdict-safety-closure.test.ts`

Preserved safety-closure work, not discarded:

- `.env.example`
- `.github/workflows/ci.yml`
- `scripts/dry-run-jmdict.ts`
- `scripts/pilot-jmdict-db.ts`
- `scripts/preflight-check.ts`
- `scripts/verify-full-ingestion.ts`
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
- `reports/gates/PHASE-14.3D-F1-F9-CONTRACT.md`
- `reports/gates/PHASE-14.3D-SAFETY-CLOSURE.md`

Not committed: `data/JMdict.xml`, `data/JMdict.br`. `data/test-checkpoint.json` was not modified.

## Database impact

- Schema changed: no
- Migration changed: no
- Dictionary rows written: no
- Production rows written: no

The disposable probe created an empty `dictionary_entries` table in an in-memory PGlite process and then stopped that process. That database was not a repository migration and was not production.

## CI status

Run `36103386040`, job on `94a247f`, conclusion failure. The Test step failed. Later steps were skipped.

Independent annotations from that parent commit:

- `tests/kanji-expansion.test.ts` expected 12 and received 11. Not modified here.
- `tests/full-jmdict-ingestion.test.ts` and `tests/dry-run-jmdict.test.ts` failed because `data/JMdict.xml` is absent in CI.
- `tests/dictionary-architecture.test.ts` expected 206717 rows and received 0 on the empty CI database.

This work does not commit the corpus. CI still depends on the gitignored artifact for those older suites. That dependency is documented, not waived. This session did not push, so Actions has not run on the verifier fix. No new CI regression was observed.

## Security assessment

- No `DATABASE_URL`, password, token, or Supabase URL was printed.
- Production, unknown, ambiguous, and forbidden targets are rejected before `pg.Client`.
- The disposable probe was explicit: class `disposable`, expected database `postgres`, exact loopback host.
- A loopback tunnel can still be mislabeled if an operator sets both classification variables. The engine does not treat loopback as sufficient, and `inet_server_addr()` is not an allow signal.

## Performance

- Dry-run parse phase: 10.53s, 19629 records/sec, 206717 processed, 0 rejected.
- Read-only preflight of the same corpus against an empty disposable table: 27.2s.
- Production build compile: 10.4s.

## Remaining risks

- Full-corpus write and the checkpoint that would follow a successful write were not executed. That is required, not an oversight.
- Full-corpus conflict counts were computed against an empty table. Nonzero conflict behavior was proven on fixtures.
- F9 is a PGlite proof, not a production PostgreSQL certification.
- CI on `94a247f` remains red for the reasons above. This commit has not been run in Actions.
- D-13 remains uncleared and is outside this phase.
- An operator can still mislabel a loopback tunnel as disposable.

## Production authorization

FULL INGESTION AUTHORIZED: NO

## Final verdict

**GO**
