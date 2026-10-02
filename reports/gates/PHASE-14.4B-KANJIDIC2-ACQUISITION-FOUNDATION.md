# Phase 14.4B Gate Report: KANJIDIC2 Controlled Source Acquisition & Foundation

**Gate Identifier:** `PHASE-14.4B-KANJIDIC2-ACQUISITION-FOUNDATION`
**Execution Date:** 2026-09-28
**Status:** **GO — PHASE 14.4B KANJIDIC2 ACQUISITION FOUNDATION VERIFIED**
**Preceding Phase:** Phase 14.4A (Scoped CI Gate — CLOSED GREEN, run `36323056834` @ `19074a7`)
**Target Phase:** Phase 14.4C (KANJIDIC2 Canonical Ingestion — Gated)

---

## 1. Executive Summary

Phase 14.4B establishes controlled, immutable, fail-closed acquisition of the KANJIDIC2 2023-08 corpus and nothing else. The previously unpinned `blob/main/` archive URL recorded in the test-locked manifest is **not** treated as a source contract: the exact archive commit and Git blob identity were resolved first, recorded in the new contract module, and independently verified against the Git object — exactly as the JMdict path does. The provisioner then executes the JMdict acquisition architecture end-to-end (pinned Git blob → archive bytes → archive SHA/size → Brotli → XML SHA/size → streamed 13,108-record count → transient `data/kanjidic2.xml`) with zero database writes. No canonical ingestion occurs in this phase.

### Verdict: GO
- **Immutable source only:** one pinned commit + Git blob; no fallback URL, no unpinned fetch, no silent substitution (`upstream:kanjidic2:2024-07` explicitly refused).
- **Fail closed on every gate:** source identity, archive identity, archive size, archive SHA-256, Brotli validity, XML size, XML SHA-256, release/file/database version, balance, and entry count.
- **Foundation suite at 25/25** — the four artifact-dependent tests (integrity, 13,108 dry-run, digest idempotency, memory) flip green exactly as the Gate 0 audit predicted; nothing else changed.
- **Zero production/schema/CI/JMdict/14.4C impact:** four new files only; see §9.

---

## 2. Immutable Source Identity Resolution (Closure Evidence 1–5)

The unpinned manifest URL `…/blob/main/kanjidic2_xml/kanjidic2.xml.br` was resolved **once**, against the same pinned archive snapshot the JMdict contract already trusts, and is never fetched:

| # | Identity | Verified value |
|---|----------|----------------|
| 1 | **Archive commit SHA** | `9cb709b87f43c7bceb494eefbe7f8b8f42744502` (`Jitendex/edrdg-dictionary-archive`) |
| 2 | **Git blob SHA** | `e6e448946b29480a765f167e9ee1cc3fc9314c6b` — independently recomputed (`sha1("blob 895754\0" + bytes)`) and matched |
| 3 | **Archive size / SHA-256** | 895,754 bytes / `175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb` |
| 4 | **XML size / SHA-256** | 15,643,593 bytes / `260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781` — **exact match to the test-locked manifest** |
| 5 | **Streamed record count** | **13,108** `<character>` = 13,108 `</character>` = 13,108 `<literal>` — exact match to `manifest.entryCount` |

Header values confirmed in the pinned XML and locked in the contract: `file_version = 4`, `database_version = 2023-232`, `date_of_creation = 2023-08-20`. Provenance identity: `upstream:kanjidic2:2023-08`, release `2023-08-20`, license `CC-BY-SA-3.0` (EDRDG attribution retained; differs from JMdict's 4.0 and is preserved as-is).

---

## 3. Fail-Closed Contract Specification

`src/etl/kanji/kanjidic2Contract.ts` (new) pins the complete identity and provides the gate assertions:

- `assertPinnedKanjidic2Source` — refuses `upstream:kanjidic2:2024-07`, unpinned strings, and URL-shaped forgeries.
- `assertOfficialKanjidic2Versions` — refuses any `date_of_creation` / `file_version` / `database_version` mismatch (SOURCE RELEASE / SOURCE VERSION MISMATCH).
- `Kanjidic2ByteScan` + `assertOfficialKanjidic2Scan` — streaming, constant-memory scan: XML declaration, root element, header versions, balanced `<character>` tags with `<literal>` triple-check, then `assertOfficialKanjidicEntryCount` (13,108). Preamble retention is bounded (1 MiB hard limit; the pinned header closes at byte 13,982).
- `assertOfficialKanjidicByteSize` / `assertOfficialKanjidicEntryCount` — explicit SOURCE SIZE / COUNT MISMATCH gates.

`scripts/provision-kanjidic2-ci.ts` (new) mirrors `provision-jmdict-ci.ts` structurally:

1. Resolve `git/trees/<pinned commit>?recursive=1` → exactly one blob at `kanjidic2_xml/kanjidic2.xml.br` with the pinned blob SHA (else IMMUTABLE SOURCE IDENTITY FAILED).
2. Download `git/blobs/<pinned blob>` → `assertGitBlobIdentity` (API-advertised **and** recomputed git-blob SHA-1) + advertised-size check.
3. `assertArchiveIdentity` (895,754 bytes + SHA-256).
4. Brotli decompression (fail-closed on corrupt frames).
5. `scanAndVerifyKanjidic2Xml` (15,643,593 bytes + SHA-256 + streamed version/balance/13,108 scan).
6. Atomic exposure: stale output removed **before** retrieval; write to `data/kanjidic2.xml.tmp-<pid>` then `rename`. A failed run leaves **no** output. Zero database writes; no `@/` imports; no network other than the two pinned GitHub API URLs.

---

## 4. Provisioner Execution Evidence (real run)

```
[KANJIDIC2 provision] verified Jitendex/edrdg-dictionary-archive@9cb709b87f43c7bceb494eefbe7f8b8f42744502:kanjidic2_xml/kanjidic2.xml.br
(blob e6e448946b29480a765f167e9ee1cc3fc9314c6b, archive 895754 bytes, XML 15643593 bytes, release 2023-08-20, entries 13108)
```

Executed via `npx tsx scripts/provision-kanjidic2-ci.ts` against the live GitHub API (sandbox TLS trust supplied via `NODE_EXTRA_CA_CERTS`; no code or contract change). Output `data/kanjidic2.xml` is transient and git-ignored (`/data/`, `*.xml`); no XML or binary data is committed.

---

## 5. Negative-Path Provisioning Test Evidence

`tests/kanjidic2-provisioning.test.ts` (new, synthetic bytes + mocked GitHub responses only — never downloads the corpus):

1. **locks the resolved archive identity** and accepts matching Git blob/archive identities with Brotli round-trip.
2. **rejects forged and wrong source identities fail-closed** — `upstream:kanjidic2:2024-07`, `…:latest`, trailing-space forgery, the unpinned `blob/main/` URL as a source id, empty string; API-advertised forged blob SHA; computed blob mismatch.
3. **rejects identity, size, hash, XML, and Brotli mismatches** before exposure (ARCHIVE SIZE/SHA, XML SIZE/SHA via the real `scanAndVerifyKanjidic2Xml`, BROTLI DECOMPRESSION FAILED).
4. **rejects version and entry-count mismatches fail-closed** — `date_of_creation 2024-07-20` → SOURCE RELEASE MISMATCH; `file_version 3` / `database_version 2024-245` → SOURCE VERSION MISMATCH; unbalanced records `(2/1/2)`, `(2/2/1)` → MALFORMED; missing declaration/root → MALFORMED; well-formed synthetic → SOURCE COUNT MISMATCH `expected 13108, got 2` (the count gate is live).
5. **fails closed when the pinned tree resolves a forged blob identity** (IMMUTABLE SOURCE IDENTITY FAILED; asserts the fetch URL contains the pinned commit and **not** `blob/main`; no output left).
6. **fails closed when the pinned blob payload is corrupt** (GIT BLOB IDENTITY MISMATCH; asserts pinned blob URL; no output left).

Result: **6/6 passed.**

---

## 6. Foundation Suite Evidence (Closure Evidence 6–7)

`tests/kanjidic2-etl-foundation.test.ts` — **25/25 passed** (suite unmodified). The four audited artifact-dependent failures flipped to green with no other test-state change:

| Test | Before (missing artifact) | After provisioning |
|------|---------------------------|--------------------|
| 3 — file size and SHA256 integrity | fail | pass (15,643,593 B / `260e6119…`) |
| 21 — full dry-run, 13,108 valid records | fail | pass (13,108/13,108, 0 rejected) |
| 22 — two-pass digest idempotency | fail | pass — **dry-run digest `63d0e901fb3b3cbacfddbe329ff1393011390382c3bbb8c152db2947d41ddc75`** (both passes identical) |
| 23 — peak memory bounded | fail | pass (heap < 128 MB, RSS < 256 MB) |

DB-precondition note: foundation #20/#25 read the first-party kanji baseline, which was established before the focused run through the existing production seeding paths (`KnowledgeService.ensureSeeded()` + `runKanjiETLPipeline()`, transient probe, deleted before commit) — the same 33-row baseline the Gate 0 audit measured against.

## 7. Static Verification (Closure Evidence 8)

- **Typecheck** (`npm run typecheck` / `tsc --noEmit`): clean, exit 0.
- **Lint** (`npm run lint` / `eslint .`): **0 errors, 4 warnings** — the identical 4 pre-existing warnings (`react-hooks/exhaustive-deps` × 4); no new findings.

---

## 8. Change Inventory & Diff (Closure Evidence 9–10)

Exact change set — **4 net-new files, 0 modifications** (`git status --short` at closure: only these four paths staged):

| Path | Role |
|------|------|
| `src/etl/kanji/kanjidic2Contract.ts` | Pinned identity contract + fail-closed gates (new) |
| `scripts/provision-kanjidic2-ci.ts` | Immutable CI provisioner, JMdict architecture (new) |
| `tests/kanjidic2-provisioning.test.ts` | Negative-path provisioning suite (new) |
| `reports/gates/PHASE-14.4B-KANJIDIC2-ACQUISITION-FOUNDATION.md` | This closure report (new) |

Diff shape: pure additions (~660 lines); no existing line is modified.

---

## 9. Scope & Safety Audit (Closure Evidence 11)

- **No 14.4C canonical ingestion:** `scripts/ingest-kanjidic2.ts`, `scripts/verify-kanjidic2-ingestion.ts`, `tests/kanjidic2-canonical-ingestion.test.ts` untouched; zero rows written anywhere.
- **No schema changes:** `src/db/schema.ts` untouched; no `kg_*` tables or DDL of any kind.
- **No CI changes:** `.github/workflows/ci.yml` untouched (Phase 14.4A scoped Test gate preserved).
- **No package.json changes:** `npm test` remains the repository-wide run.
- **No JMdict changes:** `jmdictContract.ts`, `provision-jmdict-ci.ts`, and all JMdict tests/counts/contracts byte-identical.
- **No existing KANJIDIC2 test or manifest changes:** `tests/kanjidic2-etl-foundation.test.ts`, `PHASE-14.4B-KANJIDIC2-ACQUISITION-MANIFEST.json` (test-locked), ETL modules (`xmlParser`, `transformer`, `types`, `fixture`), `dry-run-kanjidic2.ts` — all untouched.
- **No 14.4C first-party/45-row discrepancy modified:** `src/etl/kanji/fixture.ts`, `src/data/kanji.ts`, registry alias `first-party:kanji-corpus:v1 → upstream:kanjidic2:2024-07` left exactly as audited (open question for 14.4C).
- **Legacy `kanji-expansion` failure untouched** (out of scope by standing rule).
- **`localhost` safety model preserved:** no edit to `src/db/index.ts` or any connection/safety path; verification used an explicitly disposable target (`NIHONGO_DB_TARGET_CLASS=disposable`, `NIHONGO_DB_EXPECTED_DATABASE=app_db`, loopback PGlite).
- **No production DB access** at any point.
- **No committed XML/binary data:** `data/kanjidic2.xml` transient + git-ignored; a failed provision leaves no stale artifact.
- **No fallback/unpinned acquisition URL:** the only fetch targets are `git/trees/<pinned commit>` and `git/blobs/<pinned blob sha>`; tests assert `blob/main` is never requested.

---

## 10. Readiness for Phase 14.4C (KANJIDIC2 Canonical Ingestion — Gated)

14.4B is complete: the corpus is reproducibly acquirable to an immutable identity, and the foundation suite is 25/25. 14.4C remains gated behind its own Gate 0 audit and explicit authorization, with the recorded open questions (33-now vs 45-expected first-party rows, `kj-hashi`/箸 14-stroke preservation, the `first-party:kanji-corpus:v1 → upstream:kanjidic2:2024-07` alias, `localhost` literal in the 14.4C test). Per protocol, implementation does not continue past this boundary.

**Phase Commit SHA:** assigned at commit time — this report is committed together with the implementation and cannot contain its own SHA; the exact SHA is recorded in the phase closure delivery record.
