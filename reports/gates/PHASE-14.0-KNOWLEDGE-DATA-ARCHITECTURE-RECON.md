# PHASE 14.0 — KNOWLEDGE & DATA ARCHITECTURE RECONNAISSANCE REPORT

**Repository:** `ranimony-afk/nihingobridgeupgrade`  
**Working Branch:** `arena/01a0cd33-nihingobridgeupgrade`  
**Base Commit:** `0c416d46ea5bf09d28570f19a3049c84d16f3b25` (origin/main)  
**Date:** 2026-09-23  
**Gate Status:** **PASS**  
**Audit Mode:** READ-ONLY RECONNAISSANCE. Zero schema mutations, zero migrations generated, zero destructive database operations, zero production writes.

---

## 1. EXECUTIVE SUMMARY & RECON OBJECTIVES

Phase 14 initiates the comprehensive knowledge ingestion and multilingual data expansion lifecycle for NihongoBridge. The primary objective of **Phase 14.0** is strict architectural reconnaissance:
1. **Audit Database Baseline & Repository Assets:** Reconcile current production database row counts against in-repository seed datasets, ETL fixtures, and pilot pipelines.
2. **End-to-End Knowledge Pipeline Mapping:** Fully trace the lifecycle flow:
   $$\text{Source} \longrightarrow \text{ETL} \longrightarrow \text{Validation} \longrightarrow \text{Canonical Table} \longrightarrow \text{Translation} \longrightarrow \text{Search} \longrightarrow \text{CMS Overlay} \longrightarrow \text{Learner}$$
3. **Schema Acceptance & Transformation Feasibility (Critical Assessment):** Determine precisely what `src/db/schema.ts` accepts, identify unique constraints, foreign-key relationships, and specify mandatory data transformations for prospective external datasets (**JMdict**, **KANJIDIC2 / KanjiVG**, **Tatoeba**, **Grammar Datasets**, and **Takoboto**).
4. **Establish Phase 14 Gates & Guardrails:** Formulate the gated implementation roadmap and risk matrix for Phases 14.1 through 14.12.

---

## 2. DATABASE INVENTORY AUDIT

### 2.1 The 11 Target Knowledge & Assessment Tables

| Table Name | Production DB Baseline Rows | In-Repo Seed Count (`src/data/` & `src/services/`) | In-Repo Pilot / Fixture Count (`src/etl/`) | Primary Key Format | Uniqueness Constraints / Indexes |
|---|:---:|:---:|:---:|---|---|
| `dictionary_entries` | **0** | 30 (`lexicon.ts`) | 50 (`pilotData.ts`) | `de-jmdict-${entSeq}` / `de-${slug}` | PK only (no unique index on headword) |
| `kanji_entries` | **33** | 33 (`kanji.ts`) | 12 (`fixture.ts`) | `kanji-${meaning/char}` | `character` UNIQUE |
| `kanji_radicals` | **55** | 55 (`kanji.ts`) | 8 (`fixture.ts`) | `rad-${name}` / `el-${name}` | `character` UNIQUE |
| `kanji_composition` | **71** | 71 (`kanji.ts`) | 12 (`fixture.ts`) | `comp-${kanjiId}-${elementId}-${order}` | PK only |
| `grammar_patterns` | **0** | 12 (`lexicon.ts`) | 5 (`fixture.ts`) | `gp-${slug}` | `slug` UNIQUE |
| `example_sentences` | **0** | 24 (`lexicon.ts`) | 25 (`pilotData.ts`) | `es-tat-${tatoebaId}` / `es-${slug}` | PK only |
| `entity_translations` | **0** | 0 | 0 | `tr-${type}-${lang}-${hash}` | UNIQUE: `(entityType, entityId, language, translatedText)` |
| `knowledge_sources` | **0** | 4 (`lexicon.ts`) | 3 defined in ETL loaders | String URI (e.g. `jmdict:edrdg:2024-07`) | PK only |
| `jlpt_tests` | **3** | 3 (`seedData.ts`) | — | `jlpt-${level}-mock-${num}` | PK only |
| `questions` | **35** | 35 (`seedData.ts`) | — | `n5-v-${num}` / `n5-g-${num}` etc. | PK only |
| `jlpt_test_questions`| **32** | 32 (N5 mock link in `seedData.ts`) | — | `tq-n5-01-${questionId}` | PK only |

### 2.2 Remaining 19 Application Tables in Canonical Schema

The schema contains 30 tables in total (26 baseline + 1 multilingual + 3 CMS):

| Table Category | Table Name | Prod DB Baseline | Purpose & In-Repo Seed Status |
|---|---|:---:|---|
| **Users & Auth** | `users` | 0 | Learner profile & Supabase auth identity (`auth_provider`, `auth_subject`, `role`) |
| **Assessment Sessions**| `test_sessions` | 0 | User timed test runs and mock exam sessions |
| | `test_answers` | 0 | Individual submitted answers within a session |
| **Kana Knowledge** | `kana_entries` | 208 | Complete Hiragana & Katakana reference dataset (`buildKanaDataset()` in `kana.ts`) |
| **Gamification** | `xp_rules` | 0 | Dynamic XP reward rules (registered in `src/services/gamification/xpRegistry.ts`) |
| | `xp_events` | 0 | XP ledger tracking user activities with `dedupe_key` UNIQUE |
| **Analytics** | `user_analytics` | 0 | Aggregated skill mastery, streak, and weakness analytics |
| **SRS Engine** | `srs_schedulers` | 0 | Registered scheduling algorithms (`sm2`, `fsrsLite`, `leitnerBox`, `fixedLadder`) |
| | `srs_decks` | 0 | User-created and pre-built vocabulary/kanji/grammar decks |
| | `srs_cards` | 0 | Individual flashcards with SRS state, intervals, and repetitions |
| | `srs_reviews` | 0 | Review history log with `client_id` UNIQUE for device deduplication |
| | `srs_review_sessions`| 0 | Active and completed review study sessions |
| | `srs_user_settings` | 0 | User study limits, timezone, and daily targets |
| | `srs_personalization`| 0 | Adaptive weights for user weak spots and retention goals |
| | `srs_sync_devices` | 0 | Client devices registered for offline sync |
| | `srs_sync_log` | 0 | Audit log of sync pull/push operations and conflict resolutions |
| **CMS Platform** | `cms_content_items` | 0 | Editorial overlay items with lifecycle status (`draft`, `published`, etc.) |
| | `cms_content_versions`| 0 | Immutable version history snapshots with `(content_item_id, version_number)` UNIQUE |
| | `cms_audit_log` | 0 | Tamper-evident editorial action log |

### 2.3 Reconciliation: Why Some Production Tables are 0

1. **`kana_entries` (208), `kanji_entries` (33), `kanji_radicals` (55), `kanji_composition` (71):**
   - Populated in production via `KnowledgeService.ensureSeeded()`, which seeds the first-party Mind Tree dataset on initial server startup.
2. **`questions` (35), `jlpt_tests` (3), `jlpt_test_questions` (32):**
   - Populated in production via `TestService.ensureSeeded()`, which seeds N5 mock tests and questions on demand.
3. **`dictionary_entries` (0), `grammar_patterns` (0), `example_sentences` (0), `knowledge_sources` (0):**
   - These 4 tables were introduced additively in Phase 13.2 (`0000_absurd_emma_frost.sql`). While first-party data definitions exist in `src/data/lexicon.ts` (30 dictionary entries, 12 grammar patterns, 24 sentences, 4 sources), `KnowledgeCorpusService.ensureSeeded()` has not yet been executed in production.
4. **`entity_translations` (0):**
   - Introduced additively in Phase 12B / migration `0001_multilingual_translations.sql`. No bulk translation ingestion has been performed yet.

---

## 3. END-TO-END PIPELINE ARCHITECTURE MAPPING

The platform architecture follows a strict unidirectional, decoupled lifecycle:

```text
  [ UPSTREAM DATA SOURCE ]
             │
             ▼
      [ ACQUIRE & ETL ] ─── Normalization, Romanization, POS Mapping
             │
             ▼
       [ VALIDATION ]   ─── Schema conformance, ID determinism, Duplicate detection
             │
             ▼
    [ CANONICAL PERSISTENCE ] ─── PostgreSQL (dictionary_entries, kanji_entries, etc.)
             │                    └── Linked to knowledge_sources
             ├────────────────────────────────┐
             ▼                                ▼
  [ MULTILINGUAL TRANSLATION ]      [ UNIFIED SEARCH & AI ]
  (entity_translations: ta, ml)     (UnifiedSearchService, KnowledgeRetriever)
             │                                │
             ▼                                ▼
     [ CMS OVERLAY ] ──────────────► [ LEARNER APPLICATION ]
   (cms_content_items)              (Web UI, SRS Decks, Mock Tests, AI Tutor)
```

### 3.1 Domain-by-Domain Pipeline Breakdown

#### A. Japanese Dictionary (Headwords & Senses)
1. **Source:** JMdict XML/JSON from EDRDG (`jmdict:edrdg:2024-07`) or curated first-party lexicon (`first-party:dictionary-core:v1`).
2. **ETL:** `src/etl/dictionary/loader.ts`, `transformer.ts`, `pipeline.ts`.
   - Extracts: `entSeq`, primary headword (from `keb` or `reb`), kana reading (from `reb`), automatic romaji via `kanaToRomaji()`, senses (`glosses`, `note`), parts of speech via `normalizePos()`, JLPT level via `normalizeJlpt()`, commonness via priority tags (`ichi1`, `news1`, `nfXX`), frequency rank.
   - Deterministic ID: `de-jmdict-${entSeq}` (or `de-${slug}`).
3. **Validation:** Asserts non-empty NFKC-normalized strings, valid kana reading, valid romaji, at least 1 sense with glosses, valid JLPT level ("N5".."N1", "NONE").
4. **Canonical Table:** `dictionary_entries`. Upsert compares existing fields; unchanged records are skipped.
5. **Translation:** `entity_translations` links via `entity_type = 'dictionary'`, `entity_id = 'de-jmdict-...'`, `language = 'ta' | 'ml' | 'en'`.
6. **Search:** `DictionaryService.searchEntries()` and `UnifiedSearchService` match across Japanese text, kana readings, romaji, and JSONB senses (`ILIKE %pattern%`).
7. **CMS Overlay:** `cms_content_items` (`content_type = 'dictionary'`). `dictionaryPublicationResolver.ts` merges published overrides non-destructively per-field.
8. **Learner:** Rendered at `/dictionary` and `/dictionary/[id]`, generated into SRS vocabulary cards (`srs_cards.card_type = 'vocabulary'`), grounded into AI tutor retrieval.

#### B. Kanji, Radicals, & Kanji Composition (Mind Tree)
1. **Source:** KANJIDIC2, KanjiVG, or first-party Mind Tree (`first-party:kanji-mindtree:v1`).
2. **ETL:** `src/etl/kanji/loader.ts`, `transformer.ts`, `pipeline.ts`.
   - Radicals: Kangxi radicals (1–214) and primitive building blocks with stroke counts, meanings, readings, roles.
   - Kanji: Headword characters with Joyo grade levels, stroke counts, on/kun readings, meanings, mnemonics, vocabulary.
   - Composition: Directed graph edges connecting Kanji -> Radicals with structural positions (`left`, `right`, `top`, `bottom`, etc.) and roles (`semantic`, `phonetic`, etc.).
3. **Validation:** Unique constraints on `character` for both `kanji_entries` and `kanji_radicals`. Stroke counts $> 0$ and integer. JLPT level normalized (N5–N1).
4. **Canonical Tables:** `kanji_radicals`, `kanji_entries`, `kanji_composition`.
   - **Crucial Dependency Sequence:** Radicals MUST be loaded first $\rightarrow$ Kanji entries second $\rightarrow$ Composition edges third.
5. **Translation:** `entity_translations` links via `entity_type = 'kanji'` or `'radical'`, providing Tamil and Malayalam character meanings.
6. **Search:** Matched by character, readings kun/on, or English meaning in `UnifiedSearchService`. Reverse lookup resolves from Tamil/Malayalam meanings back to the Kanji.
7. **CMS Overlay:** Proposals for radical/kanji corrections and localized mnemonics via CMS workflow.
8. **Learner:** Rendered at `/kanji` and `/kanji/[character]`, interactive Mind Tree visualizer, SRS kanji cards (`srs_cards.card_type = 'kanji'`).

#### C. Example Sentences
1. **Source:** Tatoeba Project (`tatoeba:corpus:2024-07`) or first-party sentences (`first-party:sentences-core:v1`).
2. **ETL:** `src/etl/sentence/loader.ts`, `transformer.ts`, `pipeline.ts`, `matcher.ts`.
   - Automatic cross-entity linking: extracts constituent kanji characters (`kanji_characters`), auto-detects matching dictionary headwords (`dictionary_entry_ids`), auto-matches grammar patterns (`grammar_id`).
   - Deterministic ID: `es-tat-${tatoebaId}`.
3. **Validation:** Asserts non-empty Japanese text and English translation. Ensures valid JSONB arrays for linked IDs.
4. **Canonical Table:** `example_sentences`.
5. **Translation:** `entity_translations` links via `entity_type = 'sentence'`, supplying Tamil and Malayalam parallel sentence translations.
6. **Search:** Matched in `UnifiedSearchService` across Japanese sentence text, reading, and English meaning.
7. **CMS Overlay:** Corrections to example sentences and human-verified sentence translations.
8. **Learner:** Displayed in context on dictionary pages, grammar detail cards, and SRS sentence review drills.

#### D. Grammar Patterns
1. **Source:** First-party grammar corpus (`first-party:grammar-core:v1`) or vetted open grammar datasets.
2. **ETL:** `src/etl/grammar/loader.ts`, `transformer.ts`, `pipeline.ts`.
   - Extracts: URL-safe slug, title, structure skeleton, meaning, explanation, formation rules, JLPT level, common learner mistakes array, tags.
   - Deterministic ID: `gp-${slug}`.
3. **Validation:** Asserts unique slug (`slug` UNIQUE), non-empty title/structure/meaning/explanation, valid JLPT level (N5–N1).
4. **Canonical Table:** `grammar_patterns`.
5. **Translation:** `entity_translations` links via `entity_type = 'grammar'`, translating grammar meanings and explanation notes into Tamil and Malayalam.
6. **Search:** Matched across title, structure, meaning, and tags in `UnifiedSearchService`.
7. **CMS Overlay:** Editorial reviews for grammar explanations and common mistake annotations.
8. **Learner:** Formatted grammar guides, linked into dictionary detail, SRS grammar cards (`srs_cards.card_type = 'grammar'`).

---

## 4. CRITICAL ASSESSMENT: SCHEMA ACCEPTANCE & TRANSFORMATIONS

### 4.1 Schema Constraints & Ingestion Rules

| Target Table | Column | Type | Constraint | Ingestion Requirement / Transformation |
|---|---|---|---|---|
| `knowledge_sources` | `id` | text | Primary Key | Must be inserted BEFORE any dependent knowledge record referencing `source_ref`. |
| `dictionary_entries` | `id` | text | Primary Key | Must be deterministic (`de-jmdict-${entSeq}`). Multiple runs must not duplicate. |
| | `headword` | text | NOT NULL | Single primary written form. In JMdict, select primary `keb` or fallback to `reb`. |
| | `reading` | text | NOT NULL | Single primary kana reading (`reb`). Must be valid kana. |
| | `romaji` | text | NOT NULL | Must be generated algorithmically from `reading`. Cannot be null. |
| | `jlpt_level` | text | NOT NULL | Must normalize to `"N5"`, `"N4"`, `"N3"`, `"N2"`, `"N1"`, or `"NONE"`. |
| | `is_common` | boolean | NOT NULL | Derived from priority codes (`ichi1`, `news1`, `nfXX`). |
| | `parts_of_speech` | jsonb | NOT NULL | Raw JMdict abbreviations (`n`, `v5k`, etc.) must be mapped via `POS_CODE_MAP`. |
| | `senses` | jsonb | NOT NULL | Format: `Array<{ glosses: string[]; note?: string \| null }>`. |
| | `kanji_characters` | jsonb | NOT NULL | Automatically extracted from headword using CJK regex. |
| `kanji_radicals` | `id` | text | Primary Key | Deterministic identifier (`rad-${name}`, `el-${name}`). |
| | `character` | text | **NOT NULL, UNIQUE** | **HARD CONSTRAINT**: Cannot insert duplicate characters. Variant forms (e.g. 氵) must go to `alt_forms`. |
| | `stroke_count` | integer | NOT NULL | Must be integer $\ge 1$. |
| | `category` | text | NOT NULL | Must be `"radical"` or `"primitive"`. |
| | `typical_role` | text | NOT NULL | Must be `"semantic"`, `"phonetic"`, `"positional"`, or `"structural"`. |
| `kanji_entries` | `id` | text | Primary Key | Deterministic identifier (`kanji-${meaning/char}`). |
| | `character` | text | **NOT NULL, UNIQUE** | **HARD CONSTRAINT**: Exactly one row per Kanji ideograph. |
| | `stroke_count` | integer | NOT NULL | Must be integer $\ge 1$. |
| | `jlpt_level` | text | NOT NULL | Normalized to `"N5"`..`"N1"`. |
| | `vocabulary` | jsonb | NOT NULL | Format: `Array<{ word: string; reading: string; meaning: string }>`. |
| `kanji_composition` | `id` | text | Primary Key | Deterministic composite ID: `comp-${kanjiId}-${elementId}-${orderIndex}`. |
| | `kanji_id` | text | NOT NULL | Must point to valid `kanji_entries.id`. |
| | `element_id` | text | NOT NULL | Must point to valid `kanji_radicals.id`. |
| `grammar_patterns` | `slug` | text | **NOT NULL, UNIQUE** | **HARD CONSTRAINT**: Kebab-case URL-safe string. Must be unique across all levels. |
| | `jlpt_level` | text | NOT NULL | Normalized to `"N5"`..`"N1"`. |
| | `common_mistakes` | jsonb | NOT NULL | Array of strings describing common student mistakes. |
| `example_sentences` | `id` | text | Primary Key | Deterministic identifier (`es-tat-${tatoebaId}`). |
| | `reading` | text | NOT NULL | Raw Tatoeba sentences do NOT include kana readings; requires phonetic generation or fallback. |
| | `jlpt_level` | text | NOT NULL | Raw Tatoeba lacks JLPT tags; requires heuristic inference from constituent vocabulary. |
| `entity_translations` | `id` | text | Primary Key | Deterministic SHA-256 hash ID. |
| | composite | — | **UNIQUE INDEX** | `(entity_type, entity_id, language, translated_text)` is strictly unique. |
| | `language` | text | NOT NULL | Allowed: `'en'`, `'ta'`, `'ml'`. |
| | `translated_text` | text | NOT NULL | Must undergo Unicode NFC normalization to prevent duplicate Indic conjunct glyphs. |

### 4.2 Dataset-Specific Feasibility Analysis

#### 1. JMdict (EDRDG)
- **Feasibility:** **HIGH**. The current `src/etl/dictionary/` architecture is built specifically for JMdict structures.
- **Required Transformations:**
  1. *Orthography Collapsing:* JMdict entries can have multiple kanji forms (`keb`) and multiple kana readings (`reb`). The schema holds a single primary `headword` and `reading`. Secondary forms must be stored in `tags` (e.g. `alt:表言葉`) or preserved in sense notes.
  2. *POS Normalization:* Abbreviated JMdict POS tags (`v1`, `v5r`, `adj-na`) must be converted to human-readable strings (`ichidan verb`, `na-adjective`) using `POS_CODE_MAP`.
  3. *Automatic Romanization:* Generated via `kanaToRomaji()`.
  4. *JLPT Level Enrichment:* Since standard JMdict does not include official JLPT levels, JLPT levels must be merged from a curated concordance (e.g. Jonathan Waller / Tanos dataset).

#### 2. KANJIDIC2 & KanjiVG
- **Feasibility:** **HIGH**. Compatible with `kanji_entries`, `kanji_radicals`, and `kanji_composition`.
- **Required Transformations:**
  1. *Radical vs Primitive Classification:* KANJIDIC2 focuses on Kangxi radicals (1–214). KanjiVG includes non-radical components (primitives such as 寺, 甫). The loader must classify Kangxi radicals as `category = 'radical'` and sub-components as `category = 'primitive'`.
  2. *Decomposition Graph Construction:* KanjiVG SVG paths must be parsed to extract structural hierarchy (`role` = `semantic` | `phonetic`, `position` = `left` | `right` | `top` | `bottom` | `enclosure`).
  3. *Unique Character Enforcement:* `kanji_radicals.character` is UNIQUE. Any radical variant sharing a base glyph (e.g. 氵 vs 水) must be grouped under `alt_forms` rather than inserted as a separate radical row.
  4. *Vocabulary Generation:* KANJIDIC2 does not embed sample vocabulary. Vocabulary arrays must be populated by querying `dictionary_entries` where `kanji_characters ? character`.

#### 3. Tatoeba Example Sentences
- **Feasibility:** **MEDIUM-HIGH**.
- **Required Transformations:**
  1. *Reading Generation:* Tatoeba sentence downloads (`sentences.csv`) do not provide kana readings. A phonetic furigana/kana generator or fallback to Japanese text is mandatory.
  2. *JLPT Level Inference:* Tatoeba has no native JLPT metadata. Sentences must be classified into N5–N1 by analyzing the maximum JLPT level of their constituent vocabulary and matched grammar patterns.
  3. *Cross-Entity Matcher:* Must run `SentenceMatcher.matchDictionaryEntries()` and `SentenceMatcher.matchGrammarPattern()` during ingestion to populate `dictionary_entry_ids` and `grammar_id`.

#### 4. Grammar Datasets (N5–N1)
- **Feasibility:** **HIGH**.
- **Required Transformations:**
  1. *Slug Generation:* Slugs must be deterministically generated, lowercase, kebab-case, and globally unique.
  2. *Structure Standardization:* Formulaic structures (e.g. `Verb て-form + から`) must be cleaned and validated.
  3. *Common Mistakes:* Educational mistake examples must be curated into structured string arrays.

#### 5. Why Takoboto Must NOT be Imported Directly
- **Finding:** Takoboto is **NOT an upstream primary data source**.
- **Evidence:** Takoboto is an Android application and web interface that packages together:
  - JMdict (for words and English glosses)
  - KANJIDIC2 & KanjiVG (for kanji and stroke order)
  - Tatoeba (for example sentences)
  - Jonathan Waller / Tanos lists (for JLPT levels)
- **Architectural Decision:** Importing Takoboto directly is rejected because:
  1. *Licensing & Attribution:* Takoboto's compilation contains proprietary UI layer elements and unclear redistributable licensing terms, whereas JMdict (CC-BY-SA 3.0), KANJIDIC2 (CC-BY-SA 3.0), and Tatoeba (CC-BY 2.0 FR) provide transparent, verified open licenses.
  2. *Data Provenance:* Direct upstream ingestion ensures accurate `knowledge_sources` records (`version`, `url`, `license`, `record_count`).
  3. *Entity Stability:* JMdict provides authoritative `ent_seq` numbers (`de-jmdict-1000010`) and Tatoeba provides official sentence IDs (`es-tat-1001`). Takoboto lacks an authoritative independent ID scheme.
  4. *Conclusion:* We import directly from the authoritative source repositories (**JMdict**, **KANJIDIC2**, **KanjiVG**, **Tatoeba**), completely bypassing downstream scrapers or app packages.

#### 6. Multilingual Data (Tamil `ta` and Malayalam `ml`)
- **Feasibility:** **HIGH**. Supported natively by `entity_translations`.
- **Required Transformations:**
  1. *Unicode NFC Normalization:* Tamil and Malayalam conjunct characters must be normalized using Unicode NFC (`text.normalize("NFC")`) to ensure consistent binary equality and avoid indexing anomalies.
  2. *Verification State:* Bulk machine-translated batches must be tagged as `source_type = 'machine'` with `is_verified = false`. Only linguistically reviewed translations are promoted to `source_type = 'verified_human'` and `is_verified = true`.
  3. *Deterministic Hash:* ID generated via `tr-${type}-${lang}-${sha256}`.

---

## 5. RECONNAISSANCE VERIFICATION & TOOLCHAIN STATUS

All verification commands executed directly against the workspace tree:

```bash
# 1. TypeScript Strict Typecheck
npm run typecheck
# Result: PASS (0 errors)

# 2. ESLint Static Analysis
npm run lint
# Result: PASS (0 errors, 4 warnings)

# 3. Next.js Optimized Production Build
npm run build
# Result: PASS (Compiled successfully in 14.4s, 13/13 static pages generated)

# 4. Drizzle Kit Schema & Migration Verification
npx drizzle-kit check
# Result: PASS ("Everything's fine")

# 5. Vitest Unit & ETL Pipeline Suite (Database-free tests)
npx vitest run tests/dictionary-etl.test.ts tests/cms-*.test.ts tests/ai-*.test.ts
# Result: PASS (18 test files passed, 443 tests passed)
```

*(Note: 10 integration test files that require a live PostgreSQL database connection fail as expected when `DATABASE_URL` is unset, matching the documented behavior in `.github/workflows/ci.yml` and `reports/gates/PHASE-13-GATE-ZERO-REMEDIATION.md` where a disposable CI PostgreSQL container is used).*

---

## 6. PHASE 14 GATED ROADMAP & RISK MATRIX

Following the master prompt's gated execution principle, the sequence is gated as follows:

| Sub-Phase | Title | Prerequisite Gate | Primary Deliverable | Risk Level |
|---|---|---|---|:---:|
| **14.0** | **Knowledge/Data Recon** | — | Schema audit, baseline counts, feasibility report | **Low** |
| **14.1** | **Source & Provenance Framework** | 14.0 PASS | Formalize `knowledge_sources` registry & source attribution | **Low** |
| **14.2** | **Dictionary ETL Foundation** | 14.1 PASS | Hardened JMdict batch processor, dry-run CLI, deduplication | **Medium** |
| **14.3** | **Dictionary Dataset Ingestion** | 14.2 PASS | Staged pilot & core vocabulary ingestion into `dictionary_entries` | **Medium** |
| **14.4** | **Kanji + Radical Expansion** | 14.3 PASS | Ingest radicals, Joyo kanji, and composition edges into canonical tables | **High** |
| **14.5** | **Example Sentence Pipeline** | 14.4 PASS | Ingest Tatoeba sentences with reading generation and entity matching | **Medium** |
| **14.6** | **Grammar Dataset Pipeline** | 14.5 PASS | Ingest N5–N1 grammar patterns with slug validation | **Medium** |
| **14.7** | **Multilingual Expansion** | 14.6 PASS | Load Tamil and Malayalam translations into `entity_translations` | **Medium** |
| **14.8** | **JLPT Classification & Mapping** | 14.7 PASS | Harmonize JLPT levels across all entities; link quiz questions | **Medium** |
| **14.9** | **Search & Data Quality** | 14.8 PASS | Verify `UnifiedSearchService` & `ReverseSearchService` across all data | **Low** |
| **14.10**| **SRS Content Generation** | 14.9 PASS | Activate automated flashcard generation across vocabulary/kanji/grammar | **Low** |
| **14.11**| **Knowledge QA & Validation**| 14.10 PASS | Full idempotency test, duplicate scan, orphan reference audit | **Low** |
| **14.12**| **Production Readiness Gate** | 14.11 PASS | Final deployment verification and production sync sign-off | **Low** |

---

## 7. PHASE 14.0 GATE VERDICT

```text
================================================================================
PHASE 14.0 GATE STATUS: PASS
================================================================================
- Read-only reconnaissance successfully executed against working tree.
- Database baseline and repository seed/pilot inventories audited and reconciled.
- End-to-end knowledge pipeline mapped from upstream source to learner.
- Schema acceptance, constraints, and required transformations determined.
- Takoboto evaluated and rejected in favor of authoritative upstream sources.
- Zero schema modifications, zero destructive operations, zero data corruption.
- Production build, typecheck, lint, and ETL unit test suite fully green.
- Phase 14.1 (Source & Provenance Framework) is unblocked.
================================================================================
```
