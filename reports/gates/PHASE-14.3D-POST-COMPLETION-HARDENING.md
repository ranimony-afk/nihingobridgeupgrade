# Phase 14.3D — Post-completion hardening

**14.3D COMPLETE**

**PR #13 OPEN and NOT MERGED**

**14.4 NOT STARTED**

**production NOT contacted**

This report records a read-only audit of the already-completed 14.3D foundation, plus one test correction for a CI false failure. It does not authorize production ingestion, a merge, or Phase 14.4.

| Boundary | State |
| :--- | :--- |
| Phase 14.3D | COMPLETE. Completion commit remains `bf1ee6583aea00a7389eb4c12ef738d5b6ccb269`. |
| Pull request | #13 OPEN, base `main`, not merged. No second PR was opened. |
| Phase 14.4 | NOT STARTED by this pass. No KANJIDIC2, KanjiVG, or Tatoeba acquisition or ingestion. Historical 14.4/14.5 files already on `main` were not modified and are not authorization. |
| Production | NOT contacted. No Supabase write, no production DSN, no `.env` created. |
| Source pin | Unchanged: `upstream:jmdict:2023-08`, release `2023-08-20`, 206717 entries, XML SHA-256 `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162`. |

## What this pass executed

Local HEAD before the hardening commit was still `94a247fce5af2a15396f2d0cebb3116e8ebced6e`. The worktree matched PR head `bf1ee65` on all 31 changed paths (`git hash-object` comparison, 0 mismatch). `data/JMdict.xml` was absent. `data/test-checkpoint.json` stayed `9a91cadb19791197ced68f50076ab8537ffb794b625290d424949bd8eeb8afd4`.

Executed this pass:

```text
npm ci --no-audit --no-fund
DATABASE_URL= DOTENV_CONFIG_PATH=/dev/null npx vitest run \
  tests/jmdict-source-contract.test.ts \
  tests/jmdict-safety-closure.test.ts \
  tests/jmdict-cli-load.test.ts
```

Result: 3 files, 21 passed, 1 skipped. The skip is the official-file case in `tests/jmdict-source-contract.test.ts`, because `data/JMdict.xml` is absent. That skip was not removed and is not a PASS.

Not executed this pass: full-corpus ingestion, full-corpus resume, production or Supabase contact, EXPLAIN on a loaded corpus, and the pre-existing CI tests that require the gitignored XML or a preloaded database.

An earlier disposable full-corpus attempt in this workspace was interrupted and is not evidence. It is not cited as a count, a throughput baseline, or a resume PASS.

## CI classification

PR #13 check run `36242632753`, job `108405902823`, compared with `main` run `36103386040`, job `107970527367`. Vercel passed. Supabase Preview is skipping. Neither is a 14.3D logic result.

| Failure | Class | Action |
| :--- | :--- | :--- |
| `tests/jmdict-source-contract.test.ts:112` expected `DATABASE_URL` to be empty; CI received the disposable `postgresql://…localhost:5432/nihongo_test` | 14.3D regression | Fixed. See below. |
| `tests/kanji-expansion.test.ts:74` expected 12, got 11 | Pre-existing | Same assertion failed on `main`. File is not in the 14.3D diff. Not modified. |
| `tests/full-jmdict-ingestion.test.ts` ENOENT on `data/JMdict.xml`, expected 206717 got 0, expected defined got undefined, hash-mismatch assertion received ENOENT | Pre-existing environment limitation | Same failures on `main`. The official XML must not be committed. Tests were not skipped and were not weakened. |
| `tests/dry-run-jmdict.test.ts:11` expected the official XML to exist | Pre-existing environment limitation | Same failure on `main`. File is not in the 14.3D diff. |
| `tests/dictionary-architecture.test.ts:48` expected 206717 rows | Pre-existing | Same failure on `main`. CI database is empty. File is not in the 14.3D diff. Not a 14.3D regression. |
| Actions Node 20 deprecation warning and `ubuntu-latest` migration notice | Environment limitation / unrelated | Notices only. CI was not edited to hide them. |

The job log download returned EOF. Classification uses the check annotations, not a reconstructed log.

## The one code change

`verifySourceContract` rejects a short fixture on size, hash, or release before any database call. The test had also required `DATABASE_URL` to be unset. That is not the safety property, and the authorized CI job sets a disposable loopback URL. The failure annotation also exposed that URL.

The assertion now sets a forbidden non-loopback URL, proves the same source rejections still fire, proves `data/test-checkpoint.json` is byte-identical, and restores the previous environment value. Source hashes, expected entry count, and release pin were not weakened.

## Audits

| Audit | Result this pass | Report |
| :--- | :--- | :--- |
| Field coverage and provenance | Code reading. No new corpus measurement. | `PHASE-14.3D-JMDICT-COVERAGE-AUDIT.md` |
| Search, indexes, API projection | Code reading. Corpus-scale plan NOT EXECUTED. | `PHASE-14.3D-SEARCH-READINESS.md` |
| Checkpoint, resume, conflict, idempotency | Fixture PASS for the cases listed in that report. Full corpus NOT EXECUTED. | `PHASE-14.3D-CHECKPOINT-RESUME-AUDIT.md` |

No schema migration, index, CMS, public API, or RAG store was added. No second ingestion implementation was added.

## Status

```text
14.3D remains COMPLETE
PR #13 remains OPEN
14.4 remains LOCKED
no merge performed
production NOT contacted
```
