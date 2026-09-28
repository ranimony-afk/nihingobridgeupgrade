# Phase 14.4B Gate Report: KANJIDIC2 Controlled Acquisition & ETL Foundation

**Gate Identifier:** `PHASE-14.4B-KANJIDIC2-ACQUISITION`
**Execution Date:** 2026-09-28
**Status:** **GO — PHASE 14.4B KANJIDIC2 CONTROLLED ACQUISITION VERIFIED**
**Authoritative Baseline:** Phase 14.4A CLOSED GREEN — implementation `76b36fe70339908e9549e27460613b2803d5540d`, verification-only CI commit `19074a7b236bb7a58affca68c0c7765ff7ff96e4`, verified CI run `36323056834` (scoped Test 13 files / 249 tests PASS)
**Target Phase:** Phase 14.4C (KANJIDIC2 Canonical Ingestion — separate, future, gated)

---

## 1. Source Identity (Closure Field 1)

| Field | Value |
|-------|-------|
| sourceRef | `upstream:kanjidic2:2023-08` |
| Source / attribution | Electronic Dictionary Research and Development Group (EDRDG) |
| License | `CC-BY-SA-3.0` (retained as-is; differs from JMdict's 4.0) |
| Release date | `2023-08-20` |
| databaseVersion | `2023-232` |
| fileVersion | `4` |

## 2. Pinned Archive Commit (Closure Field 2)

`9cb709b87f43c7bceb494eefbe7f8b8f42744502` — repository `Jitendex/edrdg-dictionary-archive`, path `kanjidic2_xml/kanjidic2.xml.br`.

The manifest's `blob/main/` URL is **not** treated as an immutable source contract. Per the audit correction, the exact archive commit and Git blob identity were resolved first and only that pinned identity is used for acquisition. The unpinned URL is provenance documentation and is never fetched (a provisioning test asserts `blob/main` never appears in any fetch target). The old EDRDG HTTP URL is never used as a fallback.

## 3. Pinned Git Blob SHA (Closure Field 3)

`e6e448946b29480a765f167e9ee1cc3fc9314c6b` — independently verified against the Git object twice (resolution time and re-verification): the pinned tree at the pinned commit resolves exactly one blob at the pinned path with this SHA, and the downloaded bytes recompute to it (`sha1("blob 895754\0" + bytes)`).

## 4. Archive Identity (Closure Field 4)

| Property | Value |
|----------|-------|
| Archive size | **895,754 bytes** |
| Archive SHA-256 | `175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb` |
| Git blob SHA-1 | `e6e448946b29480a765f167e9ee1cc3fc9314c6b` |
| Container | Brotli (`.br`) |

## 5–7. XML Identity (Closure Fields 5–7)

| Property | Value | Match |
|----------|-------|-------|
| XML SHA-256 (Field 5) | `260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781` | exact = manifest `SHA256` |
| XML size (Field 6) | **15,643,593 bytes** | exact = manifest `size` |
| Entry count (Field 7) | **13,108** character records | exact = manifest `entryCount` |

Counted streamingly three ways on the verified bytes: `<character>` = `</character>` = `<literal>` = 13,108.

## 8. Release / Version Metadata (Closure Field 8)

Header values confirmed in the pinned XML and gate-checked fail-closed by `assertOfficialKanjidic2Versions`: `date_of_creation = 2023-08-20`, `file_version = 4`, `database_version = 2023-232` — consistent with the contract and the locked manifest. Full identity chain:

```
repository + commit SHA + path + blob SHA + archive SHA-256/size
  + decompressed XML SHA-256/size + entry count (13,108) + release/version metadata
```

## 9. Dry-Run Digest (Closure Field 9)

`63d0e901fb3b3cbacfddbe329ff1393011390382c3bbb8c152db2947d41ddc75` — repository-locked expected digest, matched **exactly** by the existing zero-write machinery (`scripts/dry-run-kanjidic2.ts`, `runFullTwoPassDryRun`) on a fresh disposable database with an empty kanji ID-preservation map (the canonical map-less configuration, identical to foundation test #22):

```
Run 1 Complete: 13108/13108 records … Digest: 63d0e901…d41ddc75
Run 2 Complete: 13108/13108 records … Digest: 63d0e901…d41ddc75
Idempotency Check: PASS (IDENTICAL)
Database Unmutated Check: PASS (0 WRITES)
Peak Heap: 25.1 MB     Peak RSS: 110.7 MB     (bounded; < 128 MB / < 256 MB thresholds)
```

No canonical ingestion is invoked by the dry-run machinery (read + transform + digest only). A second machinery run against the seeded 33-row first-party baseline (non-empty ID-preservation map) is also deterministic two-pass and zero-write; its digest (`226d6d79f32c3d7f61fd9e75972751701dfaf11b733ef21cc37a8576ba9edac0`) differs from the canonical digest solely because preserved baseline IDs (e.g. `kj-mei`) override generated IDs — the test #19 preservation rule, working as designed.

## 10. Tests (Closure Field 10)

Verification order executed as prescribed. Pre-acquisition baseline (Step 4) reproduced the audited state exactly, proving the four failures are solely artifact-dependent:

| Stage | Result |
|-------|--------|
| Step 4 — foundation **without** artifact | **21 PASS / 4 FAIL** — exactly #3 (XML size + SHA-256), #21 (13,108 dry-run), #22 (two-pass digest), #23 (bounded memory) |
| Step 4 — provisioning tests | **6/6 PASS** |
| Step 6 — foundation **with** artifact (suite unmodified) | **25/25 PASS** |
| Step 6 — provisioning tests (re-run) | **6/6 PASS** |

Provisioning suite (`tests/kanjidic2-provisioning.test.ts`, synthetic bytes + mocked GitHub only — never downloads the corpus):

1. positive identity chain — resolved commit/blob/size/hash constants locked and coherent; matching Git blob + archive identities accepted; Brotli round-trip.
2. **forged/unpinned source identities fail closed** — `upstream:kanjidic2:2024-07`, `…:latest`, trailing-space forgery, the unpinned `blob/main/` URL as a source id, empty string.
3. **wrong Git blob SHA / archive checksums fail closed** — API-advertised forged blob SHA; computed blob mismatch; archive size/SHA mismatch; XML size/SHA mismatch (real `scanAndVerifyKanjidic2Xml` gates); corrupt Brotli.
4. **wrong entry count / version metadata fail closed** — well-formed synthetic → `SOURCE COUNT MISMATCH: expected 13108, got 2`; `date_of_creation`/`file_version`/`database_version` mismatches; unbalanced records; missing declaration/root.
5. **wrong archive/source identity at the pinned tree fails closed** — forged tree blob identity → `IMMUTABLE SOURCE IDENTITY FAILED`, pinned-commit URL asserted, `blob/main` asserted absent, no output left.
6. **corrupt pinned payload fails closed** — `GIT BLOB IDENTITY MISMATCH`, pinned-blob URL asserted, no output left.

## 11. Static Checks (Closure Field 11)

- **Typecheck** (`tsc --noEmit`): clean, exit 0.
- **Lint** (`eslint .`): **0 errors, 4 warnings** — the identical 4 pre-existing `react-hooks/exhaustive-deps` warnings; no findings in new files.

## 12. Safety Guarantees

- No PostgreSQL writes (dry-run `dbUnmutated` = PASS (0 WRITES) on both runs); no schema mutation; no canonical ingestion; no production DSN.
- No fallback source, no silent alternate download, no `|| true`, no `continue-on-error`, no skipped verification, no weakened checksums/counts. Provisioner removes any stale output before retrieval and writes atomically — a failed run leaves no artifact.
- `data/kanjidic2.xml` transient + git-ignored; no large binary/XML in Git; `data/jmdict-checkpoint.json` remains uncommitted.
- `localhost` safety model preserved (`src/db/index.ts` untouched); provenance registry entries untouched; test-locked manifest untouched; existing KANJIDIC2 test expectations untouched.
- Exact 14.4B diff vs the 14.4A verification baseline `19074a7` = **4 files added, 872 insertions, 0 deletions**: `src/etl/kanji/kanjidic2Contract.ts`, `scripts/provision-kanjidic2-ci.ts`, `tests/kanjidic2-provisioning.test.ts`, `reports/gates/PHASE-14.4B-KANJIDIC2-ACQUISITION-FOUNDATION.md`. All prohibited paths verified byte-unchanged (`git diff --quiet` empty across schema, JMdict contract/ingestion/provisioner/tests, CI workflow, `package.json`, 14.4A tests, 14.4C canonical test/ingest script, registry, fixture, dry-run and ETL modules).

## 13. Exact Commit SHA (Closure Field 12)

**Implementation commit:** `4540e7987e7357857c0cbb55b7a7c12a44fe106a`
`feat(kanjidic2): add pinned KANJIDIC2 2023-08 acquisition foundation (Phase 14.4B)` — 4 files, 872 insertions(+), 0 deletions(-), pushed `19074a7..4540e79` to `arena/01a0de3a-nihingobridgeupgrade`.

This closure report is committed subsequently as a docs-only commit (its own SHA is recorded in the delivery record; a file cannot contain its own commit SHA).

**Report lineage note:** `PHASE-14.4B-KANJIDIC2-ACQUISITION-FOUNDATION.md` (committed inside the implementation commit under the prior authorization's filename) remains in history as the first closure record; this document is the authoritative closure report per the current authorization's filename and fields.

## 14. Phase Boundary

14.4C–E (canonical PostgreSQL ingestion, reconciliation, first-party merge rules, dictionary immutability verification, KanjiVG, lexical graph) are **not** started. No CI dispatch, no merge. Awaiting authorization for the next gate.
