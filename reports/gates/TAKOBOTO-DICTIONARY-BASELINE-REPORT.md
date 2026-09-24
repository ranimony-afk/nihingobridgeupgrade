# TAKOBOTO-CLASS DICTIONARY — BASELINE REPORT

**Gate**: A — Reconnaissance (read-only)
**Date**: 2026-09-24
**Mode**: READ-ONLY. No source file, schema file, migration, or test was modified. No migration run. No production access.
**Method**: Direct inspection of source, schema, migrations, and measured counts. Historical reports were **not** treated as evidence (§0.1.5).

---

## 0. Executive summary

The repository already contains a **substantial** dictionary/kanji/search/CMS platform, not a
greenfield. Most of what §2–§63 describes exists in some form. Three findings dominate this
baseline and determine what the later gates must do:

| # | Finding | Consequence |
| :--- | :--- | :--- |
| **1** | **The JMdict corpus is NOT present in this environment.** The only locally available content is **30 dictionary entries** (first-party seed). §1's premise "JMdict corpus is already available through the existing dictionary foundation" is **UNVERIFIED** — the foundation exists as *code*; the *corpus* does not exist here. | Data-dependent gates cannot be executed or measured here. See §9. |
| **2** | **`dictionary_entries` has no index beyond its primary key.** Only **5 of 30** tables have any named index. Search runs `ILIKE '%q%'` across three unindexed columns. | §5/§35/§36 are real, not theoretical. Any index change needs the §58 migration plan. |
| **3** | **The existing `DICTIONARY-FEATURE-MATRIX.md` contradicts the source code.** It marks components and stroke order as `PLANNED`/`DATA-BLOCKED` on phases that are complete, and asserts corpus counts that cannot be re-measured. | Gate B must reconcile, not extend blindly. See §10. |

**Status: reconnaissance complete. No source changes made.**

---

## 1. Repository state

| Item | Value |
| :--- | :--- |
| HEAD | `5d2383ecf15112926409298657b0db8efb951b05` |
| Branch | `arena/01a0d136-nihingobridgeupgrade` |
| Working tree | **CLEAN** |
| Shallow clone | **yes** (`is-shallow-repository` = true) → history must be queried via `gh api` |
| Tags | **0** |
| Local branches | `arena/01a0d136-nihingobridgeupgrade`, `main` |
| Remote branches | 8 (+ `main`); the 7 Arena session branches are listed in the prior archaeology report |
| Migrations | **4** — `0000_absurd_emma_frost`, `0001_multilingual_translations`, `0002_cms_content_lifecycle`, `0003_users_auth_identity` |
| Tables | **30** |
| API route handlers | **72** |
| UI pages | **21** |
| Test files | **46** |
| `data/` directory | **absent** |
| `DATABASE_URL` | **not set** |
| PostgreSQL on `127.0.0.1:5432` | **CLOSED** |

### 1.1 Latest verified checkpoint — verified, not assumed

| Claim | Verification |
| :--- | :--- |
| Phase 14.4E is the latest **gated** phase | **CORROBORATED** — `reports/gates/PHASE-14.4E-FINAL-GATE-REPORT.md` exists; it is the highest-numbered `PHASE-14.4x` gate report. |
| No 14.4F gate report exists | **CONFIRMED** — absent from this branch and from all 8 remote branches |
| No 14.5A gate report exists outside this branch | **CONFIRMED** — the 14.5A report set exists only on this branch |
| 14.5A BLOCKED | **CONFIRMED** — no artifact; 0 commits ever touched `data/tatoeba` |
| 14.5B/14.5C/14.5D | **NOT AUTHORIZED** — unchanged by this prompt |

`LATEST_VERIFIABLE_PHASE = 14.4E` holds. `14.4F = PARTIALLY IMPLEMENTED (rebuilt as 14.4F-R)`.

---

## 2. Data availability — the governing constraint

Measured from source (`src/data/*.ts`), since no database is available:

| Dataset | Records | Source file | Size |
| :--- | :--- | :--- | :--- |
| `DICTIONARY_ENTRIES` | **30** | `src/data/lexicon.ts` | — |
| `GRAMMAR_PATTERNS` | **12** | `src/data/lexicon.ts` | — |
| `EXAMPLE_SENTENCES` | **24** | `src/data/lexicon.ts` | — |
| `KANJI` | **33** | `src/data/kanji.ts` | — |
| `ELEMENTS` (radicals/primitives) | **54** | `src/data/kanji.ts` | — |
| Seed file total | — | `kana.ts` + `kanji.ts` + `lexicon.ts` | **74 KB** |

### 2.1 What this means

```
Tatoeba-dependent functionality        = DEFERRED     (artifact absent — unchanged)
JMdict full-corpus functionality       = NOT VERIFIABLE HERE (corpus absent, data/ absent)
First-party seed functionality (30)    = AVAILABLE
Kanji seed functionality (33 + 54)     = AVAILABLE
Search logic (pure functions)          = AVAILABLE and testable
Search data-layer behaviour at scale   = NOT TESTABLE HERE
```

§1's table says "JMdict corpus is already available through the existing dictionary
foundation." **The foundation is present; the corpus is not present in this environment.**
The ETL pipeline (`src/etl/dictionary/*`) can ingest `data/JMdict.xml`, but that file does
not exist and `data/` does not exist. Per §0.1.5 this is recorded as a discrepancy rather
than assumed away.

**Impact**: §46 requires measuring actual counts from the current database. That is
**impossible here** — no database, no corpus. §46 is therefore **BLOCKED**, and the
existing feature matrix's counts cannot be re-verified. This is stated rather than worked
around, because fabricating counts is exactly what §46 prohibits.

---

## 3. Existing database tables (30)

| Domain | Count | Tables |
| :--- | :--- | :--- |
| Dictionary / kanji | 8 | `dictionary_entries`, `kanji_entries`, `kanji_radicals`, `kanji_composition`, `kana_entries`, `knowledge_sources`, `example_sentences`, `entity_translations` |
| Grammar / JLPT | 6 | `grammar_patterns`, `jlpt_tests`, `jlpt_test_questions`, `questions`, `test_sessions`, `test_answers` |
| SRS / learner | 12 | `srs_cards`, `srs_decks`, `srs_personalization`, `srs_review_sessions`, `srs_reviews`, `srs_schedulers`, `srs_sync_devices`, `srs_sync_log`, `srs_user_settings`, `user_analytics`, `xp_events`, `xp_rules` |
| CMS | 3 | `cms_content_items`, `cms_content_versions`, `cms_audit_log` |
| Auth | 1 | `users` |

### 3.1 `dictionary_entries` — the §6 answer

§6 asks whether the existing table already supports the required fields. **Yes:**

| §6 field | Column | Present |
| :--- | :--- | :--- |
| headword | `headword` (notNull) | ✓ |
| reading | `reading` (notNull) | ✓ |
| gloss | `senses` jsonb (`{glosses[], note}`) | ✓ |
| POS | `parts_of_speech` jsonb | ✓ |
| sense | `senses` jsonb (ordered) | ✓ |
| priority | `is_common`, `frequency_rank` | ✓ |
| source | `source_ref` | ✓ |
| JLPT | `jlpt_level` (notNull) | ✓ |
| kanji links | `kanji_characters` jsonb | ✓ |
| romaji | `romaji` (notNull) | ✓ |
| tags | `tags` jsonb | ✓ |

**§6 conclusion: no new table is needed.** The four proposed derived search fields
(`search_headword_normalized` etc.) are **not currently present**. Whether to add them is a
Gate C decision requiring the §58 migration plan — and note that adding *columns* changes
the schema, which §21 of the prior phase and §58 of this one both gate.

---

## 4. Existing dictionary capabilities

| Capability | Location | State |
| :--- | :--- | :--- |
| Service | `src/services/dictionary/dictionaryService.ts` (8,920 B) | **PRESENT** |
| — `searchEntries(options)` | clamps `limit` to `[1,100]`, `offset >= 0`; returns clamped values | **PRESENT** |
| — `getEntryDetail(idOrHeadword)` | resolves by id **or** headword | **PRESENT** |
| — `DictionarySearchOptions` | `{query, jlptLevel, isCommon, limit, offset}` | **PRESENT** |
| — `DictionaryDetailedEntry` | `{entry, source, kanji, sentences, relatedGrammar}` | **PRESENT** |
| Entry service (§56 `entryService.ts`) | — | **ABSENT** |
| Query normalizer (§4) | — | **ABSENT** |
| Ranking service (§56 `rankingService.ts`) | — | **ABSENT** |
| Search service (§56 `searchService.ts`) | — | **ABSENT** |
| `src/types/dictionary.ts` | — | **ABSENT** |

`DictionaryService` is a **static class** whose `ensureInitialized()` calls
`KnowledgeCorpusService.ensureSeeded()` and `KnowledgeService.ensureSeeded()` — i.e. it
seeds the 30-entry first-party corpus on first use.

### 4.1 The Tatoeba coupling in the entry path — flag for Gate D/E

`getEntryDetail` performs:

```ts
ilike(exampleSentences.japanese, `%${resolvedEntry.headword}%`)
```

and returns `sentences: exampleSentences[]`. So **the dictionary entry page is already
wired to `example_sentences`.**

`example_sentences` has **three `NOT NULL` text columns** — `reading`, `english`,
`jlpt_level` — plus `source_ref` (`NOT NULL`). A sentence therefore cannot be stored
without a reading, an English translation, and a JLPT level.

Combined with §1 (`Tatoeba NOT AVAILABLE`) and §49 (`sentence architecture = DESIGN ONLY`),
this means: **the entry page's sentence section must degrade to an empty state and must not
be populated.** Any attempt to fill it would require inventing a reading, a translation, or
a JLPT level — three separate fabrications, each prohibited. This is the single most likely
place for the Tatoeba boundary to be violated accidentally.

---

## 5. Existing kanji capabilities

| Capability | Location | State |
| :--- | :--- | :--- |
| Lexical graph service | `src/services/knowledge/kanjiLexicalGraphService.ts` (~970 lines) | **PRESENT** |
| `getKanjiVocabulary` :188 | with `limit`, `commonOnly` | **PRESENT** |
| `getKanjiReadings` :347 | type filter | **PRESENT** |
| `getKanjiComponents` :380 | — | **PRESENT** |
| `getKanjiRadicals` :445 | — | **PRESENT** |
| `getKanjiCompounds` :501 | — | **PRESENT** |
| `getVocabularyKanji` :548 | — | **PRESENT** |
| `getKanjiNeighbors` :591 | related kanji | **PRESENT** |
| `getReadingVocabulary` :668 | — | **PRESENT** |
| `getJLPTVocabularyForKanji` :675 | — | **PRESENT** |
| `getKanjiMindTree` :685 | — | **PRESENT** |
| `getKanjiGraph` :782 | — | **PRESENT** |
| `getKeigoRelations` :909 | **hardcoded 2-key map; unregistered `sourceRef`** (see §10.3) | **PRESENT but defective** |
| `kanjiJmdictLinkage.ts` | linkage service | **PRESENT** |
| Stroke-order **rendering/animation** | — | **ABSENT** — no SVG component, no sanitizer |
| KanjiVG data | `data/kanjivg/` absent; registry entries exist | **NOT PRESENT** |

So §15/§16/§17/§20 (kanji pages, vocabulary, graph navigation) are **substantially
implemented**. §18 (stroke order) is **not** — only `stroke_count` is displayed.

---

## 6. Existing search capabilities

| Layer | Location | Behaviour |
| :--- | :--- | :--- |
| Script detection | `src/services/search/matcher.ts:9` | `empty` / `kanji` / `kana` / `japanese` / `romaji` / `mixed` |
| Query sanitization | `matcher.ts:38` | strips NUL, trims |
| SQL escaping | `matcher.ts:46` | `escapeLikePattern` |
| Relevance | `matcher.ts:53` | exact 1.0 · prefix 0.9 · suffix 0.8 · contains `(0.5 + 0.3·ratio)` |
| Unified search | `src/services/search/unifiedSearchService.ts` (17,530 B) | cross-domain `search()` |
| Dictionary search | `DictionaryService.searchEntries` | `ILIKE` on headword/reading/romaji |
| Reverse translation search | `src/services/translation/reverseSearchService.ts` | ta/ml/en → canonical |
| Sentence matcher (legacy) | `src/etl/sentence/matcher.ts` | **O(N×M) `includes`** — must not be reused |
| Trie lexical matcher | `src/services/sentence/lexicalMatcher.ts` | **O(n·L)** — available for reuse |

### 6.1 §5 assessment — "do not use O(N×M)"

The prompt is correct to raise this. Current state:

- `DictionaryService.searchEntries` issues an `ILIKE '%q%'` query. That is a **full scan**
  on an unindexed column — and a leading-wildcard `LIKE` cannot use a btree index even if one
  existed. This is the actual O(N) per query.
- `src/etl/sentence/matcher.ts` is the literal O(N×M) implementation §5 prohibits. It belongs
  to the legacy Phase 4 ETL and is **not** used by the current API path.
- A trie-based, O(n·L) matcher **already exists** at
  `src/services/sentence/lexicalMatcher.ts` (39 passing tests, database-independent). It was
  built for sentence lexical matching, but its trie is built from arbitrary
  `LexicalMatchTarget[]` — so it is **directly reusable** for dictionary surface matching.

**§57 assessment: there are effectively two search implementations**
(`DictionaryService.searchEntries` and `UnifiedSearchService.search`). They overlap in
purpose but differ in scope. This is documented, not merged — consolidation is a Gate C
proposal requiring authorization, and §57 forbids destructive cleanup without it.

---

## 7. Existing API capabilities

### 7.1 Required by §26 — current state

| §26 endpoint | State | File |
| :--- | :--- | :--- |
| `GET /api/dictionary` | **EXISTS** | `src/app/api/dictionary/route.ts` |
| `GET /api/dictionary/search` | **EXISTS** | `…/dictionary/search/route.ts` |
| `GET /api/dictionary/[id]` | **EXISTS** | `…/dictionary/[id]/route.ts` |
| `GET /api/dictionary/entry/[id]` | **EXISTS** | `…/dictionary/entry/[id]/route.ts` |
| `GET /api/kanji/[character]` | **EXISTS** | `…/kanji/[character]/route.ts` |
| `GET /api/kanji/[character]/vocabulary` | **EXISTS** | `…/vocabulary/route.ts` |
| `GET /api/kanji/[character]/readings` | **EXISTS** | `…/readings/route.ts` |
| `GET /api/kanji/[character]/components` | **EXISTS** | `…/components/route.ts` |
| `GET /api/kanji` | **EXISTS** | `…/kanji/route.ts` |
| `GET /api/search` | **EXISTS** | `…/search/route.ts` |
| `GET /api/knowledge/srs` | **EXISTS** | `…/knowledge/srs/route.ts` |

**All of §26 already exists.** Gate D is therefore an **audit-and-extend** gate, not an
implementation gate. §26's "Preserve existing contracts… Do not silently break clients"
is the governing instruction.

### 7.2 CMS routes (Gate I is largely pre-existing)

| Group | Routes |
| :--- | :--- |
| `cms/dictionary/[id]/*` | 12 — approve, approve-override, archive, audit, publish, request-changes, rollback, schedule, submit, versions (+ base) |
| `cms/translations/[id]/*` | 10 — approve, approve-override, audit, request-changes, submit, verify, versions (+ base) |
| `cms/dictionary`, `cms/translations` | 2 list routes |

**§30 CMS integration is substantially implemented already.** Gate I should verify
publication-state gating, not build from scratch.

### 7.3 Bounded results (§27)

`src/lib/api/routeParams.ts` provides `parseBoundedInt`, `parseLimit`, `parseOffset`,
`parseBooleanFlag`, `errorBody` with `MAX_PAGE_LIMIT = 200`, `DEFAULT_PAGE_LIMIT = 50`,
`MAX_OFFSET = 100_000`. `DictionaryService` clamps to `≤100`. Two-layer bound already exists.

---

## 8. Existing UI capabilities

| Route | Lines | Present capabilities |
| :--- | :--- | :--- |
| `/dictionary` | 364 | search box, autocomplete (`limit=6`), JLPT filter, paginated list (`limit=40`), romaji display, empty-state guidance |
| `/dictionary/[id]` | 262 | header, reading, POS chips, **senses rendered separately (§10 already satisfied)**, kanji links, related grammar, sentence section |
| `/kanji` | 372 | browse/list |
| `/kanji/[character]` | 519 | stroke count, JLPT, on/kun readings, components, vocabulary, radicals |
| `/admin/dictionary` | 29 | thin wrapper |
| `/admin/dictionary/[id]` | 34 | thin wrapper |
| `/admin/review`, `/admin/review/[id]` | — | CMS review workspace |

### 8.1 Component structure

Present: `LanguageSelector.tsx`, `admin/`, `analytics/`, `cms-review/`, `layout/`, `quiz/`.

**Absent: `dictionary/`, `kanji/`, `stroke/`, `keigo/`, `mobile/`.** The dictionary and kanji
pages are monolithic (364–519 lines) with inline types. Extracting components is a
**refactor**, which §63 lists under "do not perform broad refactors" — so this is recorded
as a finding, not a Gate E task.

§10 (sense separation) is **already implemented** — `senses.map(...)` renders each sense
separately. That required deliverable is satisfied.

---

## 9. Gate-by-gate readiness (§55)

| Gate | Deliverable | Readiness here |
| :--- | :--- | :--- |
| **A** | this report | **COMPLETE** |
| B | 3 architecture docs | **PARTIAL** — 2 of 3 already exist (see §10.1); 1 absent |
| C | normalization, search, ranking, DTO | **ABSENT** — all 5 files missing. Implementable and testable against pure functions + seed data |
| D | dictionary APIs | **PRE-EXISTING** — audit/extend, do not rebuild |
| E | dictionary UI | **PRE-EXISTING** — `/dictionary`, `/dictionary/[id]` exist |
| F | kanji UI + APIs | **PRE-EXISTING** — except stroke order (§18), which is **DATA-BLOCKED** |
| G | favorites, history, SRS refs | **PARTIAL** — SRS tables and `/review/*` exist; dictionary favorites/history **ABSENT** |
| H | multilingual | **PRE-EXISTING** — `entity_translations` + `TranslationService` + `ReverseSearchService` |
| I | CMS | **PRE-EXISTING** — 24 CMS routes, publication resolver |
| J | AI retrieval | **PRE-EXISTING in part** — `src/services/ai/` (7 files), `knowledge-retrieval.test.ts` |
| K | mobile contract | **PRE-EXISTING** — `MOBILE-DICTIONARY-API-CONTRACT.md` (575 lines), `src/types/mobileDictionary.ts`; DTOs not yet split per §28 |
| L | performance | **NOT MEASURABLE HERE** — no database |
| M | final QA | Toolchain runnable; DB-dependent checks not |

**Six of twelve gates are wholly or mostly pre-existing.** The genuine new work is Gates
B (1 doc), C (search foundation), and parts of G.

---

## 10. Conflicts and duplicates (§57)

### 10.1 Document overlap — `DICTIONARY-SEARCH-RANKING.md` would duplicate an existing doc

| §55/§56 target | Existing counterpart | Verdict |
| :--- | :--- | :--- |
| `DICTIONARY-FEATURE-MATRIX.md` (§47) | **`docs/architecture/DICTIONARY-FEATURE-MATRIX.md`** (71 lines, "…& Takoboto Parity Checklist", Phase 14.4A) | **EXISTS — extend** |
| `DICTIONARY-KNOWLEDGE-GRAPH.md` (§48) | **`docs/architecture/DICTIONARY-KNOWLEDGE-GRAPH.md`** (214 lines) | **EXISTS — extend** |
| `DICTIONARY-SEARCH-RANKING.md` (§7) | **`docs/architecture/DICTIONARY-SEARCH-ARCHITECTURE.md`** (207 lines) already specifies the 9-layer pipeline, the deterministic comparator, and the ranking stages | **WOULD DUPLICATE** |

Per §57, creating `DICTIONARY-SEARCH-RANKING.md` as a new file would produce a **competing
specification** for ranking. Recommendation: **extend `DICTIONARY-SEARCH-ARCHITECTURE.md`**
and only create a separate ranking document if it can be shown to be a distinct concern.

### 10.2 Duplicated code helpers

| Helper | Definitions | Note |
| :--- | :--- | :--- |
| `extractKanjiCharacters` | `src/etl/dictionary/types.ts:305`, `src/services/knowledge/kanjiLexicalGraphService.ts:64` | 2 copies |
| `katakanaToHiragana` | `src/services/knowledge/kanjiJmdictLinkage.ts:45`, `kanjiLexicalGraphService.ts:113` | 2 copies |
| `KANJI_REGEX` | `src/etl/dictionary/types.ts:303`, `kanjiLexicalGraphService.ts:37`, `src/services/search/matcher.ts:3` | **3 copies, and they disagree** |

**The regex disagreement is a live latent bug.** Two copies include the compatibility
ideographs range `\uF900-\uFAFF`; `src/services/search/matcher.ts` omits it. So
`detectSearchScript` classifies a compatibility ideograph differently from
`extractKanjiCharacters` in the same request path. Deterministic normalization (§4) must not
inherit this inconsistency.

### 10.3 Known defects carried forward (previously recorded, not repaired)

| Defect | Location | Impact on this phase |
| :--- | :--- | :--- |
| `normalizeJlpt("2024-07")` → `"N2"` | `src/etl/dictionary/types.ts:286` | §7 ranking must not consume levels derived this way |
| Literal `"NONE"` stored in `jlpt_level` (`NOT NULL`) | `transformer.ts:250` | **`"NONE"` is truthy** — any `jlptLevel && …` filter mislabels. §8's DTO needs an explicit `jlptKnown` flag |
| Keigo `sourceRef` unregistered while status is `published` | `kanjiLexicalGraphService.ts:922–947` | §19/§31 provenance |
| `VERIFIED_KEIGO_MAP` hardcoded, 2 keys | same | §16 coverage |
| Three reading-type vocabularies | `lexicalGraph.ts:85`, `:253` | §15 must not cross-compare |
| Two JLPT section vocabularies | schema `:54`, `:137` | — |
| `correct_answer` unconstrained vs `options` | schema `:88` | — |

### 10.4 Stale artifact that contradicts source

**`docs/architecture/DICTIONARY-FEATURE-MATRIX.md` is stale.** Measured against the code:

| Matrix claim | Actual state |
| :--- | :--- |
| "Kanji Components / Primitives — **PLANNED**, scheduled for Phase 14.4B" | **COMPLETE** — `kanji_composition` table + `getKanjiComponents` + `/api/kanji/[character]/components` |
| "Stroke Count & Stroke Order SVGs — **DATA-BLOCKED**, blocked on Phase 14.4C" | Partly wrong — 14.4C/14.4D are **complete**; `strokeCount` renders on `/kanji/[character]`. Only *SVG rendering* remains absent, because the KanjiVG **artifact** is absent |
| "Exact & partial search over **206,717** JMdict entries" | **Not re-measurable here** — corpus absent |
| Other counts (22,233 / 35,468 / 3,564 / 29,350) | **Not re-measurable here** |

Also, §47's required columns are mostly missing from the existing matrix:

| §47 column | In existing matrix |
| :--- | :--- |
| Feature | present |
| Current state | **ABSENT** |
| Source | **ABSENT** |
| Implemented? | present ("NihongoBridge Status") |
| API | present |
| UI | present |
| Mobile | present |
| Tests | **ABSENT** |
| Provenance | **ABSENT** |
| Future dependency | **ABSENT** |

Per §46 ("Do not reuse historical counts without measuring the current database") the
unverifiable counts must be marked **UNVERIFIED**, not carried forward as fact.

---

## 11. Recommended integration points

| Gate | Recommended approach | Rationale |
| :--- | :--- | :--- |
| **B** | **Extend** `DICTIONARY-KNOWLEDGE-GRAPH.md` and `DICTIONARY-FEATURE-MATRIX.md`; add ranking to `DICTIONARY-SEARCH-ARCHITECTURE.md` rather than a new ranking doc | §57 — avoid a competing specification |
| **C** | Create `queryNormalizer.ts` + `src/types/dictionary.ts` as **pure, DB-independent** modules; **reuse** `kanaToRomaji` (`etl/dictionary/romaji.ts`) and unify the duplicated helpers behind one module | Pure modules are testable here, unlike data-layer code |
| **C** | For surface matching, **reuse the existing trie** in `src/services/sentence/lexicalMatcher.ts` rather than writing a second matcher | §57; it is already O(n·L) and tested |
| **C** | Defer the four derived search columns to a §58 migration plan | Adding columns is a schema change |
| **D** | **Audit only.** All four endpoints exist. Verify bounds, error codes, determinism | §26 |
| **E** | **Verify only.** `/dictionary`, `/dictionary/[id]` exist; §10 sense separation already works | §63 (no broad refactors) |
| **F** | Verify kanji pages + 3 subroutes. **Defer stroke order** — needs the KanjiVG artifact (a 14.5B-era bootstrap) plus storage | §18 cannot be satisfied from present data |
| **G** | Dictionary favorites/history are **new**. Reuse `users` + existing SRS tables; do **not** create a second user system (§23) | — |
| **I** | Verify the publication resolver's gating; 24 CMS routes already exist | §30 |
| **J** | Build on `src/services/ai/` (7 files) + `knowledge-retrieval.test.ts` | Reuse |
| **L** | **BLOCKED here** — no database. Requires a disposable loopback DB | §35 "measure rather than claim" |

### 11.1 Hard boundaries for every later gate

```
Tatoeba                    : NOT AVAILABLE — do not acquire, substitute, mirror, or fabricate
Example sentences          : empty state only; `example_sentences` needs reading+english+jlpt (all NOT NULL)
JLPT levels                : never inferred; `"NONE"` is truthy and must be treated as unknown
Canonical tables           : dictionary_entries / kanji_entries / kanji_radicals / kanji_composition — immutable
Schema changes             : require reports/gates/TAKOBOTO-DICTIONARY-SCHEMA-MIGRATION-PLAN.md + authorization
Production                 : no writes, no migration, no deploy
```

---

## 12. Missing capabilities (consolidated)

| # | Missing | Gate | Why it matters |
| :--- | :--- | :--- | :--- |
| 1 | `queryNormalizer.ts` + `NormalizedDictionaryQuery` (§4) | C | No unified normalization; logic is scattered across ETL |
| 2 | Deterministic ranking service (§7) | C | Ranking is currently an ad-hoc `calculateRelevance` |
| 3 | Stable `DictionarySearchResult` DTO (§8) | C | API leaks `$inferSelect` shapes (`DictionaryDetailedEntry.entry`) |
| 4 | `src/types/dictionary.ts` | C | Types are inline per route/module |
| 5 | `DICTIONARY-SEARCH-RANKING.md` | B | — but see §10.1 (overlap) |
| 6 | Indexes on `dictionary_entries` / `kanji_entries` (§36) | post-C | Only 5 of 30 tables have indexes |
| 7 | DTO split per §28 (`DictionaryDTO`, `KanjiDTO`, …) | K | `mobileDictionary.ts` exists; full DTO set does not |
| 8 | Stroke-order rendering/animation (§18) | F | Needs KanjiVG artifact — **not present** |
| 9 | Dictionary favorites / history / study-list (§23/§24) | G | SRS layer exists; dictionary-side actions do not |
| 10 | Quality flags (§52) | — | `src/services/dataquality/` provides generic checks; dictionary-specific flags not wired |
| 11 | Export contract (§53) | — | Absent |
| 12 | Search analytics (§32) | — | `user_analytics` exists; search analytics not wired |
| 13 | Zero-result pipeline (§33) | C | Absent |
| 14 | Typo tolerance (§34) | C | Absent (and must stay conservative) |
| 15 | `TatoebaProvider` boundary (§50) | — | Absent as an interface |

---

## 13. Baseline verdict

| Question | Answer |
| :--- | :--- |
| Does a dictionary platform exist? | **YES** — substantial: 5 dictionary APIs, 4 kanji APIs, 2 major UI routes, 24 CMS routes, translation architecture |
| Is most of this prompt greenfield? | **NO** — ~6 of 12 gates are largely pre-existing |
| Is the JMdict corpus available here? | **NO** — 30 first-party seed entries only; `data/` absent; no database |
| Can §46 (measured data quality) be produced? | **NO** — BLOCKED, no database to measure |
| Can §35 (performance) be measured? | **NO** — BLOCKED, no database |
| Is a schema migration needed right now? | **NO** — deferred to Gate C, and only with a §58 plan |
| Does any conflict block safe progress? | **NO** — overlaps are documented; nothing requires destructive resolution |
| Was anything modified? | **NO** — read-only |

**Gate A status: COMPLETE.** Awaiting authorization for Gate B.

---

## Appendix — files inspected

**Schema/migrations**: `src/db/schema.ts` (943 lines, 30 tables), `drizzle/*.sql` (4),
`drizzle/meta/_journal.json`

**Services**: `dictionary/dictionaryService.ts`, `search/{matcher,types,unifiedSearchService}.ts`,
`knowledge/kanjiLexicalGraphService.ts` (~970), `knowledge/{corpusService,knowledgeService,kanjiJmdictLinkage}.ts`,
`translation/{translationService,reverseSearchService}.ts`, `sentence/{lexicalMatcher,offsetContract,types}.ts`,
`publication/*` (5), `dataquality/*` (3), `ai/*` (7)

**ETL**: `etl/dictionary/{types,romaji,transformer,xmlParser,loader,persistenceAdapter}.ts`,
`etl/sentence/*`, `etl/grammar/*`, `etl/kanji/*`

**API**: 72 route handlers (inventory in §7)

**UI**: 21 pages (inventory in §8)

**Data**: `src/data/{kana,kanji,lexicon}.ts` — **74 KB, 30 dictionary entries measured**

**Tests**: 46 files (15 dictionary/kanji/search/translation-related)

**Docs**: 19 `docs/architecture/*.md` (inventory in §10.1)

**Prior reports**: `reports/gates/*` (38 on this branch)
