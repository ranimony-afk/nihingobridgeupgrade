# M9A — MindTree Element-Filter Defect Resolution and 2,500-Kanji Expansion Architecture

- **Document**: `reports/kanji-mindtree/M9A-ELEMENT-FILTER-AND-2500-KANJI-EXPANSION-FOUNDATION.md`
- **Role coverage**: Principal Architect, QA/Accessibility Engineer
- **Branch**: `arena/b8d97f5b-nihingobridgeupgrade` (from baseline merge commit `23546cf4966fbc6321c72af2ee1313c7c3af0b3a`)
- **Date**: 2026-10-29
- **Deployment status**: **Nothing was pushed, merged, or deployed.** No migration was applied to any shared or production database. All database work used a disposable, loopback-only PostgreSQL instance. All browser evidence was produced against a **local production build** (`next build` + `next start`); deployed-browser testing was not executed (see §8.4).

---

## 1. Executive Summary and Scope Status

**Owner-reported defect (reproduced and closed).** Selecting the element 丁 in the kanji browser showed a palette count of 1 while the result grid rendered *“No kanji match this filter.”* The defect was reproduced against a disposable database, traced to its root causes (§2), fixed behind a single documented contract (§4), and locked by regression tests (§7) plus a 49-check real-browser acceptance run (§8).

**Contract in one line:** the palette badge equals the number of characters the same request returns — `visibleKanjiCount === filteredTotal` — for every element × level × keyword combination; zero results always carry a machine-readable reason; reset actions clear only the facet they name.

**2,500 kanji**: this phase delivers the *architecture and gate plan* only (§9–§11). **No additional characters were imported, and 2,500 kanji is not implemented.** Nothing in this report should be read as a claim that the 2,500-character target exists in any runtime: the source, relationship, integrity, and runtime gates for that target have not been run because their inputs (pinned Jōyō/frequency lists, full KanjiVG/KANJIDIC2 derivations into a target manifest) are not provisioned in this phase.

**Gate scoreboard (this branch, local environment):**

| Gate | Result |
|---|---|
| MindTree isolated suite (M4–M9a, incl. 9 new M9A tests) | **47/47 pass** |
| M1 graph contract (`tests/kanji-mindtree-contract.test.mjs`) | **21/21 pass** |
| M9A pure contract tests (`tests/kanji-element-filter.test.ts`) | **34/34 pass** |
| M9A DB service + route tests (`tests/kanji-element-filter-service.test.ts`) | **14/14 pass** |
| Kanji expansion ETL suite | **5/5 pass** |
| TypeScript (`tsc --noEmit`) | **0 errors** |
| ESLint | **0 errors**, 3 pre-existing warnings (unchanged from baseline) |
| Source integrity (`scripts/report-kanji-mindtree-source-refresh.ts`) | **PASS_LOCAL_ARTIFACTS**, both slice hashes match |
| Production build (`next build`) | **114 static pages, exit 0** |
| Browser acceptance (local production build, real Chromium) | **49/49 pass** (`reports/kanji-mindtree/m9a-browser-acceptance-log.json`) |
| Full DB suite (`vitest run`, 1,376 tests) | 1,239 pass / 80 fail / 57 skip — **0 failures in any M9A-touched or M9A-added file**; all 80 attributed in §13.2 |

**Category-discrimination standing rule (honored throughout):** Jōyō, frequency-supplementary, JLPT, and outside-catalog are four distinct categories and are never equated. Grade, JLPT, element, and keyword facets are separate dimensions with separate labels (§6).

---

## 2. Defect Reproduction and Root-Cause Diagnosis (Task A)

### 2.1 Reproduction (deterministic, disposable DB)

Environment: fresh seed on loopback PostgreSQL (`drizzle push` on an empty disposable database; 33 first-party kanji rows — the ETL pilot rows are not part of a fresh seed).

Observed at runtime via the service/route path (`scripts/tmp-repro-element-filter.mts`, executed then deleted):

| Action | Palette badge (pre-fix) | Grid result (pre-fix) |
|---|---|---|
| Select 丁 (no other facet) | 1 | 1 (灯) — consistent |
| Select 丁, then level **N5** | 1 | **0** + “No kanji match this filter” |
| Select 丁, then level N4/N3/N1 | 1 | 0 each |
| Select 丁, then level N2 | 1 | 1 (灯) |
| Select element 金 (and 9 other zero elements) | 0 | 0, but with no usable explanation of *why* |
| Select 木 | 8 (edge count) | 5 distinct characters (箱 茶 休 林 森) |

Element-only baselines: 丁=1 (灯), 日=3 (明 時 間), 月=1 (明), 木=5 (箱 茶 休 林 森). Zero-count elements at seed: 金 糸 川 大 立 走 車 广 石 白 足 食.

The owner’s screenshot state (badge 1 / zero results / “No kanji match this filter”) reproduced exactly as: element 丁 selected (badge 1, honest for the element alone) + an *active level facet* silently intersecting the result set to empty.

### 2.2 Root causes (three, all fixed)

1. **Badge computed on a different scope than results.** `listElements` returned `usedInCount` as a *global* composition-row count (pre-fix `knowledgeService.ts` ~line 401), independent of the active level/keyword facets. The grid, by contrast, was the AND-intersection of level ∩ element ∩ keyword. Two different questions, two different numbers, one UI.
2. **Asymmetric facet resets.** Selecting a level cleared the element selection, but selecting an element did *not* clear (or disclose) the level. The user could not see which facet was responsible for the empty result.
3. **No zero-result taxonomy.** “No kanji match this filter” was printed for every zero case — element unknown, element with no relationships, element whose kanji are all hidden by the level facet, literal keyword miss, and genuinely empty catalog were indistinguishable, so the UI could not tell the user what to fix.

A fourth, adjacent issue was exposed by the same work: **units were conflated.** The palette for 8 (木) showed a *relationship* count (8 graph edges) where the result grid counted *distinct characters* (5). Neither number is wrong; presenting one as the other was.

**Not root causes (verified):** the graph/index/lookup path was intact — reverse lookup from element to kanji returned correct sets; `listKanji`’s intersection semantics were correct; count computation was correct *for the scope it was asked*; client memoization did not stale-match; and no relationship was ever fabricated (dangling edges are excluded from character counts, §4.3).

---

## 3. End-to-End Data-Flow Trace (Task A)

```
src/data/kanji.ts (seed: ELEMENTS, EXTRA_ELEMENTS, KANJI, COMPOSITION)
        │  ensureSeeded() ──► PostgreSQL tables: kanji_entries, kanji_radicals, kanji_composition
        ▼
KnowledgeService.loadKanjiFilterSnapshot()          [knowledgeService.ts]
  • kanji rows (id, character, meaning, readings, strokes, jlpt, grade)
  • ALL composition edges (kanjiId, elementId)      ← read before enrichment
  • element registry (id, character)
        ▼
filterKanjiCatalog({kanji, composition, elements, state})   [elementFilterContract.ts — pure]
  1. normalize state (level ∈ {all,N5..N1}, elementId canonical or null, keyword trimmed literal)
  2. element facet → elementUsage: relationshipCount (raw edges),
     usedInCount (distinct ∃ integrity-valid edge), facet-visible preview
  3. integrity filter: an edge counts a character only if BOTH the kanji row
     and the element row exist — dangling edges never invent matches
  4. facet intersection: level ∧ keyword ∧ element → matches (sorted, deterministic)
  5. exclusions partition (element-catalog only): byLevelOnly / byKeywordOnly / byBoth
  6. zeroKind (element reasons) + emptyKind (non-element reasons) + description
        ▼                                            ▲
KnowledgeService.listKanji / listElements            │ same state object
        ▼                                            │ (single source)
GET /api/kanji  →  { total, catalogTotal, elementFilter, emptyKind, kanji, elements }
        ▼
src/app/kanji/page.tsx  — request sequencer drops stale responses;
   badge = visibleKanjiCount; banner/empty-state text from describeKanjiFilterEmptyState
```

Ordering fix included: `listKanji` now reads page rows and page meta (including `primaryRadicalId`) **before** radical enrichment is computed, so enrichment reads real values on every page (previously the page-meta query ran after `elementIds` was captured and could read `undefined`).

Grade/element lookups in the *MindTree catalog* (`/mindtree`) are a separate, static path (`listMindTreeCatalog()` + `filterMindTreeCatalogItems`), unaffected by this defect; its empty state is separate and must not be conflated with the `/kanji` empty state (§8.3.4).

---

## 4. The Single Count/Filter Contract (Tasks A + B)

Defined once in **`src/lib/kanji/elementFilterContract.ts`** and imported by the service, the route, the page, and all M9A tests. The page contains no independent count logic.

### 4.1 Count semantics

| Name | Definition | Unit | Shown as |
|---|---|---|---|
| `catalogTotal` | Characters in the catalog before any facet | characters | “N of **M** catalog kanji shown” |
| `filteredTotal` / `total` | Result set after level ∧ keyword ∧ element | characters | grid contents |
| `relationshipCount` | Raw composition graph edges for the element (diagnostic; may include dangling) | edges | tooltips/diagnostics only |
| `usedInCount` | Distinct catalog characters with ≥1 integrity-valid edge to the element | characters | palette secondary detail |
| **`visibleKanjiCount`** | Characters the element would return **under the current facet state**; by construction equals the result length when that element is selected | characters | **palette badge — the number users click** |

Invariant (tested across every element × level combination): `visibleKanjiCount === filteredTotal` for the request that carries that element and those facets.

### 4.2 Zero-result taxonomy (machine-readable, one documented contract)

`ElementZeroKind` — reported via `elementFilter.zeroKind` when an element facet is active:

- `element-unknown` — id not in the canonical element registry
- `element-no-relationships` — registry element with zero composition edges (“0 composition relationships … this is an accurate zero, not a lookup failure”)
- `element-no-catalog-kanji` — edges exist but none resolve to a catalog row (data-integrity disclosure)
- `element-excluded-by-level` / `element-excluded-by-keyword` / `element-excluded-by-level-and-keyword` — the element has catalog matches; the *other* active facets hide all of them (exclusion counts reported)

`KanjiFilterEmptyKind` — when no element facet is active: `results-present` | `filters-no-match` | `catalog-empty`.

`describeKanjiFilterEmptyState(result, state)` turns those codes into `{ kind, title, detail, resetAction }`; `resetAction ∈ {level, keyword, element, all}` maps through the page’s `RESET_ACTION_LABEL` to buttons such as “Clear level filter”, “Clear search and filters”, “Reset all filters”. The description always names the responsible facet and never blames the element when the level/keyword facet caused the zero.

### 4.3 Integrity rule (no invented relationships)

An edge contributes a character count only when both endpoints exist. A relationship pointing at a missing kanji row increments `relationshipCount` (graph statistic) and `danglingRelationshipCount` but **never** appears in `usedInCount`, `visibleKanjiCount`, or the result set. Verified by dedicated fixtures; the production dataset reports `danglingRelationshipCount = 0`.

### 4.4 Determinism

`compareKanjiForFilter` orders by JLPT (N5…N1, nulls last), then stroke count, then Unicode code point, then id — equal rows in any input order produce byte-identical output sequences. Input objects are never mutated (tested).

---

## 5. Filter Implementation and State Behavior (Task B)

- **Pure function**: `filterKanjiCatalog(input)` — data in, result out; no I/O, no clock, no randomness; unit-testable without a database (34 tests run with no `DATABASE_URL`).
- **Canonical ids**: the page passes only canonical element ids (`el-chou`, `el-ki`, …); `normalizeKanjiFilterState` rejects/normalizes unknown shapes before any query. Keyword matching is literal substring (case-insensitive) — `%` and `_` are not wildcards (verified at route level).
- **Total + filtered counts** travel in every response (`total`, `catalogTotal`), so the header can show both “shown” and “catalog” truthfully at all times.
- **Reset**: three independent resets — element-only, level-only, keyword-only, plus “Reset all filters”. Selecting an element no longer touches the level facet; clearing the level from the empty state does not clear the element (browser-verified, §8.3.3).
- **No stale state**: the page runs a request sequencer — each fetch carries a sequence number; responses that are not the latest are dropped client-side even if they arrive last (browser-verified by rapid-typing probe, §8.3.9). Subsequent reloads keep the grid and input mounted (no unmount/remount focus loss) and mark the region `refreshing`.
- **Bounded blast radius**: `listKanji`/`listElements` are called only from `src/app/api/kanji/route.ts` and `tests/kanji-expansion.test.ts`; `fetch("/api/kanji")` only from `src/app/kanji/page.tsx` — verified by repository-wide search before refactoring.

---

## 6. When and Why Other Filters Exclude Matches (Task B)

Facets are **conjunctions** (`AND`), documented in the contract and disclosed in the UI:

- **Level facet**: keeps characters whose `jlptLevel` equals the selection. A character with `jlptLevel = null` (e.g., 灯, N2-listed in first-party data but grade null) is excluded by every level facet; selecting N5 with 丁 yields `element-excluded-by-level` because 灯 is not N5 — *not* because 丁 is broken.
- **Keyword facet**: literal case-insensitive match against meaning/readings; combined with an element it can empty the set (`element-excluded-by-keyword` or `…-and-keyword`).
- **Element facet**: membership via integrity-valid composition edges.
- **Grade facet (MindTree catalog)**: `gradeLevel === 1` for “Grade 1”; JLPT facets on that page use `jlptLevel`, and a kanji can be Grade 1 with `jlpt = null` — the two are never merged. 木/日/月 appear in Grade 1 and “all”, and in **no** JLPT facet, precisely because their first-party `jlptLevel` is null. 丁 is absent from the 100-character slice entirely — the catalog correctly returns `[]` with no fabricated match.
- **Exclusion accounting**: for an active element, every catalog character using it is in exactly one of {visible, byLevelOnly, byKeywordOnly, byBoth} — the partition sums are asserted in tests.

---

## 7. Regression and Unit Test Inventory (Tasks B + F)

| File | Scope | Count | Needs DB |
|---|---|---|---|
| `tests/kanji-element-filter.test.ts` | Pure contract: facet semantics, badge invariant across every element × level, exclusions partition, zero taxonomy, reset descriptions, determinism/ordering, no-mutation, dangling-edge fixtures | 34 | no |
| `tests/kanji-element-filter-service.test.ts` | `KnowledgeService.listKanji`/`listElements` + `GET /api/kanji` (fake `NextRequest`): three-number contract SQL-verified for every element, badge==click for every 丁 level combination, literal keyword, pagination determinism, canonical element registration | 14 | yes |
| `tests/kanji-mindtree-m9a.test.ts` | MindTree catalog facets: 100-item catalog, Grade 1 dedup, pure filter ≡ manual predicate, 丁 honest empty across all facets, no input mutation | 9 | no |
| Existing: MindTree M4–M8 + product (7 files) | unchanged | 38 | no |
| Existing: M1 graph contract | unchanged | 21 | no |
| Existing: expansion ETL suite (`listKanji({level})` consumer) | re-verified green after refactor | 5 | yes |

**State-tolerance design:** the service tests derive expected values from independent SQL against the live tables (not from the implementation under test), and assert the documented pristine-seed literals (8/5, 日/月 sets, 金 zero, …) only when `count(kanji_entries) === 33`. The suites therefore pass on a fresh seed *and* after idempotent ETL tests ran earlier in the same session — verified both ways (14/14 standalone at seed; 14/14 at 45 rows post-ETL).

---

## 8. Browser Acceptance Evidence (Task C)

### 8.1 Harness

- **Real headless Chromium** (`puppeteer-core` + `@sparticuz/chromium`, installed with `npm i --no-save` — `package.json`/`package-lock.json` unchanged), driven by **`scripts/m9a-browser-acceptance.mjs`** against the local production build (`next build` → `next start` on `0.0.0.0:3100`) with the disposable PostgreSQL.
- Output: **`reports/kanji-mindtree/m9a-browser-acceptance-log.json`** (per-check PASS/FAIL, environment classification).
- Result: **49 passed, 0 failed.**

### 8.2 Checklist coverage (the required Task C items)

| Required item | Evidence (check id in log) |
|---|---|
| Catalog navigation | `/kanji` loads (33 shown of 33), link to MindTree catalog (100 cards), round trip back, navbar entry in desktop + mobile lists |
| Element filters | 丁 → banner “1 of 1”, grid=灯; badge promises honored when clicked (木 under N5: badge 3/5, grid 3) |
| Grade filters | `/mindtree` Grade 1: “Showing 73 of 100” == 73 rendered cards; Grade 1 + query consistent; empty search shows reset |
| Filter resets | “Clear level filter” restores 灯 **without** clearing the element; “Reset all filters” restores 33; catalog reset restores 100 |
| Empty states | level-conflict state names “level filter N5” and “not by the element”; keyword miss names the term; zero element shows “0 composition relationships … accurate zero” |
| Character detail routes | `/kanji/灯` 200; `/mindtree/明` h1=明; multi-character route rejected with boundary message; unsupported 龍 → coverage notice, no explorer |
| Six learning stages | Observe → Break down → Associate → Remember → Recall → Explore each reachable, `aria-current="step"`, “Step N of 6” labels verified |
| Recall reveal/hide | “Reveal answer” → self-check block appears; “Cover answer” hides it; component-recall mode shows the KanjiVG-annotation disclaimer; self-check fires **zero** network calls |
| Character switching | component “Open” link navigates to the target character’s MindTree route |
| Explore context | `?from=明&via=component 日` preserved in URL; “Following …” breadcrumb rendered |
| Browser history | back → previous character re-renders; forward → context link restored; `/kanji` list ⇄ detail back/forward intact |
| Japanese URL encoding | `/mindtree/%E6%98%8E`, `/kanji/%E7%81%AF`, `/mindtree/%E9%BE%8D` all load correctly |
| Responsive layouts | `/kanji` @375/768/1280 and `/mindtree`, `/mindtree/明` @375: `scrollWidth == innerWidth` (no horizontal overflow); mobile nav exposes the MindTree entry |
| Keyboard navigation | Tab reaches level filters, element palette, and result cards; Enter toggles an element (`aria-pressed` flips both ways); **0** interactive controls without focus-visible styling |
| Console and network errors | **0 page errors, 0 unexpected console errors, 0 unexpected failed requests** (§8.5) |

### 8.3 Defects found by this acceptance run and fixed in-branch

1. **Mobile horizontal overflow (375 px) on every page** — the Navbar’s `sr-only` legend inside the horizontally-scrollable mobile nav was absolutely positioned against the ICB, escaping the scroller’s clip (`document.scrollWidth = 507`). Fixed by making the nav row a positioning context (`relative`); verified 375 ≤ 375 on `/kanji`, `/mindtree`, `/mindtree/明`.
2. **MindTree catalog mobile overflow (666 px)** — the catalog list’s implicit single grid column sized to max-content. Fixed with a base `grid-cols-[minmax(0,1fr)]` track (same guard applied to the Studio list, which stays production-disabled).
3. **Missing keyboard focus styling on `/kanji` controls** — focus-visible rings added to level buttons, search input, refresh/reset, palette buttons, card links, banner actions.

### 8.4 Local production-build vs deployed-browser (explicit distinction)

- **Local production build** (`next build` + `next start`, production mode): all 49 checks above. Production-boundary checks included: `/mindtree/studio` → **404**, `/mindtree/studio/preview/明` → **404** (Studio disabled), AI-candidate overlay strings absent from learner HTML (一 page clean; 男/箸 routes 200 without candidate text), GET-only script (no writes).
- **Deployed browser**: **not executed.** Two independent blockers, both verified: (a) the production URL is unreachable from this sandbox (curl exit 000; egress allowlist is github/npm/pypi only) and no deployment authorization was granted for this phase; (b) no system browser existed initially — the Chromium used here was provisioned from the npm registry and pointed at localhost only. **No deployed-browser result is claimed anywhere in this report.**

### 8.5 Console/network classification (honest buckets)

- `environment: 16` — `fonts.googleapis.com` stylesheet requests closed by sandbox egress; a deployment/Vercel environment loads them normally.
- `prefetch-abort: 127` — Next.js client-router `?_rsc=` prefetches cancelled by navigation (normal, not errors).
- `local-corpus: 2` — `/api/kanji/灯/stroke-order` returns **404 `STROKE_ORDER_UNAVAILABLE`** because the gitignored `data/kanjivg-index.json` + `data/kanjivg/` corpus is not provisioned in this checkout; the panel renders the honest “No usable KanjiVG stroke-order asset …” state (accepted as a check). This is fail-closed behavior for missing data, not a defect.

---

## 9. Target-Manifest Architecture for 2,500 Kanji (Task D — design only; nothing imported)

A deterministic **build-time manifest pipeline**, entirely separate from runtime serving. No character beyond the current 100-row slice is imported, published, or rendered in this phase.

### 9.1 Registries

1. **Target registry (`target-manifest.json`)** — one row per target codepoint: `{ codepoint, utf8, category, status }` where `category ∈ {joyo, frequency-supplementary, jlpt, outside-catalog}` (and `jlpt` is additionally carried as a facet value, never collapsed into the others), and `status ∈ {in-catalog, pending, missing-source}`.
2. **Element registry** — extends the existing canonical element ids (`el-*`): every element row declares `{ id, character, kind: radical | primitive, category }`. **Radical ≠ component** is a first-class distinction: `radical` requires a Kangxi index; `primitive` (e.g. 丁 as a phonetic component, 氵 as a variant form) does not. Variant shapes map to their canonical element via `altForms`, never as separate ids.
3. **Alias normalization** — input aliases (Unicode NFC + NFKC fold, legacy/GDK names, IDS forms) normalize to exactly one canonical id through a checked alias table; unknown aliases fail the build with a report entry rather than silently creating ids.

### 9.2 Provenance schema (per record, per edge)

Every derived fact carries: `{ sourceId, sourceVersion, sourceSha256, licenseId, extractedAt-deterministic?, derivation }` where `sourceId` matches the pinned register (`upstream:kanjidic2:2023-08`, `upstream:kanjivg:r20240807`, `first-party:seed`, future `pinned:joyo:v1`, `pinned:frequency:v1`). Derivations are pure functions of (pinned source bytes + pinned config) — timestamps are excluded from content hashes.

### 9.3 Indexes and querying

- **Forward index**: `character → { readings, meanings, grade, jlpt, elements[], strokeModel, vocabIds[] }` (static JSON, content-addressed).
- **Reverse index**: `elementId → { relationshipCount, distinctKanji[], per-facet visibility }` — the M9A contract computed at build time, so runtime catalog filtering needs **no database**.
- **Coverage manifest**: per-source coverage table `{ total targets, present, missing, missingIds[] }` with the same three numbers rendered anywhere a count is shown.
- **Missing-data reporting**: `missing-data.json` enumerates every target with `status=missing-source` and the exact reason (`no-kanjivg-model`, `no-readings`, `no-frequency-rank`, …). The UI and report must print these; absence is never rendered as a match.

### 9.4 Learning-content separation

The **learning overlay** (mnemonics, stories, self-check copy) lives in its own store keyed by canonical id + version, with `publicationState ∈ {draft, review, approved, published, archived}`. Runtime learners see published rows only; an overlay row can never inject a reading, meaning, component, or relationship into canonical tables (AI-generated content is structurally blocked from canonical records by this separation, matching the current `getPublishedMnemonic() → null` behavior).

### 9.5 Licensing inventory (manifest-level)

`licenses.json` lists, per pinned source: name, version/revision, license text URL + SPDX id, attribution string, redistribution notes. Seeded with the existing pins (§11) and two **not yet present in this repository**: the Jōyō list and the frequency ranking (§12.3).

---

## 10. Determinism, Hashing, Incremental Validation (Task D)

1. **Deterministic regeneration**: `target-build` is a pure function `(pinned sources, pinned config) → artifacts`. Same inputs ⇒ byte-identical outputs on any machine; outputs are sorted canonically (code-point order), line endings normalized, floats forbidden in derived data.
2. **Content/artifact hashes**: every artifact records `sha256` in `artifact-hashes.json`; source inputs record their own hashes. The existing slice generators already digest-assert their pinned archives (`build-kanji-mindtree-*.ts`, `TARGET_COUNT = 100`) — the same discipline generalizes.
3. **Incremental validation**: rebuild is permitted only when (a) source hashes match the register, (b) artifact hashes match the manifest, (c) every edge passes endpoint-existence checks, (d) coverage numbers in the manifest equal recomputed coverage. Any mismatch ⇒ fail closed with a diff report; no partial publishing.
4. **Order of gates for any future “2,500 implemented” claim** (all must be green, in this order, with the report attached): source-pin gate → license gate → alias/registry gate → derivation gate → integrity gate (endpoints, no dangling, no duplicates) → forward/reverse index equivalence gate → coverage-gate (missing list rendered) → runtime gate (build, tests, browser acceptance) → **only then** the claim may be made. **None of these gates has been run for 2,500 targets in this phase; therefore the claim is not made.**

---

## 11. Licensing and Provenance Inventory (Task D)

| Source | Pin (verified this phase) | License | Evidence |
|---|---|---|---|
| KanjiVG | release `r20240807`, commit `a4b51d9…ff3b`; archive 6,403,118 B, SHA-256 `a0cbc…7dcd`; 11,658 files (6,699 primary + 4,959 variants); index 293,747 B / 6,699 keys | **CC-BY-SA-3.0** | `reports/gates/PHASE-14.4D-KANJIVG-ACQUISITION-MANIFEST.json` |
| KANJIDIC2 | `upstream:kanjidic2:2023-08`, database 2023-232 file v4; XML SHA `260e61…c781`, repo blob `e6e448…4c6b`; 13,108 records | **CC-BY-SA-4.0** (a historical gate document says 3.0 — not rewritten; current register governs) | source register + `reports/gates/*` |
| MindTree derived slices (100 records each) | `kanjidic2-facts-slice.json` SHA-256 `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6`; KanjiVG structure slice — both `hashMatches: true` in today’s `source-refresh` run (`PASS_LOCAL_ARTIFACTS`) | CC-BY-SA-4.0 derivation, EDRDG attribution | `scripts/report-kanji-mindtree-source-refresh.ts` output |
| First-party seed (`src/data/kanji.ts`) | in-repo, git-tracked | first-party | repo |
| EDRDG license notice | manual check item — must be re-verified before any new extraction | EDRDG terms | source-refresh `requiredManualChecks` |
| Jōyō list | **not present in this repository** | (to be pinned: KLC/agency notice) | §12.3 |
| Frequency ranking | **not present in this repository** | (to be pinned per chosen dataset) | §12.3 |

---

## 12. Feasibility vs Pinned KANJIDIC2/KanjiVG Assets (Task E)

### 12.1 What the pinned assets already provide (evidence)

From `reports/gates/PHASE-14.4E-GRAPH-COVERAGE.md` and `PHASE-14.4E-FINAL-GATE-REPORT.md` (deployed-data scope, numbers as recorded there):

- Canonical kanji entries: **13,108**; dictionary entries: **206,747** (165,497 contain kanji, 80.0%); radical primitives: **63**.
- KanjiVG visual stroke models: **11,658** assets; kanji with a KanjiVG model: **6,416 (48.9%)**.
- Kanji with readings: **12,356 (94.3%)**; without (Chinese morphemes): 752 (5.7%).
- Kanji with attested vocabulary: **5,880 (44.9%)** (13,108 − 7,228 without).
- Kanji with primary radical association: **8,323 (63.5%)**.
- Structural decompositions: **90 `Kanji → Composition` edge records across 45 distinct kanji** (the coverage document’s “90 structural decompositions” counts edges — line 63 `CompositionEdge = 90` — while its metric “Kanji with Structural Decomposition in DB: 45” counts characters; both figures are cited here with their definitions to close the discrepancy).

### 12.2 What they do not provide

- **Scope gap**: the 100-row MindTree slice is 100/13,108. KanjiVG models cover only 48.9% of canonical kanji; structural decompositions exist for 45 characters — decomposition *coverage*, not merely edge volume, is the binding constraint for a 2,500-character expansion.
- **Category lists**: no Jōyō (2,136) list and no frequency ranking exist anywhere in this repository (grep-verified). JLPT is present but is a different axis. Therefore a 2,500 target registry requires two **new pinned sources** with their own license entries (§11) — and the four categories must remain distinct in every count.

### 12.3 Recommendations (evidence-backed)

1. **Build-time static indexing, not runtime DB dependency for MindTree.** The current `/mindtree` catalog is already served as static data with client-side pure filtering; the M9A contract is designed to be computed at build time (§9.3). Recommendation: extend this pattern — the 2,500 target manifest compiles to static forward/reverse indexes shipped as artifacts; runtime DB remains for account-bound features only. This matches low-cost Vercel (static/ISR, no long-running workers) and Supabase (unchanged role).
2. **Pin, don’t scrape.** Add `pinned:joyo:v1` and `pinned:frequency:v1` entries with content hashes and license text before any category facet uses them; until then, no UI element may display a Jōyō or frequency count.
3. **Sequence coverage work by evidence**: readings (94.3% ready) ≫ models (48.9%) ≫ decompositions (45 kanji). Expansion should ingest KANJIDIC2/KanjiVG-derived facts for all 13,108 first, then gate the 2,500 subset by manifest membership — the opposite order would manufacture empty states without a plan to fill them.
4. **Keep the fail-closed culture**: missing artifacts produce `STROKE_ORDER_UNAVAILABLE`-style honest absences (§8.5) — the 2,500 pipeline must keep this property via `missing-data.json` rather than padding counts.

---

## 13. Quality Gates, Environment Boundaries, Deployment Statement (Task F)

### 13.1 Commands and results (this branch)

| Gate | Command | Result |
|---|---|---|
| MindTree tests | `npx vitest run --config vitest.mindtree.config.ts` | 47/47 |
| M1 contract | `node --import tsx tests/kanji-mindtree-contract.test.mjs` | 21/21 |
| M9A pure + service + expansion | `npx vitest run tests/kanji-element-filter*.test.ts tests/kanji-expansion.test.ts` (with `DATABASE_URL`) | 53/53 |
| Typecheck | `npm run typecheck` / `tsc --noEmit` | 0 errors |
| Lint | `npm run lint` | 0 errors, 3 pre-existing warnings |
| Source integrity | `node --import tsx scripts/report-kanji-mindtree-source-refresh.ts` | `PASS_LOCAL_ARTIFACTS`, both hashes match |
| Production build | `NEXT_TELEMETRY_DISABLED=1 npm run build` | 114/114 static pages, exit 0 |
| Browser acceptance | `node scripts/m9a-browser-acceptance.mjs --base-url http://127.0.0.1:3100 …` | 49/49, log committed at `reports/kanji-mindtree/m9a-browser-acceptance-log.json` |
| Full DB suite | `npx vitest run` (with disposable `DATABASE_URL` + `NIHONGO_DB_TARGET_CLASS=disposable`) | 1,376 tests: **1,239 pass / 80 fail / 57 skip** |

### 13.2 Full-suite failure attribution (all 80 — none in M9A scope)

- **32** — `ENOENT` on gitignored `data/` corpora (`data/kanjivg-index.json`, `data/kanji-decomposition/*`, KANJIDIC2/JMDICT source files). These files are absent from this checkout by design (`.gitignore` lines 46–52) and were never present at baseline.
- **~45** — ingestion/baseline gates that fail-closed because those same corpora are absent or because the local database is the 45-row disposable rather than the 13,108-row canonical baseline (`expected 45 to be 13108`, `GRAPH_BASELINE … INCOMPATIBLE`, `FIRST-PARTY BASELINE` refusals, digest mismatches). They are refusal gates doing their job locally.
- **1** — `kanji-stroke-order-panel` needs `data/kanjivg-index.json` (same absent corpus; the runtime equivalent is honestly handled, §8.5).
- **1** — `questions-post-authorization #31` expects HTTP 409 on duplicate id but receives 500 under the **local PGlite disposable driver**: PGlite’s `DatabaseError` exposes no `.code = '23505'` at the depth `isUniqueViolation()` inspects (`DrizzleQueryError → cause: DatabaseError`, both codes `undefined` — probed directly), so the conflict mapping never fires. `git diff 23546cf` shows this branch touches **only** `src/app/api/kanji/route.ts`, `src/app/kanji/page.tsx`, `src/services/knowledge/knowledgeService.ts`, `src/components/kanji/KanjiMindTreeCatalog.tsx`, `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx` (one class), `src/components/layout/Navbar.tsx` (one class) — **no JLPT/questions code** — so this is a pre-existing local-infrastructure mismatch, not an M9A regression.
- Files reported `failed` with only *skipped* assertions (`dictionary-architecture`, `dictionary-ui`, `full-jmdict-ingestion`, `pilot-jmdict-db`) are artifact-gated suites that skip their contents wholesale in this environment (part of the 57 skipped).

**Zero failures** occurred in any file changed or added by M9A (verified from the JSON test report: element-filter 34, element-filter-service 14, m9a 9, MindTree M4–M8/product 38, expansion 5 — all green in the final full run).

### 13.3 Editorial and production boundaries (verified)

- **Unpublished editorial content stays hidden**: learner pages expose no mnemonic text (`getPublishedMnemonic()` → null path; browser checks confirm the Associate/Remember stages render the hidden-content disclosure instead of story cues, and AI-candidate strings are absent from learner HTML).
- **Production Studio disabled**: `/mindtree/studio` and `/mindtree/studio/preview/*` return **404** in the production build (HTTP + browser verified).
- **No AI-generated content** entered canonical records; no relationship, glyph, reading, or mnemonic was invented to make the UI pass — zero states are reported as zeros with reasons.

### 13.4 Push / merge / deploy statement (required)

- **Pushed**: no — the branch exists only in this workspace’s history; no `git push` was executed.
- **Merged / PR**: no — no merge, no PR was opened or closed.
- **Deployed**: no — no deployment target was touched; the deployed production URL was not even reachable from this environment.
- **Migrations**: none against any shared database; `drizzle push` was applied only to the disposable loopback instance.
- **Database writes during acceptance**: none — the browser harness issues GET requests only (asserted as a check), and server-side seeding targets the disposable database exclusively.

### 13.5 Residual risks / follow-ups (not blockers for M9A acceptance)

1. Google-Fonts `<link>` fetches fail in sandboxed egress (16 environment failures) — consider `next/font` self-hosting to make the app fully offline-capable.
2. `questions` duplicate-id 409 mapping is blind to PGlite error shapes (§13.2) — upstream fix: inspect `cause.cause` chain or normalize driver errors.
3. Stroke-order assets require the gitignored `data/kanjivg/` corpus at runtime; deployment must provision it via the pinned 14.4D pipeline or the honest-unavailable state will show in production too.
4. Filter state is not encoded in the `/kanji` URL (browser back works, but deep-linking a filter combination is not yet possible) — a candidate follow-up that would extend the same contract via `serializeKanjiFilterState` (already implemented in the contract module).

---

*End of report. Supporting artifacts: `src/lib/kanji/elementFilterContract.ts`, `tests/kanji-element-filter*.test.ts`, `tests/kanji-mindtree-m9a.test.ts`, `scripts/m9a-browser-acceptance.mjs`, `reports/kanji-mindtree/m9a-browser-acceptance-log.json`.*
