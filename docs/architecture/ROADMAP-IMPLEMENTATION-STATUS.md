# NihongoBridge — Roadmap Implementation Status

**Purpose**: Single authoritative record of what is actually implemented versus
documented, assumed, or blocked. Every status carries evidence.
**Last updated**: 2026-09-24
**Checkpoint**: `36f0a52` (audit chain) + Phase 14.4F-R work
**Branch**: `arena/01a0d136-nihingobridgeupgrade`

> **Why this document exists.** Across several sessions, phase prompts referenced
> predecessors that did not exist in the repository, and treated report prose as proof of
> implementation. This document replaces that with a repository-evidence ledger. A report
> claiming a phase passed is **not** evidence that it passed; only a file, a commit, or a
> reproducible test result is.

---

## 0. Status Vocabulary

| State | Meaning |
| :--- | :--- |
| **VERIFIED** | Gate report exists **and** the claims are reproducible in the current environment |
| **IMPLEMENTED** | Code exists and is reachable; no formal gate report, or not independently re-checked |
| **PARTIALLY IMPLEMENTED** | Some documented deliverables exist; named gaps remain |
| **DESIGN ONLY** | Architecture/documentation exists; no implementation |
| **BLOCKED** | External prerequisite missing; cannot proceed |
| **NOT STARTED** | Nothing exists |
| **DEFERRED** | Consciously postponed by decision |

### The re-verifiability distinction

A phase can be historically complete yet **not re-verifiable today**. This repository's
canonical corpus (`dictionary_entries` 206,747 · `kanji_entries` 13,108 ·
`kanji_radicals` 63 · `kanji_composition` 90) is populated by ingesting source corpora that
are **absent from this checkout**:

```
data/                    DOES NOT EXIST
data/JMdict.xml          absent    → upstream:jmdict:2023-08
data/kanjidic2.xml       absent    → upstream:kanjidic2:2023-08
data/kanjivg/            absent    → upstream:kanjivg:2024-04
DATABASE_URL             unset     → no local app_db on 127.0.0.1:5432
```

Consequence: **62 of 746 tests cannot run here** (39 × `DATABASE_URL is required`,
1 × `ECONNREFUSED`, 4 × missing ETL artifacts, remainder pre-existing DB-dependent
assertions). Those 62 failures are an **environment defect, not a code defect** — and they
mean every data-dependent phase below is recorded as *historically verified, currently
unverifiable* rather than simply "verified."

---

## 1. Phase Ledger

### Foundation (pre-14.x — present, not re-audited)

| Phase | Status | Evidence |
| :--- | :--- | :--- |
| 11 Progress / XP / Analytics | **IMPLEMENTED** | `src/services/analytics/`, `src/services/gamification/`, `src/app/api/xp`, `src/app/progress` |
| 12B Multilingual Translation Storage | **IMPLEMENTED** | `drizzle/0001_multilingual_translations.sql`, `entity_translations` table, `src/services/translation/` |
| 13.x AI / CMS platform | **VERIFIED** | 16 passing CMS/AI suites (see §2) |

### Knowledge platform

| Phase | Name | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 14.0 | Knowledge/Data Architecture | **VERIFIED** | `reports/gates/PHASE-14.0-KNOWLEDGE-DATA-ARCHITECTURE-RECON.md` |
| 14.1 | Source & Provenance Foundation | **VERIFIED** | `PHASE-14.1-SOURCE-PROVENANCE-FOUNDATION.md`; `src/services/knowledge/provenance/**`; `tests/provenance-foundation.test.ts` **22 passing** (re-verifiable now) |
| 14.2 | Dictionary ETL Foundation | **VERIFIED** | `PHASE-14.2-DICTIONARY-ETL-FOUNDATION.md`; `src/etl/dictionary/**`; `dictionary-etl-foundation.test.ts` **26 passing**, `dictionary-etl.test.ts` **9 passing** |
| 14.3A/B | JMdict Dry Run | **VERIFIED** (historically) · **re-run BLOCKED** | `PHASE-14.3A-B-JMDICT-DRY-RUN.md`, `reports/gates/jmdict-dry-run-stats.json`; `dry-run-jmdict.test.ts` **1 failing** — needs `data/JMdict.xml` |
| 14.3C | JMdict Controlled Pilot | **VERIFIED** (historically) · **re-run BLOCKED** | `PHASE-14.3C-CONTROLLED-DATABASE-PILOT.md`; `pilot-jmdict-db.test.ts` **12 skipped** — needs DB |
| 14.3D | JMdict Local Full Ingestion | **VERIFIED** (historically) · **re-run BLOCKED** | `PHASE-14.3D-FULL-JMDICT-INGESTION.md` (206,717 entries, 2-pass idempotent); `full-jmdict-ingestion.test.ts` **9 failing** — needs DB + XML |
| 14.4A | Dictionary Intelligence Architecture | **VERIFIED** | `PHASE-14.4A-TAKOBOTO-DICTIONARY-ARCHITECTURE.md`; `docs/architecture/DICTIONARY-KNOWLEDGE-GRAPH.md`, `DICTIONARY-FEATURE-MATRIX.md`, `KEIGO-REGISTER-MODEL.md`, `MOBILE-DICTIONARY-API-CONTRACT.md`; `dictionary-architecture.test.ts` **6/9 passing** |
| 14.4B | KANJIDIC2 / Kanji Foundation | **VERIFIED** (historically) · **re-run BLOCKED** | `PHASE-14.4B-KANJIDIC2-ACQUISITION-MANIFEST.json`, `-DRY-RUN.md`, `-KANJI-RECONCILIATION.md`; `kanjidic2-etl-foundation.test.ts` **6 failing** |
| 14.4C | Kanji/Radical Relationships | **VERIFIED** (historically) · **re-run BLOCKED** | `PHASE-14.4C-CONTROLLED-KANJIDIC2-INGESTION.md`, `-PREINGESTION-AUDIT.md`; `kanjidic2-canonical-ingestion.test.ts` **18 failing** |
| 14.4D | KanjiVG Visual Foundation | **VERIFIED** (historically) · **re-run BLOCKED** | `PHASE-14.4D-FINAL-GATE-REPORT.md`, `-KANJIVG-COVERAGE.md`, `-KANJIVG-ACQUISITION-MANIFEST.json`; `kanjivg-etl.test.ts` **7 failing** |
| 14.4E | Kanji Lexical & Structural Graph | **VERIFIED** (historically) · **re-run BLOCKED** | `PHASE-14.4E-FINAL-GATE-REPORT.md`, `-GRAPH-COVERAGE.md`, `-READING-RECONCILIATION.md`; latest merged PR #9; `kanji-lexical-graph.test.ts` **18 failing** |
| **14.4F** | **Dictionary & Kanji Experience** | **PARTIALLY IMPLEMENTED** | **No gate report and no commit ever referenced 14.4F.** See §3 for the reconciliation and what 14.4F-R added. |

### Sentence track

| Phase | Name | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 14.5A | Tatoeba Acquisition | **BLOCKED** | Official endpoints unreachable (HTTP 000); no artifact in workspace or full history. See `PHASE-14.5A-R3-FINAL-GATE-REPORT.md` |
| 14.5B | Sentence Normalization/Validation/Linkage | **BLOCKED** → **NOT AUTHORIZED** | Gated behind 14.5A GO (`PHASE-14.5A-NEXT-SESSION-HANDOFF.md`) |
| 14.5C | Sentence Relationships / Phrases / Context | **NOT STARTED** | No code, no report |
| 14.5D | Sentence Search / Index | **NOT STARTED** | No code, no report |
| 14.6 | Grammar | **PARTIALLY IMPLEMENTED** | `grammar_patterns` table (`schema.ts:730`), `src/etl/grammar/`, `src/services/grammar/grammarService.ts`; `grammar-engine.test.ts` **9 skipped** |
| 14.7 | Multilingual Expansion | **PARTIALLY IMPLEMENTED** | `entity_translations` + migration `0001`, `src/services/translation/**` (3 files); `multilingual-translation.test.ts` **9 skipped** |
| 14.8 | JLPT | **PARTIALLY IMPLEMENTED** | `src/services/jlpt/**` (2), `src/app/api/jlpt/**` (11 routes), `src/app/jlpt/**`; `jlpt-integration.test.ts` **7 skipped** |
| 14.9 | Search / Data Quality | **PARTIALLY IMPLEMENTED** | `src/services/search/**` (4 files) — `UnifiedSearchService`, `matcher`, `types`; `/api/search`; `unified-search.test.ts` **12 skipped** |
| 14.10 | SRS | **IMPLEMENTED** | `src/services/srs/**` (8 files) + strategies, `src/app/api/srs/**`, `src/app/review/**`; `srs-activation.test.ts` **12 skipped** |
| 14.11 | QA | **NOT STARTED** | No gate report; no dedicated QA phase artifact |
| 14.12 | Production Readiness | **PARTIALLY IMPLEMENTED** | `npm run build` **passes** (21 pages, 72 API routes); `next.config.ts`, `proxy.ts` present. No formal readiness gate report |

---

## 2. Test Evidence (measured, this checkpoint)

```
Test Files   18 failed | 21 passed (39)
Tests        62 failed | 582 passed | 102 skipped (746)
```

Exactly reproducible suites (no database required) — **582 passing**:

| Suite group | Files | Tests |
| :--- | :--- | :--- |
| CMS (service, security, workflow, review, admin UI, learner publication, dictionary API) | 9 | 258 |
| AI (provider contract, anthropic adapter, grounded answer, answer API) | 4 | 121 |
| Auth / actor | 2 | 36 |
| ETL foundation (dictionary, provenance) | 3 | 57 |
| Dictionary & Kanji experience routes (**added by 14.4F-R**) | 1 | 31 |
| Misc (language selector) | 1 | 2 |

The 62 failures are **all** environmental (see §0). No failure is attributable to the
14.4F-R work: the count was 62 before and 62 after, while passing tests rose 551 → 582.

---

## 3. Phase 14.4F Reconciliation

### 3.1 What the claim was

Prior prompts described "Phase 14.4F — Takoboto-Class Dictionary & Kanji Experience" as a
verified predecessor.

### 3.2 What the repository shows

**No evidence of a 14.4F phase ever existing as a completed unit:**

- `reports/gates/` contains **no** `PHASE-14.4F*` report. The sequence runs 14.4A → 14.4E.
- A full-history commit scan (GitHub API, since the local clone is depth-1) found **zero**
  commits mentioning `14.4F`.
- All 9 merged PRs are phases 13.x–14.4E. The latest is PR #9 (14.4E).

**But substantial 14.4F-scoped work does exist**, delivered primarily inside PR #9:

| §4.1 deliverable | Present before this session |
| :--- | :--- |
| `GET /api/dictionary` | ✅ `src/app/api/dictionary/route.ts` |
| `GET /api/dictionary/search` | ❌ absent |
| `GET /api/dictionary/[id]` | ✅ `src/app/api/dictionary/[id]/route.ts` |
| `GET /api/dictionary/entry/[id]` | ❌ absent |
| `GET /api/kanji/[character]` | ✅ `src/app/api/kanji/[character]/route.ts` |
| `GET /api/kanji/[character]/vocabulary` | ❌ absent |
| `GET /api/kanji/[character]/readings` | ❌ absent |
| `GET /api/kanji/[character]/components` | ❌ absent |
| `/dictionary`, `/dictionary/[id]`, `/kanji`, `/kanji/[character]` UI | ✅ all four present |
| Contracts `lexicalGraph.ts`, `mobileDictionary.ts` | ✅ both present (505 / 217 lines) |
| Components `dictionary`/`kanji`/`stroke`/`keigo`/`translation`/`mobile` | ❌ none present |
| `docs/architecture/DICTIONARY-SEARCH-ARCHITECTURE.md` | ❌ absent |

**Verdict: 14.4F was PARTIALLY IMPLEMENTED, never a completed or verified phase.**
Consistent with §1.2, it is not described as "restored."

### 3.3 What Phase 14.4F-R added (this session)

Called **14.4F-R** — a new revision, not a restoration. Each new endpoint is a thin adapter
over the **already-verified 14.4E** graph service (`kanjiLexicalGraphService`) — no graph
rebuild, no duplicate model, no canonical mutation.

| Endpoint | Delegates to |
| :--- | :--- |
| `GET /api/dictionary/search` | `DictionaryService.searchEntries` + `detectSearchScript` |
| `GET /api/dictionary/entry/[id]` | `DictionaryService.getEntryDetail` + `getVocabularyKanji` + `getKeigoRelations` |
| `GET /api/kanji/[character]/vocabulary` | `getKanjiVocabulary` |
| `GET /api/kanji/[character]/readings` | `getKanjiReadings` |
| `GET /api/kanji/[character]/components` | `getKanjiComponents` + `getKanjiRadicals` |

Supporting module: `src/lib/api/routeParams.ts` — bounded parameter parsing shared by all
five routes (rejects NaN/Infinity, clamps oversized limits, accepts only literal booleans).

Tests: `tests/dictionary-kanji-experience-routes.test.ts` — **31 tests, all passing without
a database**, because services are mocked and only the HTTP contract is exercised. This is a
deliberate testability improvement: route contracts no longer require a provisioned corpus
to be verified.

### 3.4 What 14.4F-R did NOT do

- No canonical mutation; no schema change; no migration (4 migrations, unchanged).
- Did not rebuild or duplicate the 14.4E graph.
- Did not add UI components. The `/dictionary` and `/kanji` pages already exist; this phase
  did not modify them, and no `stroke`/`keigo`/`mobile` components were created.
- Did not implement AI ranking.

### 3.5 Remaining 14.4F gaps

- Dedicated `dictionary/kanji/stroke/keigo/translation/mobile` component library — absent.
- `/api/dictionary/entry/[id]` currently returns `keigo` from `getKeigoRelations`. Whether
  that relation set is *populated* for real entries is **unverifiable here** (needs DB +
  seeded corpus). The endpoint is structurally correct; its data coverage is unknown.
- No live-corpus verification of any 14.4F-R endpoint (no DB).

---

## 4. Blocking Dependencies

| Blocker | Blocks | Resolution |
| :--- | :--- | :--- |
| Tatoeba artifact absent; `tatoeba.org` egress blocked | 14.5A → 14.5B → 14.5C/14.5D | Supply artifact into a session that can see it; see `PHASE-14.5A-NEXT-SESSION-HANDOFF.md` |
| No `DATABASE_URL` / local `app_db` | 62 tests; all data-dependent re-verification | Provision disposable PGlite (`scripts/run-disposable-pg.ts`) **after** §0 corpora exist |
| `data/JMdict.xml`, `data/kanjidic2.xml`, `data/kanjivg/` absent | Corpus seeding; 14.5B linkage; ETL re-runs | Fetch from EDRDG / KanjiVG; expected SHA-256 recorded in 14.4B/14.4D manifests |
| 14.4F never formally gated | Audit trail completeness | 14.4F-R partially closes it; a formal gate report would close it fully |

---

## 5. Integrity Statement

For this checkpoint:

```
database writes           0
schema migrations         0
production access         0
canonical mutations       0
fabricated upstream data  0
tests weakened            0
audit reports deleted     0
```

Phase 14.5A remains **BLOCKED** and 14.5B remains **NOT AUTHORIZED**. Nothing in this
document or this session should be read as advancing either.
