# NihongoBridge Kanji MindTree M3 — Meaning to Remember

**Date:** 2026-10-29
**Verdict:** **Implemented — bounded, source-backed learning slice**
**Scope guard:** no production DB/Supabase access, migrations, schema changes, Phase 26F changes, SRS persistence/activation, dependency additions, deployment, or Git delivery action.

## A. Verdict

M3 adds a usable learning journey on top of the preserved M2 MindTree: an exact-100-character source-backed catalog, typed first-party mnemonic metadata, progressive story reveal, short ephemeral meaning/component recall, a separate bounded interactive learning graph, deterministic component-family and On-reading indexes, accessible navigation/context, source-specific notices, tests, and this report.

It deliberately does not fabricate stories or vocabulary for the 67 additional characters. Existing 33 authored seed cues remain the only mnemonic content. This is a local static learning slice, not a complete dictionary or etymology system.

## B. Repository identity

- Repository: `/home/user/nihingobridgeupgrade` (`ranimony-afk/nihingobridgeupgrade`)
- Branch: `arena/40788dd5-nihingobridgeupgrade` — active
- HEAD: `cf7a4c673236af2f507af8529dae0946fbed3bdf`
- Remote: `origin` → `https://github.com/ranimony-afk/nihingobridgeupgrade.git`
- No branch switch, commit, push, PR, merge, release, or deployment was made.

## C. M2 preservation

- Preserved the 33 first-party records in `src/data/kanji.ts`; M3 did not add external rows to that seed.
- Preserved the existing M1 structural-evidence contract and M2 adapter behavior: KanjiVG visual groupings remain distinct from meanings, dictionary facts, radical identity, mnemonic interpretation, and derived links.
- Preserved the M1 contract test and prior M1/M2 reports. The cumulative architecture and resource register were extended rather than replaced as product-history records.
- M2's historical artifact was 33 records / 307 paths / 304,441 bytes with SHA-256 `554ef63b3d4bac29475e9b477f673c4275c14f8ef881dd05c8a8f1967946266c`. M3 intentionally regenerates the current KanjiVG artifact to 100 records; the earlier digest is retained here as historical M2 evidence, not presented as the current digest.
- The four tracked application edits and the untracked M1/M2 files that existed before M3 remain present. No reset, clean, stash, rebase, checkout, or overwrite of the repository root occurred.

## D. Implemented functionality

### Learning journey

- **Observe → Break down → Associate → Remember → Recall** stage controls.
- Existing first-party memory strings are represented as typed `MindTreeMnemonic` values, labeled with source, first-party origin, unrecorded review status, and `memory-aid-not-etymology` interpretation.
- Story reveal is sentence-by-sentence and uses only existing authored text. Learners can cover/reveal the story again.
- Meaning recall and literal-component recall hide/reveal answers and expose a temporary self-rating. State is component-local and disappears when the page is left; no API, local storage, account state, review card, SRS, score history, or schedule is written.
- For new KANJIDIC2-only entries, the interface explicitly says no authored mnemonic/example is available and does not synthesize one.

### Knowledge graph and navigation

- A deterministic reverse index maps exact KanjiVG component identities to characters; a separate reverse index maps exact KANJIDIC2 On-reading strings.
- `nihongobridge-learning-neighborhood@1` is a composed product graph, **not** the M1 structural-evidence graph. It explains the source/lane for each link: literal visual annotation, derived component overlap, exact dictionary On-reading overlap, recorded reading, or first-party example.
- Bounds: depth 2, maximum 80 nodes / 96 edges; per detail result, at most 10 visual-overlap links, 10 component-family members per displayed branch, five same-On-reading links, eight reading nodes, and four first-party vocabulary nodes. The browser receives a selected character and a capped neighborhood, not a global graph.
- Component-family branches expand/collapse; supported links carry `from` and `via` query context and display a return breadcrumb. Similar appearance or shared reading is never described as semantic/etymological kinship.

### Coverage and display

- The 33 first-party records are joined to independent KANJIDIC2 and KanjiVG artifacts; 67 KANJIDIC2 grade-1 records extend the slice to 100 where a matching pinned KanjiVG SVG exists.
- Meaning/readings/grade/stroke counts have clear first-party versus KANJIDIC2 attribution. Classical radical *index number* is labeled separately from a component and the first-party radical selection.
- Existing vocabulary remains first-party example content; no JMdict or Tatoeba records are duplicated.
- Unsupported characters remain safe and explain the coverage boundary without fabricated data.

## E. Data, counts, and hashes

### KanjiVG

- Source: official KanjiVG tag `r20240807`, commit `a4b51d966d832544c371d566f9c84174e4beff3b`.
- Source archive: 6,403,118 bytes; SHA-256 `a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd`.
- Current `kanjivg-structure-slice.json`: **100 glyph records, 602 path records, 617,047 bytes**, SHA-256 `03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862`.
- License lane: KanjiVG CC BY-SA 3.0; copyright Ulrich Apel; separate attribution/share-alike notice.

### KANJIDIC2

- Source ID `upstream:kanjidic2:2023-08`; official header `2023-08-20`, database `2023-232`, file version `4`.
- Archive source: `Jitendex/edrdg-dictionary-archive@9cb709b87f43c7bceb494eefbe7f8b8f42744502`, path `kanjidic2_xml/kanjidic2.xml.br`, Git blob `e6e448946b29480a765f167e9ee1cc3fc9314c6b`.
- Archive: 895,754 bytes; SHA-256 `175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb`.
- Decompressed XML: 15,643,593 bytes; SHA-256 `260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781`; 13,108 parsed records.
- Current `kanjidic2-facts-slice.json`: **100 records, 36,356 bytes**, SHA-256 `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6`.
- Selection: all 33 first-party MindTree characters plus 67 grade-1 characters ordered by primary stroke count then Unicode scalar, all with a matching pinned KanjiVG SVG.
- Included: English meanings, Japanese On/Kun readings, grade, stroke count, classical radical index number. Excluded: non-English meanings, separately credited SKIP/Pinyin/Korean and other third-party code/reading material, vocabulary, and examples.
- The KANJIDIC2 fact artifact is independently attributed and marked CC BY-SA 4.0. It is not combined into the KanjiVG graph artifact.

## F. Source research and license disposition

- Read the cumulative `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md` before extending research. No external repository was cloned; GitHub API/README/license metadata was inspected, with exact revisions recorded in the register.
- The current authoritative [EDRDG General Dictionary Licence Statement](https://www.edrdg.org/edrdg/licence.html), fetched 2026-10-29, states that CC BY-SA 4.0 covers KANJIDIC2 and derived files, replaces previous license statements, requires attribution and share-alike, and calls for regular updating. This resolves the earlier repository README disagreement for the M3 artifact.
- The existing local KANJIDIC2 ETL contract and historical gate manifest still say CC BY-SA 3.0. M3 did not silently rewrite that historical ETL gate; the separate M3 artifact/notice records the current source-specific EDRDG terms and the discrepancy explicitly. No legal clearance is claimed.
- Exact archive repository commits/blobs, release metadata, source license and attribution, excluded fields, and intended transformations are recorded in the upstream register and `src/data/kanji-mindtree/NOTICE.md`.
- Reviewed Scriptin and Japanese-Lab `jmdict-simplified` and YomiYomidevs packaging notes as license/conversion context only. No code or data from those projects, GPL projects, WaniKani, third-party mnemonics, JMdict, or Tatoeba was copied.
- Manual source refresh instructions are documented. The official regular-update requirement is **not automatically monitored**; the cadence remains an operational owner follow-up.

## G. Architecture and file changes

- `src/lib/kanji/kanjidic2MindtreeFacts.ts` — typed KANJIDIC2 artifact contract, source pins, digest, and validation.
- `scripts/build-kanji-mindtree-kanjidic2-slice.ts` — deterministic extraction using the existing source parser and verified source identities; no DB access.
- `scripts/build-kanji-mindtree-slice.ts` — extended to build matching 100-glyph KanjiVG coverage from verified source files.
- `src/lib/kanji/kanjiMindtreeCatalog.ts` — independent fact/seed join, validated lookup, deterministic component/read indexes, bounded response model.
- `src/lib/kanji/learningGraph.ts` — separate explainable composed learning neighborhood and hard bounds.
- `src/lib/kanji/mindtreeLearningJourney.ts` — pure reducer for staged mnemonic reveal and ephemeral recall.
- `src/components/kanji/KanjiMindTreeLearningJourney.tsx` — staged progressive reveal, recall activities, temporary self-check.
- `src/components/kanji/KanjiMindTreeExplorer.tsx`, `KanjiMindTreeCatalog.tsx`, and `/mindtree` routes — source-specific UI, supported search/catalog, mobile layout, focus/pressed/current/live semantics, graph navigation context.
- `src/data/kanji-mindtree/NOTICE.md` — separate KanjiVG/KANJIDIC2 notices, licenses, hashes, field exclusions, refresh procedure.
- `docs/architecture/KANJI-MINDTREE-PRODUCT-ARCHITECTURE.md` and `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md` — updated architecture and cumulative upstream register.

No new dependency or package-manifest/lockfile change was made. No DB/schema, migration, production service, Phase 26F, or SRS path was modified for M3.

## H. Verification

- Focused Vitest product suite: **11/11 passed**, using the temporary isolated config without repository database setup.
- M1 structural contract Node suite: **21/21 passed**.
- `npm run typecheck`: passed (`tsc --noEmit`).
- Targeted ESLint over M3 scripts, libraries, routes, components, and tests: passed with no new diagnostics.
- KANJIDIC2 facts generation was run twice against the pinned XML/archive; output byte-compared to the checked-in artifact: **MATCH**.
- KanjiVG generation was run twice against the pinned archive and 100 extracted source files; output byte-compared to the checked-in artifact: **MATCH**.
- `validateMindTreeSlice()` and `validateKanjidic2MindTreeFacts()`: valid, no issues; `listMindTreeCatalog()` returns 100; 33 carry first-party memory strings.
- Direct route checks returned HTTP 200 for `/mindtree`, `/mindtree/明`, `/mindtree/休`, `/mindtree/語`, `/mindtree/一`, `/mindtree/龍`, and a `from`/`via` context link. The first five supported details render the five-stage journey; `/mindtree/龍` renders the unsupported notice.
- Not run: full `npm test`, because repository `vitest.config.ts` loads `tests/setup.ts`, which explicitly connects tests to real PostgreSQL; no DB URL was used. Not run: `npm run build`, because the app build may prerender the DB-backed root route. The previously observed root-route `DATABASE_URL is required` behavior remains untouched. No test/build result is claimed for those unrun commands.

## I. Demonstration paths

Open the running local/preview site directly at:

- Catalog: `/mindtree`
- Supported first-party memory journeys: `/mindtree/明`, `/mindtree/休`, `/mindtree/語`
- Source-backed added character with no authored mnemonic: `/mindtree/一`
- Graceful unsupported case: `/mindtree/龍`

These pages were verified over HTTP at status 200. Reducer tests cover Observe-to-Recall progression, story segmentation/reveal, answer visibility, self-check, and reset-on-activity-change. Browser automation and screen-reader user testing were not run.

## J. Limitations and risks

- Only 33/100 supported characters have existing first-party mnemonic strings and vocabulary examples. The other 67 have sourced dictionary/visual facts but no authored story; the UI makes the gap explicit.
- Existing first-party mnemonics are unreviewed in source metadata; the UI does not imply editorial approval.
- KANJIDIC2 is a pinned 2023-08 snapshot. The current EDRDG notice's regular-update requirement must be operationalized; M3 documents a monthly manual check but does not automate or schedule it.
- The graph is intentionally bounded and relationship labels describe annotation/readings overlap only. It is not etymology, semantic similarity, a complete component ontology, or a global graph.
- The top-level `/` route still depends on missing `DATABASE_URL` in this sandbox. It was not probed again as part of M3 and was not changed; direct MindTree routes work without it.
- Source attribution and license notices are recorded; this work is not legal advice or a legal-clearance opinion.

## K. Git/worktree and safety audit

- Branch remains `arena/40788dd5-nihingobridgeupgrade`; HEAD remains `cf7a4c673236af2f507af8529dae0946fbed3bdf`.
- No staged changes. No commit, push, PR, merge, rebase, branch rename, deployment, or production operation.
- Existing tracked M2 edits remain in `src/app/kanji/[character]/page.tsx`, `src/app/kanji/page.tsx`, `src/components/layout/Navbar.tsx`, and `src/data/kanji.ts` (4 tracked paths; 15 insertions / 2 deletions at this audit). Existing untracked M1/M2 reports/tests/routes/artifacts remain. M3 adds/extends only the MindTree source, UI, tests, register, architecture, and report paths enumerated above.
- `package.json` and all lockfiles have no diff. No new dependencies.
- No `src/db`, schema, migrations, `.env`, production endpoint, Phase 26F, or SRS persistence changes. KANJIDIC2 XML and the complete archives stayed under `/tmp`; no full source corpus is in Git.

## L. Next milestone

M4 should be a human editorial/content review gate: verify the first-party story cues and their review-state metadata; decide whether to author and review additional stories for the 67 new characters; assign the recurring KANJIDIC2 license/source refresh check; then consider a larger slice only when matching source evidence, attribution, and a bounded learner outcome are ready. Keep SRS/database activation out of scope unless separately authorized.
