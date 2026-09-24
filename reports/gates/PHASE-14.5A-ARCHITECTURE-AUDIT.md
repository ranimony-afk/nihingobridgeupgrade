# Phase 14.5A Gate Report: Architecture Audit

**Gate**: Phase 14.5A — Tatoeba Sentence Acquisition & Provenance Foundation
**Deliverable**: §1 Existing NihongoBridge Architecture Audit
**Date**: 2026-09-24
**Mode**: READ-ONLY
**Files modified**: 0

---

## Verdict

```
WHAT EXISTS      → substantial, reusable provenance + sentence infrastructure
WHAT CAN BE REUSED → most of §2/§9/§10; §2 is ALREADY SATISFIED
WHAT IS MISSING  → acquisition engine, artifact, and all §22 execution reports
WHAT WILL BE CREATED → nothing (phase NO-GO; see PHASE-14.5A-FINAL-GATE-REPORT.md)
WHAT MUST NOT BE CHANGED → canonical corpus + Phase 14.4F contracts
```

**Primary finding**: §2 of this phase — registering `upstream:tatoeba:2024-07` — is
**already complete**. It was registered by an earlier phase. Duplicating it would violate
§1's "Do not duplicate existing infrastructure."

---

## 1. WHAT EXISTS

### 1.1 Source registry & provenance (Phases 14.1 / 14.3A–14.4F)

All in `src/services/knowledge/provenance/`:

| Component | Location | Relevance |
| :--- | :--- | :--- |
| `AUTHORITATIVE_SOURCE_REGISTRY` | `registry.ts:19` | 14 registered sources; **includes `upstream:tatoeba:2024-07`** |
| `SOURCE_ALIASES` | `registry.ts:284` | Includes `"tatoeba:corpus:2024-07" → "upstream:tatoeba:2024-07"` |
| `ProvenanceContract` | `types.ts:36` | Typed source metadata incl. `license`, `attribution`, `targetTables` |
| `SourceRelease` | `types.ts:68` | Versioned release model |
| `ETLDryRunManifest` | `types.ts:94` | **Existing dry-run manifest contract — reuse for §17/§18** |
| `ProvenanceService` | `provenanceService.ts:30` | Registration + `ProvenanceValidationResult` |
| `createETLProvenanceContext()` | `etlContext.ts:40` | **Existing per-record provenance stamping — reuse for §9** |
| `getRegisteredSource()`, `listSourcesByDomain()` | `registry.ts:294,310` | Lookup helpers |

**The Tatoeba source contract already satisfies §2 and §9's minimum provenance set**
(`registry.ts:125`):

```
id:           upstream:tatoeba:2024-07
version:      2024-07
releaseDate:  2024-07-01
license:      CC-BY-2.0-FR
attribution:  "Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR"
domain:       sentence
status:       active
targetTables: ["example_sentences"]
```

This exactly matches §2's declared metadata and §24's attribution requirement.

### 1.2 Sentence models (pre-existing, Phase 4)

| File | Contents |
| :--- | :--- |
| `src/etl/sentence/types.ts` | `TATOEBA_SOURCE_REF = "tatoeba:corpus:2024-07"`, `TATOEBA_KNOWLEDGE_SOURCE`, `RawSentenceSourceRecord`, `CanonicalExampleSentence` |
| `src/etl/sentence/parser` | *(none — no standalone parser; fixture-only)* |
| `src/etl/sentence/transformer.ts` | `transformSentenceEntry()` — NFKC clean, kanji extraction, vocab/grammar match |
| `src/etl/sentence/matcher.ts` | `SentenceMatcher` — `matchDictionaryEntries()`, `matchGrammarPattern()` |
| `src/etl/sentence/loader.ts` | `SentenceLoader` — idempotent batch upsert into `example_sentences` |
| `src/etl/sentence/pipeline.ts` | `SentencePipeline.run()` — orchestrator |
| `src/etl/sentence/pilotData.ts` | `TATOEBA_PILOT_FIXTURE` — **25 hardcoded records** |

### 1.3 Schema

| Table | Location | Relevance |
| :--- | :--- | :--- |
| `example_sentences` | `schema.ts:750` | Sentence target (`targetTables` for Tatoeba) |
| `knowledge_sources` | `schema.ts:691` | Source registration w/ `license`, `recordCount` |
| `dictionary_entries` | `schema.ts:707` | Canonical vocabulary (206,747 rows) — §13 linker source |
| `kanji_entries` / `kanji_radicals` / `kanji_composition` | `schema.ts:549/529/569` | Canonical kanji — §13/§15 |
| `entity_translations` | `schema.ts:775` | Multilingual translation store (en/ta/ml) |

### 1.4 Hashing / checksum conventions

`createHash("sha256")` streaming usage is an established repo-wide pattern:

```
scripts/dry-run-kanjidic2.ts:69     scripts/dry-run-kanjivg.ts:61
scripts/ingest-full-jmdict.ts:221   scripts/ingest-kanjidic2.ts:144
scripts/build-kanji-lexical-graph.ts:99
src/services/translation/translationService.ts:41
```

Streaming SHA-256 over a canonical serialization is therefore convention, not invention.

### 1.5 ETL / dry-run conventions

- `scripts/dry-run-{jmdict,kanjidic2,kanjivg}.ts` — established two-pass dry-run + digest pattern
- `reports/gates/*-ACQUISITION-MANIFEST.json` — existing manifest shape (KANJIDIC2, KanjiVG)
- `scripts/preflight-check.ts` — existing preflight guard (`[PRECHECK] FATAL` checks)
- `scripts/run-disposable-pg.ts` — existing loopback PGlite harness (`127.0.0.1:5432`)
- `src/etl/kanji/`, `src/etl/dictionary/` — streaming XML parser + transformer structure to mirror

---

## 2. WHAT CAN BE REUSED

| Phase requirement | Reuse target | Verdict |
| :--- | :--- | :--- |
| §2 source definition | `registry.ts:125` `upstream:tatoeba:2024-07` | **Already exists — reuse as-is** |
| §9 provenance model | `createETLProvenanceContext()`, `ProvenanceContract` | Reusable |
| §9 source alias | `SOURCE_ALIASES["tatoeba:corpus:2024-07"]` | Already maps to canonical ID |
| §18 dry-run manifest | `ETLDryRunManifest` (`types.ts:94`) | Reusable contract |
| §18 canonical digest | streaming `createHash("sha256")` convention | Reusable pattern |
| §5 streaming parse | `src/etl/kanji/xmlParser.ts` structure | Adaptable (TSV, not XML) |
| §13 linkage foundation | `dictionary_entries`, `kanji_entries`, Phase 14.4E graph | Read-only source |
| §19 performance | repo `durationMs` / `records/sec` reporting convention | Reusable |

**§24 attribution** is already satisfied in the registry — retention is a no-op, not new work.

---

## 3. WHAT IS MISSING

| # | Missing | Blocks |
| :--- | :--- | :--- |
| 1 | `data/tatoeba/sentences.tsv` (or any Tatoeba artifact) | Entire phase (§3, §5, §17, §18, §26) |
| 2 | `src/etl/tatoeba/` acquisition engine (`acquire`, `parser`, `validator`, `provenance`) | §3–§11 |
| 3 | `scripts/dry-run-tatoeba.ts` | §17 |
| 4 | `tests/tatoeba-provenance-acquisition.test.ts` | §20 |
| 5 | Relationship acquisition (sentence↔sentence) | §8 — **no existing representation at all** |
| 6 | `assertDisposableLocalDatabase()` | §0 — no DB safety guard exists |
| 7 | `docs/architecture/TATOEBA-*.md` | §16, §23 |
| 8 | All §22 execution reports | §22 |
| 9 | Local `app_db` + canonical corpus | §15 |

**Note on §8**: the current `CanonicalExampleSentence` model is **flattened** — one
`japanese` + one `english` string. There is **no relationship model** for Tatoeba's
sentence↔sentence translation graph. §8 (one-to-one / one-to-many / many-to-one /
untranslated) requires a genuinely new representation. This is the largest modelling gap.

---

## 4. WHAT MUST NOT BE CHANGED

| Protected | Reason |
| :--- | :--- |
| `upstream:tatoeba:2024-07` license + attribution | §24; already correct |
| `dictionary_entries` (206,747), `kanji_entries` (13,108), `kanji_radicals` (63), `kanji_composition` (90) | §15 |
| `箸` = 14 strokes; `source_ref = first-party:kanji-mindtree:v1` | §15 explicit |
| `example_sentences` / all 31 tables | §16 zero-schema-change |
| Phase 14.4F API contracts | cross-phase |
| `drizzle/0000`–`0003` | §16 zero-migrations |

---

## 5. Architectural Findings Bearing on §13 ("Linkage Foundation")

Recorded because they constrain any real implementation.

**5.1 `example_sentences` cannot store Tatoeba records as-is.** It declares `japanese`,
`reading`, `english`, and `jlpt_level` all `NOT NULL`. Tatoeba provides no full-sentence
reading, §8 explicitly includes untranslated sentences, and §13/§14 forbid claiming
unsupported readings or JLPT labels. The Phase 4 transformer masks this by defaulting
`reading = japanese` (`transformer.ts:52`) — a lossy substitution that stores kanji text in
a reading column. §16's `TATOEBA-SENTENCE-MODEL.md` must address this rather than inherit it.

**5.2 The existing matcher does not satisfy §14.** `SentenceMatcher.matchDictionaryEntries`
(`matcher.ts`) does a full `includes()` scan over every cached headword — no positions, no
longest-match, and O(N×M) against 206,747 entries. It also swallows DB errors into an empty
match set (`pipeline.ts:46-49`), making "matched nothing" indistinguishable from "DB down".
§14 requires typed match results (`EXACT_HEADWORD` / `KANJI_CHARACTER` / `EXACT_READING` /
`UNMATCHED`); none exist.

**5.3 Canonical counts are consistent, not contradictory.** The phase prompt's
`dictionary_entries: 206,747` and `tests/dictionary-architecture.test.ts:48`'s `206,717`
measure different scopes:

```
206,747  table total  (upstream:jmdict:2023-08 206,717 + first-party 30 + pilot 2)
206,717  JMdict subset only
```

Verified against `PHASE-14.4E-FINAL-GATE-REPORT.md:7` and
`PHASE-14.4C-PREINGESTION-AUDIT.md:22`. §15 should target **206,747** for the table check.

---

## 6. Architecture Audit Verdict

The repository **already provides** most of the reusable foundation 14.5A anticipates —
source registry, provenance contracts, dry-run manifest shape, streaming SHA-256 convention,
and a PGlite loopback harness. §2 is done.

What is genuinely missing is (a) the **artifact**, (b) the **acquisition/relationship
engine**, and (c) a **translation-relationship model** that does not exist in any form today.

Since the artifact is unobtainable (§3 blocked — see `PHASE-14.5A-PREACQUISITION-AUDIT.md`),
**no code was written**, per §1's reuse-first mandate and §29's hard stop. Writing a parser
against an absent input would produce an unverifiable foundation and risk implying a
verified state that does not exist.

**No files created beyond the three mandated audits. No infrastructure duplicated.**
