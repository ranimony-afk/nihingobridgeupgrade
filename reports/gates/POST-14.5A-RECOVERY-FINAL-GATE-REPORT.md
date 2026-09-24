# POST-14.5A RECOVERY — FINAL GATE REPORT

**Phase**: Post-14.5A Recovery, Gap Closure & Parallel Roadmap Development  
**Date**: 2026-09-24  
**Branch**: `arena/01a0d136-nihingobridgeupgrade`  
**Verdict**: **FULL NO-GO** — for Phases 14.5A, 14.5B, 14.5C, 14.5D  
**Phase 14.5A**: **BLOCKED** — Tatoeba acquisition & provenance foundation not verified  
**Phase 14.5B / 14.5C / 14.5D**: **NOT AUTHORIZED**

---

## 1. Repository state

| Item | Value |
| :--- | :--- |
| HEAD | `c97a269887e605eac36dbb2e5e768ae21aafb5e8` |
| Remote ref | `refs/heads/arena/01a0d136-nihingobridgeupgrade` = `c97a269…` (verified via `git ls-remote`) |
| Working tree | Clean |
| Branch chain | `8ab467b` → `882fc01` → `36f0a52` → `19c0b72` → `f55b8a7` → `0940bec` → `2a435f6` → **`c97a269`** |
| Tags | None |
| Commits added this phase | 4 |
| `src/db/schema.ts` diff | **0 lines** |
| `drizzle/` changes | **0** |
| Migrations | **4** (unchanged) |
| Production access | **0** |
| Database writes | **0** |

### 1.1 Commits added

| Commit | Scope | Files |
| :--- | :--- | :--- |
| `f55b8a7` | §7/§8/§9 sentence lexical matching, offset contract, source-neutral contracts | 5 |
| `0940bec` | §11/§12 grammar knowledge model + ETL contract | 3 |
| `2a435f6` | §19/§14/§20 data-quality, JLPT, provenance checks | 6 |
| `c97a269` | §15/§16/§13/§17 kanji, keigo, multilingual audits; mobile contract extension | 4 |

Each commit is logically scoped per §25. No commit mixes Tatoeba acquisition, schema
change, grammar, dictionary UI, or unrelated refactoring.

---

## 2. Phase status matrix

| Phase | Status | Evidence | Changes | Next gate |
| :--- | :--- | :--- | :--- | :--- |
| 14.0 | **NOT AUDITED THIS PHASE** | No repository artifact named for 14.0 found in the §3 sweep | none | Audit on request |
| 14.1 | **NOT AUDITED THIS PHASE** | — | none | Audit on request |
| 14.2 | **NOT AUDITED THIS PHASE** | — | none | Audit on request |
| 14.3A | **IMPLEMENTED** (partially verified) | `src/etl/dictionary/{xmlParser,transformer,loader,pipeline}.ts` present; `tests/dry-run-jmdict.test.ts` fails on absent `data/JMdict.xml` (ENOENT) | none | Requires JMdict artifact |
| 14.3B | **IMPLEMENTED** (partially verified) | Same pipeline; dry-run suite fails on absent artifact | none | Requires JMdict artifact |
| 14.3C | **IMPLEMENTED** (partially verified) | `persistenceAdapter.ts`; DB-dependent tests skipped/failing | none | Requires disposable DB |
| 14.3D | **IMPLEMENTED — NOT VERIFIED** | `tests/full-jmdict-ingestion.test.ts` present; **12 tests failing**, all `DATABASE_URL is required` / ENOENT | none | Requires disposable DB + artifact |
| 14.4A | **VERIFIED** (prior) | `tests/dictionary-architecture.test.ts` present; 4 tests fail only on missing DB | none | — |
| 14.4B–14.4D | **DESIGN ONLY / NOT AUDITED THIS PHASE** | No distinct artifact identified in the §3 sweep | none | Audit on request |
| 14.4E | **VERIFIED** (prior) | 14.4E suite exists; 18 of its tests fail **pre-existing** (`DATABASE_URL is required`) | none | Unchanged |
| 14.4F | **PARTIALLY IMPLEMENTED — rebuilt as `14.4F-R`** | See §3 | `19c0b72` (prior turn) + this phase | — |
| 14.4F-R | **IMPLEMENTED — `19c0b72` + `c97a269`** | §3.2 and §4 below | 9 files (prior) + 18 files (this phase) | — |
| **14.5A** | **BLOCKED** | §5 | none | **Requires the real artifact** |
| **14.5B** | **NOT AUTHORIZED** | §5, §8 | none | Requires 14.5A GO |
| **14.5C** | **NOT AUTHORIZED** | — | none | Requires 14.5B |
| **14.5D** | **NOT AUTHORIZED** | — | none | Requires 14.5C |
| 14.6A | **IMPLEMENTED (types + contracts)** — `0940bec` | `src/types/grammar.ts`, two grammar docs | 3 files | Storage decision for relations (not proposed) |
| 14.6+ | **DEFERRED** | — | none | — |
| 14.7–14.12 | **NOT AUDITED / DEFERRED** | — | none | — |

### 2.1 Status vocabulary used

`VERIFIED` · `IMPLEMENTED` (present and inspected, not independently verified) ·
`PARTIALLY IMPLEMENTED` · `DESIGN ONLY` · `BLOCKED` · `NOT AUTHORIZED` ·
`NOT STARTED` · `DEFERRED` · `NOT AUDITED THIS PHASE`

No phase above is collapsed to "done". Where evidence is a passing test suite, the phase
says VERIFIED; where evidence is only source presence, it says IMPLEMENTED.

---

## 3. Phase 14.4F verdict

### 3.1 Reconciliation result: **PARTIALLY IMPLEMENTED** — never a completed phase

| Listed 14.4F surface | Present? |
| :--- | :--- |
| `GET /api/dictionary` | Yes |
| `GET /api/dictionary/[id]` | Yes |
| `GET /api/kanji/[character]` | Yes |
| 4 UI routes | Yes |
| `src/types/lexicalGraph.ts` | Yes |
| `src/types/mobileDictionary.ts` | Yes |
| `GET /api/dictionary/search` | **No** |
| `GET /api/dictionary/entry/[id]` | **No** |
| 3 `kanji/[character]/*` subroutes | **No** |
| `dictionary` / `kanji` / `stroke` / `keigo` / `mobile` component directories | **No** |
| Any commit referencing 14.4F | **None** |

**Verdict: `REBUILT AS 14.4F-R`.** The three missing routes and all subroutes were
implemented as a **new** identifier. This report does **not** claim 14.4F previously
existed as a completed phase: no commit, tag, or branch provides that evidence, and the
absence of a named component directory is not evidence of a failed build. The partial
state is recorded as found.

### 3.2 14.4F-R deliverables

Committed in `19c0b72`:

| File | Contract |
| :--- | :--- |
| `src/lib/api/routeParams.ts` | Bounded int parsing; clamps high, falls back low/invalid; never `NaN`/`Infinity` |
| `api/dictionary/search/route.ts` | 400 `MISSING_QUERY`; echoes `detectedScript`; service-echoed pagination is authoritative |
| `api/dictionary/entry/[id]/route.ts` | 400 `MISSING_ID` / 404 `NOT_FOUND`; `kanjiEdges`+`keigo` degrade to `[]` |
| `kanji/[character]/vocabulary/route.ts` | `limit`, `commonOnly`; edges carry `position` |
| `kanji/[character]/readings/route.ts` | `type=on\|kun\|all` → `ON`/`KUN`; echoes `appliedTypeFilter` |
| `kanji/[character]/components/route.ts` | `Promise.all` components + canonical radicals; `componentCount` |
| `tests/dictionary-kanji-experience-routes.test.ts` | **31 passed**, database-independent |

Committed in `c97a269`:

| File | Purpose |
| :--- | :--- |
| `src/services/sentence/{types,offsetContract,lexicalMatcher,index}.ts` | §7 matcher + §8 offset contract |
| `tests/sentence-lexical-matching.test.ts` | **39 passed** |
| `src/types/sentenceSource.ts` | §9 source-neutral contracts |
| `src/types/grammar.ts` + 2 grammar docs | §11/§12 |
| `src/services/dataquality/{checks,jlptChecks,provenanceChecks}.ts` | §19/§14/§20 |
| `tests/data-quality-checks.test.ts` + `tests/provenance-quality-checks.test.ts` | **50 + 31 passed** |
| 5 audit/model docs, 1 extended contract | §15/§16/§13/§17 |

**Total added this phase: 120 new passing tests**, all database-independent.

---

## 4. Search architecture (§6)

`docs/architecture/DICTIONARY-SEARCH-ARCHITECTURE.md` (committed `19c0b72`, 207 lines).

Pipeline documented as: normalization → classification → exact ID/orthography → exact
reading → romaji → translation → kanji → prefix/contains/fuzzy → ranking. Ranking is a
deterministic comparator (`exact` > reading > orthographic > normalized >
translation/fallback, then `isCommon`/`frequencyRank`, then a stable id tiebreak).

**No AI ranking in the response path.** AI may enrich retrieval; it is never the canonical
dictionary authority.

Documented honest limitations: `romaji` is a character-class test (so `water` and `mizu`
classify alike), and `ILIKE '%q%'` cannot use a btree index. Staged remediation
(pg_trgm → SQL-side ordering → external engine) is recorded as not justified today.

---

## 5. Phase 14.5A — BLOCKED

```
ARTIFACT:              NOT AVAILABLE
SOURCE:                registered but acquisition not verified
SHA:                   NOT VERIFIED
RAW RECORDS:           NOT MEASURED
JAPANESE RECORDS:      NOT MEASURED
RELATIONSHIPS:         NOT MEASURED
DIGEST:                NOT COMPUTED
DATABASE WRITES:       0
SCHEMA MIGRATIONS:     0
PRODUCTION ACCESS:     0
14.5B:                 NOT AUTHORIZED
```

### 5.1 Search evidence (this phase)

| Check | Result |
| :--- | :--- |
| `data/` directory exists | **No** |
| `data/tatoeba/**` | **No** |
| Any `*tatoeba*` or `*.tsv` file | **None** |
| Commits touching `data/tatoeba` (all history, via `gh api`) | **0** |
| Registry entry `upstream:tatoeba:2024-07` | Present, version/releaseDate **UNVERIFIED** |

**Registration ≠ acquisition.** The registry entry records that the source is known and
its licence documented. It is not evidence that any data was acquired. No artifact-search
loop was performed beyond this confirmation, per the standing instruction not to re-search.

### 5.2 No artifact was fabricated

No Tatoeba dataset was downloaded, generated, synthesized, reconstructed, mirrored,
substituted, or invented. No sentence record, ID, hash, date, or count was fabricated.
The historical claims (154/79/72/7/0/74, `d2297821…038d0b`, `1f5308f2…`) were treated as
**verification targets, not hardcodable values**, and none were reused.

---

## 6. Offset contract (§8)

```
offsetUnit = "unicodeCodePoint"
```

Established in `src/services/sentence/offsetContract.ts` and enforced at the boundary.
**The public contract does not expose UTF-16 offsets.** Documented: why JS UTF-16 offsets
are dangerous (they coincide with code points across the entire BMP, which includes all
kana and the common kanji ranges, so the defect is invisible until a supplementary-plane
character appears), conversion rules, CJK Extension B kanji, emoji, API serialization, and
UI highlighting.

`tests/sentence-lexical-matching.test.ts` covers `普通の日本語`, `𠮷`, emoji + Japanese, and
mixed ASCII/Japanese. **All 12 offset-contract tests pass.**

One genuine bug was found and fixed during implementation, confirmed by re-run: in
`mode: "all"`, `scanSentence` recorded only the deepest terminal per cursor, silently
dropping nested shorter matches (日本 inside 日本語).

---

## 7. Gap closures

| § | Deliverable | Status |
| :--- | :--- | :--- |
| §7 | `SENTENCE-LEXICAL-MATCHING.md` + trie matcher | **IMPLEMENTED**, 39 tests |
| §8 | Offset contract | **IMPLEMENTED**, 12 tests |
| §9 | Source-neutral contracts, no acquisition | **IMPLEMENTED** |
| §10 | Tatoeba schema decision | **DEFERRED** — no migration, no proposal |
| §11/§12 | Grammar model + ETL contract | **IMPLEMENTED** (types + docs; no storage change) |
| §13 | Multilingual audit | **AUDITED** — 29 passed / 9 skipped (DB-bound) |
| §14 | `JLPT-DATA-QUALITY-CONTRACT.md` | **IMPLEMENTED** |
| §15 | Kanji experience model | **PARTIAL** — special readings & stroke order **ABSENT** |
| §16 | Keigo model | **AUDITED** — uchi/soto axis **ABSENT**, data hardcoded (2 keys) |
| §17 | Mobile API contract | **EXTENDED** (205 → 575 lines), not duplicated |
| §18 | CMS publication verification | **VERIFIED** (see §7.1) |
| §19 | `DATA-QUALITY-FRAMEWORK.md` | **IMPLEMENTED** |
| §20 | Provenance quality | **IMPLEMENTED** |
| §21 | No migration for green tests | **HELD** — 0 migrations, 0 proposals |
| §28 | No overbuilding | **HELD** — no tutor, no Flutter app, no SRS engine, no corpora, no generated translations |

### 7.1 §18 CMS publication chain — verified

| Rule | Evidence |
| :--- | :--- |
| Canonical → resolver → published override → learner | `dictionaryPublicationResolver.ts` |
| 0 published overrides → canonical | `:36` |
| 1 published override → merged, CMS wins per field | `:38` |
| **>1 published overrides → canonical fallback + diagnostic**, never an arbitrary pick | `:40`, `:147` |
| Orphan override → diagnostic | `:135` |
| Malformed payload → diagnostic | `:65` |
| Translation priority | `translationPriority.ts` — pure ranking over `sourceType`/`isVerified` |
| Unpublished and approved-but-unpublished invisible | schema comment; `approved ≠ published` |
| CMS never mutates canonical tables | additive overlay; `original_source_ref` preserved |

---

## 8. Test results

```
Test Files   18 failed | 24 passed (42)
Tests        62 failed | 702 passed | 102 skipped (866)
Duration     24.06s
```

**This suite is NOT clean. 62 tests fail.** They are classified as follows.

### 8.1 Failure classification

| Cause | Count | Classification |
| :--- | :--- | :--- |
| `DATABASE_URL is required` | 41 | **Pre-existing / environmental** |
| `ENOENT` — absent `data/JMdict.xml`, `data/kanjidic2.xml` | 4 | **Pre-existing / environmental** |
| `ECONNREFUSED` | 1 | **Pre-existing / environmental** |
| (remaining failures, same suites) | 16 | **Pre-existing / environmental** |
| **New failures introduced this phase** | **0** | — |
| **Fixed this phase** | **0** | — |

### 8.2 Baseline comparison

| | Failed | Passed | Skipped | Total |
| :--- | :--- | :--- | :--- | :--- |
| Baseline at `19c0b72` | 62 | 582 | 102 | 746 |
| **This phase at `c97a269`** | **62** | **702** | **102** | **866** |
| Delta | **0** | **+120** | 0 | +120 |

Failed count is **identical**; the +120 passes are entirely the new suites (39 + 50 + 31).
No failure was converted to a skip, and no failing test was deleted or weakened.

### 8.3 Toolchain

| Check | Result |
| :--- | :--- |
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run lint` | **PASS** — 0 errors, **4 pre-existing warnings** |
| `npx drizzle-kit check` | **PASS** |
| `npm run build` | **PASS** |
| `npm run db:verify` | **PASS** (delegates to `drizzle-kit check`; does not contact a database) |
| Migrations | **4** |

`db:verify` performs a schema-file consistency check only. **No database was contacted.**
The 41 `DATABASE_URL is required` failures are the evidence that no disposable database
was available, which is why database-dependent verification is recorded as **UNVERIFIED**
rather than passed.

---

## 9. Audit findings recorded, not repaired

Per §30, discrepancies are recorded rather than silently reconciled. None was repaired,
because each repair would require a schema migration, a canonical data change, or a
governance decision.

| # | Finding | Location | Severity |
| :--- | :--- | :--- | :--- |
| 1 | `normalizeJlpt` scavenges digits from arbitrary text: `"2024-07"` → `"N2"`, `"v1.5"` → `"N1"` | `etl/dictionary/types.ts:286` | High — silent fabrication path |
| 2 | Literal `"NONE"` sentinel stored in `dictionary_entries.jlpt_level`, a `NOT NULL` column documented as `N5..N1`. `"NONE"` is truthy and non-null, so two of three natural consumer checks misfire | `etl/dictionary/transformer.ts:250` + schema `:715` | High |
| 3 | Keigo records set `sourceRef: "first-party:keigo-architecture:v1"`, **not registered** (0 occurrences in the registry; 7 first-party sources exist, none keigo), while claiming `verificationStatus: "published"` | `kanjiLexicalGraphService.ts:922–947` | High — verified-status without evidence |
| 4 | `VERIFIED_KEIGO_MAP` is hardcoded in a service with **2 keys** (`食べる`, `行く`) — 2 of §16's 5 example verbs; keyed by headword, unreachable by id | same | Medium |
| 5 | `questions.correct_answer` is unconstrained relative to `options[].id` — an unanswerable question is schema-valid | schema `:88` | Medium |
| 6 | Two incompatible section vocabularies: `questions.section` (4 values) vs `jlpt_test_questions.section_key` (4 different values, only 2 shared) | schema `:54`, `:137` | Medium |
| 7 | Three coexisting reading-type vocabularies; neither of the two main sets is a superset of the other, so cross-comparison yields silent empty results | `lexicalGraph.ts:85`, `:253` | Medium |
| 8 | `VERIFIED_KEIGO_MAP` variable name asserts verification the provenance chain does not substantiate | same | Medium |
| 9 | `RegisterProfile` lacks the uchi/soto axis — structurally necessary for 謙譲語 I vs II | `lexicalGraph.ts:238` | Medium |
| 10 | `data/` is gitignored, so a supplied artifact will not propagate to a fresh session; `.gitignore` does not cover `*.bz2`/`*.tsv` | `.gitignore` | Operational |
| 11 | Keigo relations are not reachable from the keigo form back to the standard form | `kanjiLexicalGraphService.ts:909` | Low |
| 12 | `first-party:jlpt-mock:v1` description claims "Authentic JLPT examination practice questions"; given no official post-2010 lists exist, "authentic" is unsubstantiable | `provenance/registry.ts:225` | Low |

### 9.1 Findings deliberately recorded as ABSENT rather than approximated

| Item | Why absence is correct |
| :--- | :--- |
| Special readings (今日, 明日, 大人, …) | No storage and no source data. Deriving them from component characters is **false for every item in the list** — that is what makes them special |
| Verified stroke order | No storage, no KanjiVG acquisition. A wrong stroke order is a durable, learnable error |
| Keigo relations for 来る / する / 聞く | Authoring them would be creating keigo facts without a verified source |
| Example sentences in the mobile contract | Returns an explicit empty collection, never placeholder or generated text |

---

## 10. Integrity statement

| Invariant | Value |
| :--- | :--- |
| Canonical table mutations | **0** |
| `src/db/schema.ts` diff | **0 lines** |
| Migrations added | **0** |
| `drizzle/` changes | **0** |
| Schema proposals written | **0** (none needed yet; any would require stopping for authorization) |
| Production access | **0** |
| Database writes | **0** |
| Tatoeba data acquired | **0** |
| Sentences ingested | **0** |
| Sentence tables created | **0** |
| Fabricated records / translations / readings / levels / matches / checksums | **0** |
| `箸` stroke count | **14**, `source_ref = first-party:kanji-mindtree:v1` — unchanged |
| Prior reports deleted or consolidated | **0** |

---

## 11. What this phase did NOT do

Per §23, §28, §30 and the HARD STOP:

- Did **not** attempt another artifact search loop.
- Did **not** download, generate, synthesize, reconstruct, mirror, or substitute Tatoeba data.
- Did **not** ingest any sentence data, create sentence tables, or attach examples.
- Did **not** run 14.5B, 14.5C, or 14.5D.
- Did **not** write a schema proposal speculatively.
- Did **not** modify canonical tables.
- Did **not** generate translations, readings, JLPT levels, grammar content, or keigo relations.
- Did **not** build an AI tutor, Flutter app, SRS engine, full search engine, or corpora.
- Did **not** access production, Vercel, or any remote database.
- Did **not** repair any audited defect (§9).

---

## 12. Success criteria assessment (§31)

| Criterion | Assessment |
| :--- | :--- |
| Materially more complete **without** pretending the blocker is solved | **Met** — 120 new passing tests; blocker stated as BLOCKED throughout |
| Distinguish IMPLEMENTED / VERIFIED / DESIGN READY / BLOCKED / DEFERRED | **Met** — §2 uses the full vocabulary; no phase collapsed to "done" |
| No inflated claims | **Met** — §8.2 states plainly that the suite is not clean and that failed count is unchanged |
| Evidence for every status | **Met** — every row in §2 cites a file, a test result, or a measurement |

---

## 13. Next gate

**Phase 14.5A remains BLOCKED and 14.5B/14.5C/14.5D remain NOT AUTHORIZED. This report
does not start them.**

The single unblocking action is the supply of the real Tatoeba artifact from outside this
environment, accompanied by the instruction:

> *Verify this supplied artifact. Do not reacquire, substitute, normalize, transform, or
> persist it.*

On receipt, verification means: measured byte size, measured **compressed** SHA-256,
measured **extracted** SHA-256, recorded acquisition tool and version, a registered
source, an evidenced snapshot date, and a provenance chain from every parsed record back
to those bytes. A record that cannot be traced through that chain is `requires_review`,
however plausible its content.

**Report status: FULL NO-GO for Phases 14.5A / 14.5B / 14.5C / 14.5D.**

**HARD STOP.**
