# Kanji MindTree — Product Architecture and Vertical Slice

**Status:** M4 implementation record (M2/M3 boundaries retained; static 100-character feature; no schema or persistence change)
**Date:** 2026-10-29
**Foundation decision:** **PARTIAL REBUILD**. Retain compatible first-party catalog, existing `/kanji/[character]` dictionary/MindTree infrastructure, SRS containment, and M1 structural-evidence contract. Add an isolated KanjiVG source adapter, bounded static evidence artifact, and locally renderable learner route because source-backed artifacts were absent and the current detail route is DB-backed.

Sections 1–8 retain the M2 architecture as the historical 33-character starting point. Section 9 records the M3 expansion and additions; it does not rewrite M2's reported artifact hash or claim that M2 originally shipped the 100-character coverage.

## 1. Product and slice scope

The feature began as a focused, local-first character study experience for the 33 kanji already authored in `src/data/kanji.ts`. M2 added:

- `/mindtree` — bounded catalog of supported records;
- `/mindtree/[character]` — one learner-focused character route with meaning/readings, source-backed SVG paths and annotated component occurrences, clickable occurrences, useful first-party seed examples, an explicitly attributed memory aid, and a short related-character list;
- an unsupported-character state that explains the current coverage boundary and links back to the catalog;
- a separate source-derived artifact generated from the pinned KanjiVG release, with byte hashes and attribution, without a database dependency.

M2 was an initial vertical slice, not a claim of full-corpus support. Unsupported Unicode characters remained routable and got a graceful coverage message rather than a fabricated decomposition. The component tree was bounded to one glyph and its direct/nested KanjiVG-annotated groups; related characters were capped and not expanded recursively.

## 2. Reuse/rebuild assessment

| Area | Decision | Reason / boundary |
|---|---|---|
| First-party meanings, readings, vocabulary examples, and memory cues (`src/data/kanji.ts`) | Retain, but label as first-party study seed | Existing authored records are useful for a first usable slice. They are not a substitute for KANJIDIC2/JMdict verification. Their source metadata does not provide a review status. |
| Existing `/kanji/[character]`, API, lexical lookup, editor/review and SRS paths | Retain, link to rather than bypass | These have existing DB, editorial, vocabulary and SRS safeguards. This feature does not modify them or create parallel persistence. |
| M1 v2 `structuralEvidenceGraph` contract | Retain | It is a dependency-free structural validator and canonicalizer. The adapter uses it for source graph shape, while the wrapper records byte/artifact metadata that the v2 graph itself cannot hold. Validation of metadata strings alone is not byte verification. |
| KanjiVG acquisition/adapter/evidence artifact | Add in isolation | The source corpus was absent. M2 used 33 exact source SVGs; source artifacts remain separate from first-party meaning, reading, vocabulary, radical, and mnemonic fields. |
| New learner routes and client interaction | Add | Existing detail UI is DB-backed and does not itself provide a local source-backed, no-database vertical slice. |
| Database, schema, migrations, production, SRS write actions | No change | Out of scope and not needed for local rendering. No migration, seeding, production endpoint, or account access is performed. |

## 3. Evidence and content lanes

Never merge the following into one claim or use one source label for all:

1. **KanjiVG source markup and visual path geometry** — direct source evidence. Store exact `kvg:element`, `kvg:position`, `kvg:radical`, `kvg:phon` values only when present, source group/path IDs, viewBox/path data, source filename, raw SVG SHA-256, release/tag/commit, transformation version, license, and attribution. The SVG shows an author's visual stroke/grouping annotations; it does **not** by itself establish semantic decomposition, a dictionary radical, a phonetic function, historical development, or etymology. Where shown, `kvg:radical` and `kvg:phon` are described as KanjiVG annotations, not adopted as canonical labels.
2. **First-party study record** — meanings, reading strings, sample vocabulary, declared primary radical, and mnemonic from `src/data/kanji.ts`. Label each as NihongoBridge first-party study content. No independent KANJIDIC2/JMdict verification or human review state is implied. The original 33 records remain distinct in M3.
3. **KANJIDIC2 dictionary facts** — M3's separately pinned, CC BY-SA 4.0 facts slice carries English meanings, Japanese On/Kun readings, education grade, stroke count, and a classical radical *index number*. Non-English meanings and separately credited SKIP, Pinyin, Korean, and other third-party code/reading material are excluded. A radical index number is not a visual component identity or first-party radical selection.
4. **Derived relationships** — exact KanjiVG component-identity overlap and exact shared KANJIDIC2 On-reading strings are bounded, deterministic signals. State that overlap means “shares a literal KanjiVG annotation in this slice,” or “shares an exact recorded On-reading”; neither asserts semantic, etymological, phonetic, or historical kinship.
5. **Mnemonic** — first-party memory cue, explicitly not an etymology or historical claim. Do not transform its illustrative language into a source fact. Do not assert review approval because the current seed has no review-state field.
6. **Dictionary/lexical data** — remains in the existing route, service, and JMdict/editorial infrastructure. The new route may link there; it does not import JMdict/Tatoeba rows or bypass their gates.
7. **AI** — absent from the canonical artifact and learner facts. Any future generated explanation must be a separate draft overlay with explicit AI origin and human review before publication.

There is no aggregate numeric “confidence” score. The UI uses categorical evidence labels (`source-markup`, `dictionary-fact`, `first-party-seed`, `derived-overlap`, `memory-aid`) that communicate what the evidence supports and what it does not.

## 4. Source adapter and artifact

- Official KanjiVG source: `https://github.com/KanjiVG/kanjivg`, tag `r20240807`, commit `a4b51d966d832544c371d566f9c84174e4beff3b`.
- Archive URL: `https://codeload.github.com/KanjiVG/kanjivg/tar.gz/refs/tags/r20240807`.
- Observed archive SHA-256: `a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd` (6,403,118 bytes), matching the historical Phase 14.4D manifest.
- Source license: CC BY-SA 3.0, copyright Ulrich Apel; attribution link `https://kanjivg.tagaini.net/`. Do not claim legal clearance. Keep source-derived data in an isolated artifact and preserve attribution/share-alike conditions.
- M2 slice: exactly the 33 Unicode characters in the first-party `KANJI` catalog, each mapped to its exact lower-case, five-or-more-digit code-point SVG filename. M3 regenerates the KanjiVG slice for the matching 100-character coverage set; the original 33 first-party records remain in `src/data/kanji.ts`.
- Adapter: deterministic, offline and dependency-free. It starts parsing at the `<svg>` root to ignore the source's XML declaration/DOCTYPE, reads only known SVG `g`/`path` tags/attributes needed for the model, rejects malformed/mismatched roots and unsafe/nonconforming structures, retains source path `d` values without injecting upstream markup into the DOM, and uses exact Unicode strings without normalization. No external entities, scripts, remote resources, or general SVG embedding are enabled.
- Structural graph: one glyph node per exact character; one reusable component identity per literal source element; distinct occurrence nodes for appearances; `contains` and `instance_of` relations only. Parent edges use the nearest annotated source group. A companion record preserves the direct group/path annotations needed for display and provenance. `variant_of` is not inferred from file suffixes or visual similarity.
- Reproducible KanjiVG output: `scripts/build-kanji-mindtree-slice.ts` accepts the pinned archive, an extracted source directory and output path; verifies the archive SHA-256, byte-compares every selected extracted file with its exact archive member using a fixed-argument `tar` invocation, hashes each source file, validates each graph against the observed digest/source/version/license/transform pins, and emits stable JSON. Do not check the complete archive/extracted tree into Git.
- KANJIDIC2 source pin: EDRDG source ID `upstream:kanjidic2:2023-08`, official header date `2023-08-20`, database version `2023-232`, file version `4`; exact archive is Jitendex repository commit `9cb709b87f43c7bceb494eefbe7f8b8f42744502`, path `kanjidic2_xml/kanjidic2.xml.br`, Git blob `e6e448946b29480a765f167e9ee1cc3fc9314c6b`. Archive SHA-256 `175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb`; decompressed XML SHA-256 `260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781` (15,643,593 bytes, 13,108 records).
- Current official EDRDG license notice, fetched 2026-10-29, states CC BY-SA 4.0 applies to KANJIDIC2 and derivatives and replaces prior notices. The checked-in historical acquisition contract still records CC BY-SA 3.0; M3 did not rewrite that old ETL gate. M3's separate facts artifact and `NOTICE.md` record current CC BY-SA 4.0, EDRDG attribution, field exclusions, and a manual monthly refresh procedure. Legal review/clearance is not claimed.
- Current artifact locations: `src/data/kanji-mindtree/kanjivg-structure-slice.json`, `src/data/kanji-mindtree/kanjidic2-facts-slice.json`; notices are in `src/data/kanji-mindtree/NOTICE.md`. Source-derived artifact licenses are separate from the surrounding app and first-party seed content.

## 5. Runtime assembly and interactions

The M2 runtime joins exact-character first-party rows to KanjiVG data; M3 extends it to join all 100 validated KanjiVG records to the independent KANJIDIC2 fact slice, while leaving source and first-party objects distinct:

- exact-character lookup returns one bounded glyph, its dictionary facts, optional first-party seed, annotations, mnemonic metadata, and a capped learning neighborhood;
- the component reverse index is built deterministically once from validated literal KanjiVG component identities; the reading reverse index is independently built from exact KANJIDIC2 On-reading strings;
- component selection remains by occurrence, not reusable identity, so repeated components remain independently clickable/highlightable;
- related characters use stable overlap/read-count ordering and Unicode tie-breaking; M3 caps the displayed visual-overlap list at ten, with no recursive corpus traversal;
- component family branches expand/collapse with a bounded list and carry a `from`/`via` route context; the target route exposes a return breadcrumb so navigation context is recoverable;
- the `nihongobridge-learning-neighborhood@1` graph is an explainable presentation model, not an extension of `structuralEvidenceGraph`. It is capped at depth 2, 80 nodes, and 96 edges; each edge includes label, explanation, evidence lane, and source reference. It connects annotated components/families, source-backed readings, bounded sound-overlap links, and up to four existing first-party vocabulary nodes;
- `/mindtree` lists 100 source-backed characters; `/mindtree/[character]` remains direct-addressable and shows an unsupported state without fabricating facts.

No Graphviz, D3, force-directed global graph, network query, or unbounded traversal is required. The route serializes only one selected glyph and its bounded detail neighborhood to the browser, not a full-corpus graph. The focused source visualization remains a source-faithful SVG plus a keyboard-operable nested component list.

## 6. Vocabulary and existing app integration

The existing seed's short vocabulary list remains **first-party study examples**, not JMdict records or verified lexical definitions. It is represented separately in the composed learning graph as first-party example nodes. The detail page links to the existing dictionary-backed `/kanji/[character]` route for richer lookup. Do not create a second lexical source, import example-sentence data, alter Tatoeba provenance, or add a new database table. No review/card action is added to this local explorer; existing SRS creation and ownership protections are untouched.

## 7. Accessibility, responsive behavior, and motion

- Mobile-first single-column layout; wider screens use a two-column detail composition.
- Character, labels, readings, source notes, component controls, related links, and empty states are semantic HTML with visible focus styles and descriptive accessible names.
- The SVG has a concise accessible label; stroke paths are decorative to assistive technology while the keyboard-accessible component list exposes interactions.
- Journey stage controls use buttons with current-step state; story and answer reveal controls are keyboard-operable; recall feedback uses `aria-live` and `aria-pressed` without a focus trap.
- Native `<details>` branches support expansion/collapse; relation explanations are text, not color-only labels.
- No auto-playing sequence, focus trap, or required animation. Selection/highlighting works without motion; CSS honors `prefers-reduced-motion`.

## 8. Tests, audit, and rollback

Tests cover:

- safe parsing of a small synthetic KanjiVG-like SVG, including nesting, repeated identities, path association, malformed input, root mismatch, and ignored non-stroke markup;
- graph validation against provenance pins and exact per-file hashes;
- the checked-in 100-record KANJIDIC2/KanjiVG identity match, KANJIDIC2 artifact digest, all structural graph/path references, source-separated facts, and selected coverage;
- deterministic component reverse-index family links, exact On-reading overlap explanations, graph bounds, and unsupported-character behavior;
- typed mnemonic provenance and the `Observe → Recall` reducer, staged story reveal, answer reveal, and ephemeral self-rating state;
- accessibility-related UI semantics through semantic controls, selected/current state, live feedback, and link context.

The standalone M1 synthetic contract test remains distinct from real source-backed slice validation. Database, migration, production, and unsafe legacy gate scripts are not needed. Rollback is limited to the new routes, source adapter, static artifacts, tests and docs; no schema or learner state has changed. Before completion, run narrow tests, typecheck/lint/build as feasible, `git diff --check`, and an exact branch/HEAD/worktree/package/generated-artifact audit. Stop before commit, push, PR, merge, deployment, or production access.

## 9. M3 — meaning-to-remember journey, learning graph, and bounded expansion

### Coverage and source policy

M3 expands the M2 seed from 33 to 100 exact characters without adding dictionary facts to `src/data/kanji.ts` or rewriting its existing 33 first-party records. The selected set is the 33 original seed characters plus 67 KANJIDIC2 grade-1 characters, selected deterministically by primary stroke count and then Unicode scalar order, provided each has a primary SVG in pinned KanjiVG `r20240807`. The two source artifacts must have exactly the same 100-character set.

- `src/data/kanji-mindtree/kanjivg-structure-slice.json`: 100 records and 602 path records; KanjiVG CC BY-SA 3.0; geometry, literal SVG annotations, graph records, and source-file hashes only.
- `src/data/kanji-mindtree/kanjidic2-facts-slice.json`: 100 records; KANJIDIC2 English meanings, Japanese On/Kun readings, grade, stroke count, and classical radical *index number*. Non-English meanings, separately credited third-party code/reading systems, JMdict, and example sentences are omitted.
- Existing first-party seed: 33 authored study records, vocabulary examples, radical selections, and mnemonic strings; retained separately. New KANJIDIC2-only characters have no fabricated first-party vocabulary, radical label, or mnemonic.

The existing ETL contract remains an immutable historical gate that labels its 2023-08 source CC BY-SA 3.0. M3 separately inspected the current authoritative EDRDG general license notice (fetched 2026-10-29), which says CC BY-SA 4.0 covers KANJIDIC2 and derived data and replaces previous license statements. The M3 data slice and notice therefore record CC BY-SA 4.0, EDRDG attribution, and share-alike. The old gate/registry was not silently altered. `src/data/kanji-mindtree/NOTICE.md` records both upstreams, data selection/omissions, source pins, digests, separate licenses, and a manual monthly source-refresh procedure. No legal clearance is asserted. The EDRDG update requirement is not automatically monitored; a maintainer must execute the documented refresh check.

### Typed mnemonic model and staged learning journey

`MindTreeMnemonic` in `src/lib/kanji/kanjiMindtreeCatalog.ts` wraps only the existing first-party string; it labels its source, first-party origin, unrecorded review status, and memory-only/not-etymology interpretation. It does not convert KanjiVG annotations or dictionary facts into a story. There are 33 available first-party stories and 67 entries with no story; the UI explicitly says it will not generate a substitute.

`KanjiMindTreeLearningJourney.tsx` provides a keyboard-operable `Observe → Break down → Associate → Remember → Recall` sequence:

1. **Observe:** focus on the complete glyph and separately sourced meaning.
2. **Break down:** inspect literal KanjiVG annotations with an explicit non-etymology caveat.
3. **Associate:** reveal the already-authored first-party mnemonic sentence by sentence.
4. **Remember:** cover and reveal the story again.
5. **Recall:** hide/reveal meaning or component answers and self-check without recording a grade.

The flow state is a small pure reducer (`mindtreeLearningJourney.ts`) used only by React component state. It writes no network, local storage, database, SRS, review card, account, or learner history.

### Bounded reverse index and composed learning graph

The source-markup structural graph remains unchanged in purpose and contract. `kanjiMindtreeCatalog.ts` validates the static artifacts, builds a deterministic reverse index from exact KanjiVG component identities to supported characters once, and builds a separate exact-On-reading reverse index from KANJIDIC2. Detail results expose bounded neighborhoods: up to 10 related visual-overlap characters, up to 10 members per displayed component family, and up to five same-On-reading links. Candidate order is deterministic (overlap/read count descending, then Unicode scalar order).

`src/lib/kanji/learningGraph.ts` composes a **different** `nihongobridge-learning-neighborhood@1` view model: a single kanji root, literal annotated-component nodes, a capped number of component-family kanji nodes, recorded-reading nodes, same-On-reading edges, and up to four first-party example nodes. It is limited to depth 2, 80 nodes, and 96 edges. Every edge carries a relationship label, an explanation, an evidence lane, and a source reference:

- `has-visual-annotation` — direct KanjiVG source markup, not semantic evidence;
- `shares-visual-annotation` — derived exact-identity overlap, not meaning/origin/phonetic kinship;
- `has-recorded-reading` / `shares-recorded-on-reading` — KANJIDIC2 dictionary facts, with homophone caveat;
- `has-first-party-example` — the existing NihongoBridge study seed, not JMdict.

The detail UI expands/collapses component-family branches and links to supported entries with `from`/`via` query context and a return breadcrumb. The catalog does not send the global graph to the browser: the route serializes one selected glyph plus one capped neighborhood. Structural SVG group paths stay clickable, keyboard-operable, and independently attributed.

### Data generation, attribution, and deterministic verification

- `scripts/build-kanji-mindtree-kanjidic2-slice.ts` takes only the already-verified KANJIDIC2 XML and pinned KanjiVG archive, checks both source identities, parses the KANJIDIC2 stream with the existing pure parser, applies the grade-1 selection policy, and writes a 100-row facts artifact. The provisioner is invoked with a temporary `/tmp` output for this build; no XML or compressed corpus is committed.
- `scripts/build-kanji-mindtree-slice.ts` now joins the 100 verified fact identities to the exact selected SVG members, verifies each extracted SVG byte-for-byte against the pinned archive, parses only supported SVG constructs, and emits the 100-record KanjiVG artifact.
- Runtime validation checks pinned artifact metadata, the KANJIDIC2 sidecar digest, 100-record set equality, per-file hashes as declared, graph canonical hashes, path references, and first-party coverage. Source-host access is not performed at runtime.
- Old M2 state is historical: its 33-record KanjiVG artifact was 304,441 bytes with SHA-256 `554ef63b3d4bac29475e9b477f673c4275c14f8ef881dd05c8a8f1967946266c`. M3 intentionally regenerates that artifact for 100 characters; new M3 digests are in the M3 implementation report and the product source notice.

### Product limits and boundaries

This remains a static learning slice, not a complete dictionary, etymology service, canonical component ontology, or global graph. KANJIDIC2 release facts are not JMdict vocabulary; no lexical corpus is copied or duplicated. First-party mnemonic review is unrecorded. The added 67 entries have no authored story or vocabulary examples. The current source snapshot and artifact can become stale unless the documented refresh check is performed. There is no DB/schema/service/account integration, production access, AI-authored canonical content, or SRS activation.

## 10. M4 — structured mnemonic content, editorial review, learner completion, and release preparation

### Scope and source separation

M4 preserves the exact 100-character M3 identity set and both generated source artifacts unchanged. It introduces a separate `nihongobridge-kanji-mnemonic@2` content contract in `src/lib/kanji/mindtreeMnemonicContent.ts` and an explicitly named agent-authored overlay in `src/data/kanji-mindtree/mnemonic-candidates.ts`. Records keep a stable ID, Unicode character, version, keyword, literal component-cue references, story text, optional reading hook, origin (`first_party`, `editorial`, `ai_candidate`), CMS-compatible editorial status, provenance reference, source references, interpretation caveat, and optional reviewer/review/publication evidence. Missing reviewer/date fields mean no evidence is recorded; no review identity, timestamp, approval, or publication is inferred.

The 31 remaining existing first-party mnemonic strings are structured as `draft`. The two strings the M2 implementation report explicitly identifies as AI-revised (`男`, `箸`) were removed from `src/data/kanji.ts` mnemonic fields and retained as AI candidates. M4 authored 42 new candidate stories for additional supported characters, for 44 AI-candidate drafts total. Twenty-five supported characters deliberately have no mnemonic record. These are coverage decisions, not inferred facts. All 75 structured records are drafts; 0 are in review, approved, scheduled, published, or archived.

AI-origin content is never canonical and the validator rejects AI candidates in approved/scheduled/published states. A development editor can create an independent human rewrite only as a blank `editorial` draft; neither AI text nor its component cues are copied. Component cue references are checked against exact source-group element labels where the source supplies them. Story wording is still only an invented memory association and must not claim semantic composition, radical identity, phonetic function, history, or etymology.

### Editorial state machine and publication resolver

The contract reuses the app's existing `CmsStatus` type/status vocabulary and pure `canTransition` edges in `src/services/cms/stateMachine.ts`, without changing that production CMS or calling its service/store. Approval requires an explicitly supplied reviewer identity and parseable review date; publication requires an explicitly supplied date. The studio pre-populates neither field. Content edits reset a non-draft record to draft and clear its previous review/publication evidence. A single published record per supported character is allowed. Only non-AI `published` records are returned to the learner catalog/detail model; draft, review, approved, scheduled, archived, and missing states carry no story text to the learner.

The studio is only `NODE_ENV=development`, otherwise returns 404. It uses React state and a browser download; it has no login/identity assurance, API route, server/file write, database, localStorage, IndexedDB, account, SRS, or learner-state integration. Reviewer inputs are declarations, not authentication. The JSON download is an offline review artifact and does not itself promote or deploy content. The global CMS APIs and routes remain unchanged.

### Studio evidence and completeness model

`/mindtree/studio` provides a searchable, filterable queue by editorial state plus a missing-content view; story editing; source context from KANJIDIC2 meanings/readings/grade/stroke count and literal KanjiVG group annotations/hash; reviewer evidence fields; gated state transitions; blank editorial rewrite creation; validation; and deterministic sorted overlay export. It passes a compact 100-row evidence summary, not the global learning graph or SVG path corpus. The queue shows seven distinct completeness axes: visual source, dictionary facts, first-party example availability, mnemonic record presence, review-pending workflow state, learner-visible publication, and missing mnemonic records; each is displayed against the fixed supported-set denominator.

Current static counts at M4 close: 100/100 visual records, 100/100 dictionary fact records, 33/100 first-party records with vocabulary examples, 75/100 mnemonic records, 0/100 review-pending, 0/100 published, 25/100 without a mnemonic record. Within the 75 records, 31 are first-party drafts and 44 are AI-candidate drafts. The 33 first-party study rows remain; 2 do not currently hold a seed mnemonic string because the M2 AI-revised versions are isolated in the candidate overlay.

### Learner journey and manual source refresh

The existing `Observe → Break down → Associate → Remember → Recall` activity remains session-only and now reveals a mnemonic only when the resolver returns a validated non-AI published record. Otherwise it labels the exact state (`Draft`, `Review pending`, `Approved · not published`, `Archived`, or `No mnemonic coverage`) and hides draft text. Meaning recall, source-annotation/component recall, related-kanji exploration, unsupported-character fallback, accessible keyboard controls, focus/pressed/current/live states, responsive layout, and reduced-motion-safe operation remain independent of SRS. No incorrect-answer or self-rating write is added.

`scripts/report-kanji-mindtree-source-refresh.ts` reports local artifact byte counts, pinned source metadata, expected/actual SHA-256 values, and local validation results. It performs no network access, source acquisition, automatic refresh, or ingestion and cannot establish upstream freshness or legal clearance. The manual monthly EDRDG/license and upstream revision check remains an owner task before any reviewed regeneration.

### M4 release-preparation decisions

No mnemonic is learner-published; no AI-generated content is promoted; no SRS, Phase 26F, database/schema/migration, production CMS, dependency, dictionary/lexical corpus, or route auth behavior is changed. The next controlled-release gate is human authorship/review of a non-AI record with real reviewer identity/date evidence, legal/provenance review of applicable source-derived artifacts, then a separately reviewed export-to-repository process. The local studio is not sufficient to authorize public release.
