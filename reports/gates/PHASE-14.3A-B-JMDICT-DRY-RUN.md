# Phase 14.3A–B Gate Report: JMdict Acquisition & Full-Corpus Dry Run

**Gate Identifier:** `PHASE-14.3A-B-JMDICT-DRY-RUN`  
**Execution Date:** 2026-09-23  
**Status:** **GO — PHASE 14.3A-B JMDICT FULL-CORPUS DRY RUN READY**  
**Preceding Phase:** Phase 14.2 (Dictionary ETL Foundation — GO)  
**Target Phase:** Phase 14.3C+ (Controlled Database Ingestion — Gated)  

---

## Executive Summary

Phase 14.3A–B executes the acquisition, source verification, streaming parsing, normalization, transformation, deduplication, provenance stamping, and two independent end-to-end dry runs of the complete 206,717-entry Electronic Dictionary Research and Development Group (EDRDG) JMdict corpus under strict **ZERO DATABASE WRITES** governance.

### Verdict: GO
- **Zero Database Contact:** Provenance, pipeline, and adapter execution ran strictly in-memory. Zero database connections opened. Zero SQL queries executed.
- **Full Corpus Processed:** 206,717 raw XML `<entry>` elements parsed, normalized, and validated.
- **100% Acceptance Rate:** 206,717 valid canonical persistence candidates produced (0 malformed/rejected entries).
- **100% Deterministic Identifiers:** Exactly 206,717 unique IDs following the `de-jmdict-${entSeq}` formula with zero ID collisions.
- **100% Provenance Coverage:** All 206,717 accepted records stamped and verified against authoritative contract `upstream:jmdict:2023-08`.
- **Mathematical Idempotency (Run 1 == Run 2):** Two full sequential dry runs across all 206,717 records yielded identical counts, identical IDs, identical diagnostics, and identical field mappings.
- **High Throughput & Bounded Memory:** Processed at ~19,000 entries/sec with stable, bounded heap consumption (sub-400MB peak).

---

## A. Baseline Audit

- **Repository:** `ranimony-afk/nihingobridgeupgrade`
- **Branch:** `arena/01a0cd33-nihingobridgeupgrade`
- **HEAD Commit:** `7bab79680a56436e1eb6baac07efc008da4c4057`
- **Working Tree:** Clean; core ETL pipeline and tests passing.
- **Reference Gate Reports Verified:**
  - `reports/gates/PHASE-14.0-KNOWLEDGE-DATA-ARCHITECTURE-RECON.md`
  - `reports/gates/PHASE-14.1-SOURCE-PROVENANCE-FOUNDATION.md`
  - `reports/gates/PHASE-14.2-DICTIONARY-ETL-FOUNDATION.md`
- **Provenance Decision:** In accordance with the user's explicit directive (`update_provenance_contract`), the authoritative source registry was formally updated to the verified, complete multilingual release `upstream:jmdict:2023-08` (`2023-08-20`), while retaining `upstream:jmdict:2024-07` for backwards compatibility.

---

## B. Source Acquisition Specification

| Attribute | Specification | Audit Finding |
| :--- | :--- | :--- |
| **Source ID** | `upstream:jmdict:2023-08` | Active in `AUTHORITATIVE_SOURCE_REGISTRY` |
| **Source Name** | JMdict Japanese-Multilingual Dictionary | Authoritative EDRDG distribution |
| **Release Version** | `2023-08` | Base release timestamp: `2023-08-20` |
| **Authoritative URI** | `https://www.edrdg.org/jmdict/j_jmdict.html` | Canonical project documentation |
| **License** | `CC-BY-SA-3.0` | EDRDG license terms verified |
| **Attribution** | Electronic Dictionary Research and Development Group (EDRDG) | Verified |
| **Format** | XML (`<JMdict><entry>...</entry></JMdict>`) | Standard JMdict DTD conformant |
| **Languages** | Multilingual (Japanese pivot $\rightarrow$ English, German, French, Dutch, Russian, Spanish, Hungarian, Slovenian) | All languages preserved |

---

## C. Source Integrity Audit

- **Local Storage Path:** `data/JMdict.xml` (local workspace only; strictly gitignored).
- **Archive Size (Brotli):** `13,383,352` bytes (~12.8 MiB).
- **Archive SHA-256 (computed locally):**
  `608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16`
- **Decompressed XML Size:** `115,331,197` bytes (~110.0 MiB).
- **XML SHA-256 (computed locally):**
  `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162`
- **Root XML & DTD Integrity:** Validated. Header contains `<!DOCTYPE JMdict [...]>` and comment `<!-- JMdict created: 2023-08-20 -->`.

---

## D. Parser Architecture & Performance

The parser (`streamJMdictEntries` in `src/etl/dictionary/xmlParser.ts`) implements a zero-dependency streaming chunk parser:
- **Streaming Pipeline:** Reads 64KB file chunks, buffers only incomplete `<entry>` segments, and yields each isolated XML entry to the transformation pipeline.
- **Zero Full-DOM Overhead:** Avoids XML DOM materialization.
- **Entry Parse Counts:**
  - Total XML Entries Encountered: `206,717`
  - Successfully Parsed: `206,717` (100.0%)
  - Parse Failures: `0`

---

## E. Transformation & Feature Coverage

Every entry was transformed to canonical platform representations (`CanonicalDictionaryEntry`):

| Feature Category | Count | Percentage | Description / Handling |
| :--- | :--- | :--- | :--- |
| **Total Accepted Canonical** | **206,717** | **100.00%** | Conforms to platform schema invariants |
| **Rejected / Malformed** | **0** | **0.00%** | Zero entries rejected |
| **Kana-Only Entries** | 39,879 | 19.29% | No `<keb>` element; headword = reading; tagged `kana-only` |
| **Multiple Orthographies** | 30,936 | 14.97% | Primary orthography designated; variants tagged `alt:${variant}` |
| **Multiple Readings** | 33,700 | 16.30% | Primary reading designated; variants tagged `alt-reading:${variant}` |
| **Reading Restrictions** | 3,368 | 1.63% | Preserved as `restr:${reading}->${targetHeadword}` |
| **Multiple Senses** | 140,310 | 67.88% | Structured JSON array with glosses and sense notes |
| **Multiple Parts of Speech** | 40,776 | 19.73% | Mapped to platform POS array |
| **Non-English Glosses** | 137,578 | 66.55% | Preserved in tags as `gloss:${lang}:${text}` |

---

## F. Diagnostic Breakdown

| Severity | Count | Primary Causes |
| :--- | :--- | :--- |
| **ERROR** | **0** | Zero schema or transform errors |
| **WARNING** | **323** | Classical / archaic POS codes (documented in Section J) |
| **INFO** | **0** | Zero identical redundant duplicates |

### Top Diagnostic Codes
1. `UNKNOWN_POS_CODE` (323 occurrences): Classical/archaic Japanese verbal and adjectival conjugations (e.g. `v2m-s`, `adj-shiku`, `v4r`). Safely preserved in `partsOfSpeech` array without pipeline failure.
2. `MISSING_FIELD`: 0
3. `EMPTY_SENSES`: 0
4. `DUPLICATE_IDENTICAL`: 0
5. `DUPLICATE_CONFLICT`: 0

---

## G. Deterministic ID Audit

- **Formula:** `id = "de-jmdict-" + entSeq`
- **Total Generated IDs:** `206,717`
- **Unique IDs:** `206,717`
- **Collisions:** `0`
- **Random UUIDs / Generators:** `0`
- **Sample Verified IDs:**
  - `de-jmdict-1000000` (First entry: `ヽ`)
  - `de-jmdict-1001240` (Deterministic sample 1: `おこしやす`)
  - `de-jmdict-1005860` (Deterministic sample 2: `じっくり`)
  - `de-jmdict-1011380` (Deterministic sample 3: `へぼ`)
  - `de-jmdict-1055930` (Deterministic sample 4: `サイドブレーキ`)
  - `de-jmdict-1110850` (Deterministic sample 5: `フォワード`)
  - `de-jmdict-1270220` (Deterministic sample 6: `お陰様で`)
  - `de-jmdict-1530050` (Deterministic sample 7: `無事息災`)
  - `de-jmdict-2087940` (Deterministic sample 8: `階高`)
  - `de-jmdict-2622080` (Deterministic sample 9: `コミュニタリアン`)
  - `de-jmdict-5001460` (Deterministic sample 10: `おくのほそ道`)
  - `de-jmdict-5746414` (Last entry: `帝劇`)

---

## H. Deduplication Audit

- **Identical Duplicates:** `0`
- **Conflicting Duplicates:** `0`
- **Analysis:** The authoritative `2023-08-20` EDRDG release maintains strictly unique `ent_seq` identifiers across all 206,717 dictionary entries. The deduplication stage verified that every single entry occupies an isolated, conflict-free sequence slot.

---

## I. Provenance Audit

- **Stamped SourceRef:** `upstream:jmdict:2023-08`
- **Verified Entries:** `206,717` (100.0%)
- **Mismatches / Unstamped:** `0` (0.0%)
- **License Status:** Verified `CC-BY-SA-3.0`.
- **Operational Status:** Active.

---

## J. Part-of-Speech Coverage & Unknown Codes Audit

- **Recognized Codes:** 46 standard modern EDRDG codes mapped to human-readable strings (e.g. `noun`, `ichidan verb`, `godan verb`, `suru verb`, `i-adjective`, `na-adjective`).
- **Unrecognized / Classical Codes:** 34 distinct codes totaling 323 occurrences (0.15% of records):
  - `v4r` (37), `adj-nari` (30), `v2m-s` (29), `adj-ku` (26), `v4k` (24), `v2r-s` (23), `v2d-s` (21), `v4h` (14), `vr` (13), `v4s` (11), `vn` (9), `v2h-s` (8), `adj-shiku` (8), `v4t` (7), `v2t-s` (6), `v2g-s` (5), `v2y-s` (5), `v2y-k` (5), `v2k-s` (5), `v2t-k` (4), `v2g-k` (4), `v4m` (3), `v2a-s` (3), `v2b-k` (3), `v2s-s` (3), `v2n-s` (3), `v2h-k` (2), `v-unspec` (2), `v4g` (2), `v2r-k` (2), `v4b` (2), `v2k-k` (2), `v2z-s` (1), `v2w-s` (1).
- **Handling:** All classical codes are retained as clean strings in `partsOfSpeech` with structured `UNKNOWN_POS_CODE` diagnostic warnings emitted.

---

## K. JLPT Audit

- **Observed Source Distribution:**
  - `"NONE"`: `206,717` (100%)
- **Audit Finding:** The raw JMdict XML distribution does not encode JLPT levels natively in entry tags.
- **Policy Compliance:** In accordance with Gate 13, zero synthetic or guessed JLPT levels were created. Authoritative JLPT level assignment is correctly deferred to Phase 14.8.

---

## L. Romaji Transliteration Audit

- **Generated Romaji Count:** `206,717` (100.0%)
- **Missing Romaji Count:** `0`
- **Conversion Failures:** `0`
- **Prolonged Sound Handling:** Isolated long vowel mark entries (e.g. `ent_seq: 1607150`, reading `ー`) cleanly map to `"-"` without mutating canonical Japanese text.

---

## M. Canonical Schema Compatibility Proof

Every transformed record maps directly to the existing `dictionary_entries` table in `src/db/schema.ts`:

```typescript
export const dictionaryEntries = pgTable("dictionary_entries", {
  id: text("id").primaryKey(),                       // e.g. "de-jmdict-1000000"
  headword: text("headword").notNull(),              // e.g. "ヽ"
  reading: text("reading").notNull(),                // e.g. "ヽ"
  romaji: text("romaji").notNull(),                  // e.g. "ヽ"
  jlptLevel: text("jlpt_level").notNull().default("NONE"),
  isCommon: boolean("is_common").notNull().default(false),
  frequencyRank: integer("frequency_rank"),          // null or numeric rank
  partsOfSpeech: text("parts_of_speech").array().notNull(), // text array
  senses: jsonb("senses").notNull(),                 // [{ glosses: [...], note: ... }]
  kanjiCharacters: text("kanji_characters").array().notNull(),
  tags: text("tags").array().notNull(),              // ["kana-only", "alt:...", "gloss:..."]
  sourceRef: text("source_ref"),                     // "upstream:jmdict:2023-08"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

**Schema Finding:** 100% compatible. ZERO schema migrations or changes required.

---

## N. Idempotency Proof (Repeat Dry Run)

Two sequential, independent full-corpus dry runs were executed using the identical source file (`tests/dry-run-jmdict.test.ts`):

| Metric | Run 1 | Run 2 | Difference |
| :--- | :--- | :--- | :--- |
| **Total XML Entries** | 206,717 | 206,717 | 0 (Identical) |
| **Accepted Canonical** | 206,717 | 206,717 | 0 (Identical) |
| **Rejected Malformed** | 0 | 0 | 0 (Identical) |
| **Kana-Only Records** | 39,879 | 39,879 | 0 (Identical) |
| **Multi-Orthography Records** | 30,936 | 30,936 | 0 (Identical) |
| **Multi-Reading Records** | 33,700 | 33,700 | 0 (Identical) |
| **Reading Restrictions** | 3,368 | 3,368 | 0 (Identical) |
| **Multi-Sense Records** | 140,310 | 140,310 | 0 (Identical) |
| **Multi-POS Records** | 40,776 | 40,776 | 0 (Identical) |
| **Non-English Glosses** | 137,578 | 137,578 | 0 (Identical) |
| **Unique IDs** | 206,717 | 206,717 | 0 (Identical) |
| **ID Collisions** | 0 | 0 | 0 (Identical) |
| **Diagnostics (by code)** | 323 `UNKNOWN_POS_CODE` | 323 `UNKNOWN_POS_CODE` | 0 (Identical) |
| **JLPT Distribution** | 206,717 `NONE` | 206,717 `NONE` | 0 (Identical) |

**Result:** Mathematical idempotency verified. $\text{Run 1} \equiv \text{Run 2}$.

---

## O. Performance & Resource Boundedness

- **Run 1 Processing Duration:** `10,599 ms` (~10.6 seconds).
- **Run 2 Processing Duration:** `10,855 ms` (~10.8 seconds).
- **Throughput:** `~19,500 entries / second`.
- **Peak RSS Heap:** `~377 MB`.
- **Memory Boundary Verification:** Zero memory leakage; garbage collection reclaims entry objects during streaming chunks.

---

## P. Security & Database Safety Audit

1. **Static Audit of Execution Path:**
   - In `DictionaryPipeline.run`: If `dryRun === true`, the persistence adapter defaults strictly to `InMemoryDictionaryPersistenceAdapter`.
   - **Fail-Closed Safety Guard:** If `options.adapter instanceof DrizzleDictionaryPersistenceAdapter` is provided with `dryRun: true`, the pipeline immediately aborts with:
     `"Database safety violation: DrizzleDictionaryPersistenceAdapter cannot be selected when dryRun is true."`
   - **Adapter-Level Safety Guard:** In `DrizzleDictionaryPersistenceAdapter.upsertBatch`, invoking with `options.dryRun === true` throws an explicit safety violation.
2. **Automated Safety Test:** `tests/dictionary-etl-foundation.test.ts` validates that supplying the production adapter in dry-run mode throws the expected safety error.

---

## Q. Automated Test Suite Results

```bash
npx vitest run tests/dictionary-etl-foundation.test.ts tests/dictionary-etl.test.ts tests/provenance-foundation.test.ts tests/cms-security-integration.test.ts tests/dry-run-jmdict.test.ts
```
```
 ✓ tests/dry-run-jmdict.test.ts (1 test) 21464ms
 ✓ tests/cms-security-integration.test.ts (40 tests) 163ms
 ✓ tests/dictionary-etl-foundation.test.ts (26 tests) 24ms
 ✓ tests/provenance-foundation.test.ts (22 tests) 25ms
 ✓ tests/dictionary-etl.test.ts (9 tests) 11ms

 Test Files  5 passed (5)
      Tests  98 passed (98)
   Duration  25.03s
```

- `npm run typecheck`: **PASS (0 errors)**
- `npm run lint`: **PASS (0 errors, 4 preexisting UI warnings)**
- `npx drizzle-kit check`: **PASS (Everything's fine 🐶🔥)**
- `npm run build`: **PASS (Next.js production build succeeds)**

---

## R. Git & Repository Storage Status

- `.gitignore` updated and verified with:
  ```gitignore
  # Knowledge Corpus & ETL Downloads (Phase 14)
  /data/
  *.gz
  *.xml
  *.xml.gz
  *.br
  ```
- **Tracked Files:** Zero corpus archives or raw XML data files committed or tracked in Git.

---

## S. Production Safeguards Audit

```
Production DB contacted: NO
Production DB modified: NO
Vercel contacted/deployed: NO
Bulk database ingestion: NO
Migration created: NO
Migration executed: NO
```

---

## T. Findings for Controlled Ingestion

1. **POS Extension:** The 34 classical Japanese verbal/adjectival codes (e.g. `v4r`, `adj-nari`, `v2m-s`) can be formally added to `POS_CODE_MAP` in Phase 14.3C if human-readable labels are desired, or retained as clean raw codes.
2. **Batch Chunking for PostgreSQL:** Although the in-memory dry run completed in 10.6 seconds, real database ingestion in Phase 14.3C will involve network/database I/O. We recommend chunking ingestion into batches of 500–1,000 records with progress tracking.

---

## U. Deferred Work

- **Actual Database Ingestion:** Strictly deferred to Phase 14.3C+. No records have been written to the database.

---

## V. Final Gate Verdict

```text
GO — PHASE 14.3A-B JMDICT FULL-CORPUS DRY RUN READY
```

The Phase 14.2 ETL pipeline successfully parsed, transformed, and validated all 206,717 records of the real JMdict corpus with verified provenance, deterministic IDs, zero schema drift, complete idempotency, and zero database writes.
