# Phase 14.4D — Controlled KanjiVG Ingestion / Execution (Closure Report)

**Date:** 2026-09-29
**Authorization:** Phase 14.4D controlled disposable-database KanjiVG execution and
closure verification. Executed against the disposable target only.

---

## 1. Repository

| Field | Value |
| :--- | :--- |
| HEAD (baseline) | `7a29affe7430b2440f75f8ad71437923d7a0cfbc` (source-identity recovery/re-pin checkpoint) |
| parent | `913f0e6ef8ff69bdbc8da4667ff5560e42c93956` (Phase 14.4C closure checkpoint — intact, never amended) |
| remote HEAD | `7a29affe7430b2440f75f8ad71437923d7a0cfbc` (pre-commit; = baseline after snapshot-graft recovery) |
| origin/main | `848c8b5122704cef46d8c7ed9e74d41b6e49d923` (untouched) |
| worktree status | clean except the bounded 14.4D execution delta (below) + 2 never-commit historical GATE-0 audits |

Snapshot-restore graft detected at start of execution (HEAD at `5fc3ed8` with the
phantom-modified set). Recovered losslessly per procedure: fetch → full-tree blob
verification (0 mismatches / 0 missing against `7a29aff`) → worktree-preserving
mixed reset. 14.4C protected paths byte-identical (`git diff 913f0e6..HEAD` over
the protection boundary = empty).

## 2. Source (re-acquired and re-verified this execution)

| Field | Value |
| :--- | :--- |
| repository | `KanjiVG/kanjivg` |
| tag | `r20240807` |
| commit | `a4b51d966d832544c371d566f9c84174e4beff3b` (remote tag check resolved) |
| archive | `kanjivg-r20240807.tar.gz` |
| archive size | 6,403,118 |
| archive SHA-256 | `a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd` |
| index size | 293,747 |
| index SHA-256 | `43e9d0b71f7288e72bb6a74bdaa52498fe381a1045925789e62695fc863cf6d0` |
| SVG count | 11,658 |
| primary count | 6,699 |
| variant count | 4,959 |
| malformed / duplicates | 0 / 0 |
| license | CC-BY-SA-3.0 (COPYING legal code + README "Ulrich Apel" / "Attribution-Share Alike 3.0") |
| provenance | `upstream:kanjivg:2024-08` (version `r20240807`); `upstream:kanjivg:2024-04` registered but unused |

All §6 preflight gates PASS (repository/tag/commit identity, archive SHA/size,
corpus counts, filename validity, duplicates, index SHA/size/keys, license,
sourceRef) before any canonical write. Acquisition gates suite 14/14; source
verifier PASS (17/17, independent index regeneration byte-identical).

## 3. Database (disposable only)

| Field | Value |
| :--- | :--- |
| target classification | `NIHONGO_DB_TARGET_CLASS=disposable` / `NIHONGO_DB_EXPECTED_DATABASE=app_db` (`assertIngestionTarget` reused, never bypassed) |
| live identity | `current_user=nihongo` / `current_database()=app_db` (smoke-verified) |
| baseline | `kanji_entries` = 13,108 (13,063 `upstream:kanjidic2:2023-08` + 33 mindtree + 12 corpus); `dictionary_entries` = 206,747 (206,717 `upstream:jmdict:2023-08` + 30 first-party); 箸 = `kj-hashi`/14/`first-party:kanji-mindtree:v1`; 道 = `kanji-road`/`first-party:kanji-corpus:v1` |
| final state | **identical** — kanji digest `4e2b27a3249661c87241fd3637160ae7`, dictionary digest `42907c1d35e1151d64dd57cdef1eddab` (= 14.4C baseline), unchanged before/after every engine phase |

## 4. Execution

| Phase | Result |
| :--- | :--- |
| **Run 1** | Controlled ingestion published attachment state via staged fail-closed swap. Attached **6,413** / `KANJIVG_EXTRA` **286** / `KANJIVG_MISSING` **6,695** (= independently derived classification); variants preserved **4,959**; deterministic digest `9efc4daea923157bf69ee0c004c50fc4e6662e4ba7f54df6c003cf417b31814d`. Zero DB writes (before/after digests equal). |
| **rollback (forced mid-run)** | Failure injected after staged asset writes began → staging discarded, no partial asset state, no orphans, 14.4C baseline intact (13,108 / 206,747 / 45 first-party / 箸=14). |
| **from-baseline rollback** | From a known valid published state → forced failure → previous state survives **byte-for-byte** (state digest preserved). |
| **refusal suite** | All refusals fire before unsafe canonical mutation: unclassified / production-classified / mismatched-DB targets (`assertIngestionTarget`), invalid source provenance (`first-party:kanji-corpus:v1`, `upstream:kanjivg:2024-04`, versions `2024-09`/`2025-01`), wrong archive (SHA/size/unreadable), wrong index, malformed source identity, duplicate stroke identity, malformed stroke identity. (Wrong tag/commit/license/duplicate-character/structure refusals covered by the 14/14 acquisition gates.) |
| **Run 2 (idempotency)** | 0 inserts / 0 updates / 0 duplicates / 0 drift — state **byte-identical** to Run 1; digest equal. |
| **independent verifier** | **PASS** — recomputed source identity, archive/index digests, corpus counts, asset identities, stroke ordering/identity, component identity, provenance, KANJIDIC2 immutability, first-party preservation, classification omissions/extras, and the deterministic digest via its own constants + own extraction + own canonical serialization (no implementation imports). |
| **coverage reconciliation** | Fresh run reproduces: matched **6,413** / missing **6,695** / extra **286** / stroke matches **6,329** / stroke discrepancies **84** (= 6,413 compared). The obsolete phantom `6,416` is gone (reconcile template now fully computed). |

### Attachment-layer evidence note (109 vs 84 discrepancy sets)

The attachment state records stroke-count evidence against the **standard glyph**
per §9 (variants are alternate assets): 6,304 match + **109** discrepancies. The
established reconciliation evidence (preserved unchanged in the STROKE report)
compares the index-order first file: 6,329 + **84**. Empirically: 52 characters
are discrepant under both selections, 57 standard-only, 32 first-file-only
(4,076 matched characters have variants). Both sets are evidence only — in every
case `kanji_entries.stroke_count` (KANJIDIC2) is preserved. 箸 is discrepant
under both (KANJIDIC2=14 vs KanjiVG=15), preserved in both.

## 5. Invariants

| Invariant | Result |
| :--- | :--- |
| KANJIDIC2 stroke count | **0 mutations** — 箸 = 14 (KanjiVG=15 recorded as evidence only); kanji row digest unchanged across all phases |
| first-party preservation | **0 mutations** — 33 mindtree + 12 corpus; `kj-hashi`, `kanji-road` intact |
| provenance | **0 violations** — every asset `upstream:kanjivg:2024-08` / `r20240807`; `first-party:kanji-corpus:v1` never used; `upstream:kanjivg:2024-04` registered but unused; 0 `kanji_entries` rows created for KANJIVG_EXTRA |
| duplicate state | **0 duplicates** — 6,699 distinct asset identities; 13,108 distinct canonical IDs |
| coverage | matched 6,413 / missing 6,695 / extra 286 / variants 4,959 (independently derived) |
| stroke discrepancy count | established set 84 preserved; attachment evidence 109 (see note above) |
| deterministic identity | strokes `kvg:${hex}-s${n}`, assets `kanjivg:${character}`; no timestamps/UUIDs; repeated execution converges |

## 6. Tests

| Suite | Result |
| :--- | :--- |
| `tests/kanjivg-etl.test.ts` (unchanged) | **25/25** (test 24 digest `f3e937f093b4f1ea55da22ac5b3e61d333b193c0775eb195fed2121d9300fade` re-confirmed; test 25 zero-DB-mutation) |
| `tests/kanjivg-acquisition-gates.test.ts` | **14/14** |
| `tests/kanjivg-canonical-attachment-gates.test.ts` (new) | **13/13** (Run 1, §14 rollback, §15 from-baseline rollback, §16 refusals, §17 idempotency, §18 verifier, §22 audit) |
| `tests/kanjidic2-canonical-ingestion-gates.test.ts` | **12/12** |
| `tests/kanji-expansion.test.ts` | **5/5** |
| unit suites (provenance-foundation, provenance-quality-checks, kanjidic2-etl-foundation) | **78/78** |
| typecheck (`npx tsc --noEmit`) | **0 errors** |
| lint | **0 errors** (4 known pre-existing React-hooks warnings, unchanged) |

## 7. Safety

| Guarantee | Status |
| :--- | :--- |
| production writes | **0** (disposable PGlite `app_db`/`nihongo` only) |
| Supabase | untouched |
| Vercel | untouched |
| origin/main | untouched (`848c8b5…`) |
| schema migration | **none** — existing file-based asset model used (§7) |
| raw corpus / derived state committed | **none** (`data/kanjivg/`, `data/kanjivg-index.json`, `data/kanjivg-attachment*` gitignored) |

## 8. Git

Single bounded commit: `feat(etl): complete Phase 14.4D controlled KanjiVG
ingestion` on `arena/01a0de3a-nihingobridgeupgrade` only. No empty/report-only
commit; `913f0e6` never amended. Files: new ingestion engine + independent
verifier + canonical attachment gates; reconcile template phantom-count fix;
regenerated coverage/stroke reports; `.gitignore` derived-state rules; this
report.

---

## Closure Decision

**PHASE 14.4D — CLOSED GREEN**

Every mandatory gate passed: source identity re-verified, disposable-target
classification enforced, 14.4C baseline preserved byte-for-byte, controlled
ingestion executed with staged fail-closed publish, forced rollback proven,
from-baseline rollback proven, full refusal suite fail-closed, Run 2 idempotent
with identical digest, independent verifier PASS, KANJIDIC2 stroke authority
preserved, first-party rows preserved, provenance clean, coverage independently
re-derived (6,413), tests 25/25 + 14/14 + 13/13 + 12/12 + 5/5 + 78/78,
typecheck/lint clean.

Per the hard boundary: execution STOPs here. Phase 14.4E and all later work
require a separate authorization.
