# PHASE 14.1 — SOURCE & PROVENANCE FRAMEWORK GATE REPORT

**Repository:** `ranimony-afk/nihingobridgeupgrade`  
**Working Branch:** `arena/01a0cd33-nihingobridgeupgrade`  
**Base Commit:** `7bab79680a56436e1eb6baac07efc008da4c4057` (Phase 14.0 Recon)  
**Date:** 2026-09-23  
**Gate Status:** **GO — PHASE 14.1 SOURCE & PROVENANCE FOUNDATION READY**  

---

## A. BASELINE VERIFICATION

* **Branch:** `arena/01a0cd33-nihingobridgeupgrade`
* **HEAD:** `7bab796` — `docs(gate): phase 14.0 knowledge and data architecture recon`
* **Upstream Baseline:** `0c416d4` — `Merge pull request #8 from ranimony-afk/arena/01a0cc93-nihingobridgeupgrade`
* **Working Tree State:** Clean baseline before Phase 14.1; new provenance foundation files staged in tree.
* **Phase 14.0 Gate:** PASSED. Schema inventory and feasibility verified.

---

## B. EXISTING PROVENANCE ARCHITECTURE AUDIT

Before Phase 14.1, provenance was fragmented across individual domain loaders:
1. `src/etl/dictionary/loader.ts`: Inline `DictionaryLoader.ensureSource()` for `jmdict:edrdg:2024-07`.
2. `src/etl/kanji/loader.ts`: Inline `ensureKanjiSource()` for `first-party:kanji-corpus:v1`.
3. `src/etl/sentence/loader.ts`: Inline `SentenceLoader.ensureSource()` for `tatoeba:corpus:2024-07`.
4. `src/services/knowledge/corpusService.ts`: `KnowledgeCorpusService.ensureSources()` inserting 4 hardcoded first-party sources from `src/data/lexicon.ts`.
5. `src/services/ai/knowledgeRetriever.ts`: Looked up source records by matching `sourceRef` against `knowledge_sources.id`.
6. `src/db/schema.ts`: `source_ref` existed on 8 canonical/system tables as a soft reference without central contract validation.

---

## C. KNOWLEDGE_SOURCES SCHEMA ASSESSMENT

### Table Definition (`src/db/schema.ts`, lines 691–704):
```typescript
export const knowledgeSources = pgTable("knowledge_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  license: text("license").notNull(),
  url: text("url"),
  description: text("description").notNull(),
  domain: text("domain").notNull(),
  recordCount: integer("record_count").default(0).notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
});
```

### Assessment Findings:
* **Primary Key:** `id` (text) supports immutable release identifiers (`<type>:<namespace>:<version>`).
* **Attributes:** Directly captures Source Name, Version, License (SPDX/statement), Upstream URI (`url`), Scope/Description, Knowledge Domain, Ingested Record Count, and Acquisition Timestamp (`importedAt`).
* **Conclusion on Schema Changes:** **NONE REQUIRED**. The existing schema completely and safely accommodates the entire Phase 14 provenance contract without adding duplicate tables or altering database columns.

---

## D. PROVENANCE CONTRACT SPECIFICATION

The provenance contract is formalized in `src/services/knowledge/provenance/types.ts`:

1. **`id` (string, Primary Key):** Deterministic release identifier formatted as `<type>:<namespace>:<version>`.
2. **`type` (SourceType):** Controlled taxonomy:
   * `'upstream'`: Authoritative external datasets (e.g. EDRDG, Tatoeba, KanjiVG).
   * `'first_party'`: NihongoBridge-authored linguistic and curriculum data.
   * `'enrichment'`: Secondary mappings, concordances, and frequency rankings.
   * `'editorial'`: Peer-reviewed CMS editorial modifications and overrides.
3. **`name` (string):** Full canonical dataset title.
4. **`version` (string):** Release timestamp or semver (e.g. `"2024-07"`, `"v1"`).
5. **`releaseDate` (string | null):** ISO date (YYYY-MM-DD) of the upstream release.
6. **`uri` (string | null):** Canonical project home or distribution download URL.
7. **`license` (string):** Verified license identifier (e.g. `"CC-BY-SA-3.0"`, `"CC-BY-2.0-FR"`). Set to `"UNKNOWN"` or `"REVIEW_REQUIRED"` if unverified.
8. **`attribution` (string):** Formal legal attribution text required by license.
9. **`description` (string):** Educational scope and dataset contents.
10. **`domain` (SourceDomain):** `'dictionary' | 'kanji' | 'grammar' | 'sentence' | 'mixed'`.
11. **`status` (SourceStatus):** `'active' | 'requires_review' | 'deprecated' | 'experimental'`.
12. **`targetTables` (string[]):** Canonical target tables populated by this source.

---

## E. AUTHORITATIVE SOURCE REGISTRY

Established in `src/services/knowledge/provenance/registry.ts`:

| Source ID | Type | Version | License | Domain | Target Tables | Status |
|---|:---:|:---:|:---:|:---:|---|:---:|
| `upstream:jmdict:2024-07` | Upstream | 2024-07 | CC-BY-SA-4.0 | dictionary | `dictionary_entries` | **active** |
| `upstream:kanjidic2:2024-07` | Upstream | 2024-07 | CC-BY-SA-3.0 | kanji | `kanji_entries`, `kanji_radicals` | **active** |
| `upstream:kanjivg:2024-04` | Upstream | 2024-04 | CC-BY-SA-3.0 | kanji | `kanji_composition`, `kanji_radicals` | **active** |
| `upstream:tatoeba:2024-07` | Upstream | 2024-07 | CC-BY-2.0-FR | sentence | `example_sentences` | **active** |
| `first-party:kana:v1` | First-Party | v1 | Proprietary | mixed | `kana_entries` | **active** |
| `first-party:kanji-mindtree:v1` | First-Party | v1 | Proprietary | kanji | `kanji_entries`, `kanji_radicals`, `kanji_composition` | **active** |
| `first-party:dictionary-core:v1`| First-Party | v1 | Proprietary | dictionary | `dictionary_entries` | **active** |
| `first-party:grammar-core:v1` | First-Party | v1 | Proprietary | grammar | `grammar_patterns` | **active** |
| `first-party:sentences-core:v1` | First-Party | v1 | Proprietary | sentence | `example_sentences` | **active** |
| `first-party:jlpt-mock:v1` | First-Party | v1 | Proprietary | mixed | `questions`, `jlpt_tests`, `jlpt_test_questions` | **active** |
| `editorial:cms-review:v1` | Editorial | v1 | Work Product| mixed | `editorial_overlay` | **active** |
| `candidate:unverified-glosses:2024`| Enrichment| 2024 | **UNKNOWN** | dictionary | `dictionary_entries` | **requires_review** |

### Backward-Compatible Aliases:
* `jmdict:edrdg:2024-07` $\longrightarrow$ `upstream:jmdict:2024-07`
* `tatoeba:corpus:2024-07` $\longrightarrow$ `upstream:tatoeba:2024-07`
* `first-party:kanji-corpus:v1` $\longrightarrow$ `upstream:kanjidic2:2024-07`

---

## F. DETERMINISTIC IDENTIFIER CONTRACT

1. **Dictionary Headwords:** `de-jmdict-${entSeq}` (e.g. `de-jmdict-1000010`). Based on EDRDG's immutable monotonic `ent_seq`. First-party: `de-${slug}`.
2. **Example Sentences:** `es-tat-${tatoebaId}` (e.g. `es-tat-1001`). Based on Tatoeba's permanent numeric sentence ID. First-party: `es-${slug}`.
3. **Kanji Headwords:** Single Japanese Kanji character is enforced unique by `kanji_entries.character` UNIQUE.
4. **Radicals & Primitives:** Character is enforced unique by `kanji_radicals.character` UNIQUE.
5. **Grammar Patterns:** URL-safe kebab-case slug is enforced unique by `grammar_patterns.slug` UNIQUE (`gp-${slug}`).

---

## G. ETL INTEGRATION & DRY-RUN CONTRACT

Formalized in `src/services/knowledge/provenance/etlContext.ts`:
* `createETLProvenanceContext(sourceId, options)`:
  1. Resolves source from the authoritative registry.
  2. Runs `ProvenanceService.assertIngestible(source)` (fails closed if status $\ne$ `'active'` or license is `'UNKNOWN'`).
  3. Produces `ETLDryRunManifest` detailing source version, URI, license verification, target tables, and safety warnings.
  4. Provides `stampRecord(record)` to stamp validated `sourceRef` without manual/fabricated strings.
  5. Provides `verifyRecordProvenance(record)` to audit that emitted records match the context source.

---

## H. CMS EDITORIAL VS CANONICAL PROVENANCE BOUNDARY

* **Canonical Knowledge Records:** Carry immutable `source_ref` pointing to upstream releases (`upstream:jmdict:2024-07`, `upstream:tatoeba:2024-07`) or first-party corpora.
* **CMS Editorial Items:** Recorded in `cms_content_items` with `source_ref: "editorial:cms-review:v1"` and `original_source_ref: "<canonical-source-ref>"`.
* **Publication Overlay:** `dictionaryPublicationResolver.ts` merges published editorial changes per-field at presentation time without altering the underlying canonical row or its `source_ref` in PostgreSQL.
* **Architectural Boundary:** Learner services in `src/services/` remain CMS-unaware; static security assertion (`tests/cms-security-integration.test.ts`) verified clean.

---

## I. SCHEMA CHANGES

**VERDICT: NONE.**
The existing schema for `knowledge_sources` (`src/db/schema.ts`) and all related tables is 100% sufficient to persist and resolve the full provenance contract. Zero migrations created or needed.

---

## J. IMPLEMENTATION FILE INVENTORY

### Files Created:
1. `src/services/knowledge/provenance/types.ts` — Core provenance types, taxonomies, and manifest interfaces.
2. `src/services/knowledge/provenance/registry.ts` — Controlled registry of authoritative sources and backward-compatible aliases.
3. `src/services/knowledge/provenance/provenanceService.ts` — Validation engine, deterministic ID formatters, resolution logic, and fail-closed guards.
4. `src/services/knowledge/provenance/etlContext.ts` — ETL provenance runtime context and dry-run manifest generator.
5. `src/services/knowledge/provenance/index.ts` — Barrel export for the provenance subsystem.
6. `tests/provenance-foundation.test.ts` — 22 focused Vitest unit and contract tests.
7. `reports/gates/PHASE-14.1-SOURCE-PROVENANCE-FOUNDATION.md` — This gate report.

### Files Modified:
* None.

### Files Unchanged:
* `src/db/schema.ts` — Preserved untouched.
* All existing ETL loaders, routes, and CMS services — Preserved untouched.

---

## K. VERIFICATION & TEST RESULTS

```bash
# 1. Focused Phase 14.1 Test Suite
npx vitest run tests/provenance-foundation.test.ts
# Result: PASS (22 tests passed in 587ms)

# 2. Complete Database-Free Vitest Suite (ETL, CMS, AI, Auth, Publication, Provenance)
npx vitest run tests/provenance-foundation.test.ts tests/dictionary-etl.test.ts tests/cms-*.test.ts tests/ai-*.test.ts tests/language-selector.test.ts tests/application-user-actor.test.ts tests/supabase-auth-foundation.test.ts
# Result: PASS (18 test files passed, 445 tests passed, 0 failures)

# 3. TypeScript Strict Typecheck
npm run typecheck
# Result: PASS (0 errors)

# 4. ESLint Static Analysis
npm run lint
# Result: PASS (0 errors, 4 warnings)

# 5. Drizzle Kit Migration / Snapshot Verification
npx drizzle-kit check
# Result: PASS ("Everything's fine 🐶🔥")

# 6. Next.js Production Build
npm run build
# Result: PASS (Compiled in 12.4s, 13/13 static pages generated)
```

---

## L. STATIC SECURITY AUDIT

* **Secrets & Credentials:** No API keys, database credentials, or tokens present in code or committed.
* **Client Boundary:** Zero client imports of server-only modules or database clients.
* **CMS Isolation:** Learner services remain completely decoupled from editorial lifecycle state.
* **Fail-Closed Protection:** Unregistered or unverified candidate sources throw immediate exceptions before ingestion can begin.

---

## M. PRODUCTION ENVIRONMENT SAFETY

* **Production Database Contacted?** **NO.**
* **Production Data Modified?** **NO.**
* **Vercel Deployed?** **NO.**
* **Schema Migrations Pushed?** **NO.**

---

## N. DEFERRED WORK (OUT OF SCOPE FOR PHASE 14.1)

The following activities remain strictly deferred to subsequent sub-phases:
* **Phase 14.2:** Dictionary ETL Foundation (hardened JMdict batch processor, dry-run CLI, deduplication, POS mapping).
* **Phase 14.3:** Japanese Dictionary Dataset Ingestion (staged core vocabulary import).
* **Phase 14.4:** Kanji + Radical Expansion (KANJIDIC2 & KanjiVG decomposition ingestion).
* **Phase 14.5:** Example Sentence Pipeline (Tatoeba ingestion with reading generation).
* **Phase 14.6:** Grammar Dataset Pipeline (N5–N1 grammar pattern ingestion).
* **Phase 14.7:** Multilingual Translation Expansion (Tamil and Malayalam vocabulary enrichment).
* **Phase 14.8:** JLPT Classification & Content Mapping.
* **Phase 14.9:** Search & Data Quality Integration.
* **Phase 14.10:** SRS Content Generation Integration.
* **Phase 14.11:** Knowledge QA, Deduplication & Validation.
* **Phase 14.12:** Production Data Readiness Gate.

---

## O. FINAL GATE VERDICT

```text
================================================================================
FINAL GATE VERDICT:
GO — PHASE 14.1 SOURCE & PROVENANCE FOUNDATION READY
================================================================================
```
