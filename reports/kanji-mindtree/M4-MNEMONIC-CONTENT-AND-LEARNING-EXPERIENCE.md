# M4 — Mnemonic Content Studio, Editorial Review, Learning Experience & Controlled Release Preparation

**Date:** 2026-10-29  
**Outcome:** **PASS WITH RELEASE BLOCKERS** — bounded M4 implementation complete for the existing 100-character slice; no mnemonic is approved or published. Human editorial review and content publication remain intentionally blocked.  
**Scope guard:** no new character coverage, dictionary/lexical import, DB/schema/migration, production CMS change, Phase 26F change, SRS persistence/activation, dependency, deployment, commit, push, or PR.

## 1. Summary

M4 adds a structured, provenance-aware mnemonic record contract, a development-only offline editorial workspace, truthful learner publication gating, clearer coverage states, a seven-axis completeness summary, and a safe local-only source-refresh report. The M3 100-character KanjiVG/KANJIDIC2 artifacts and their identities are unchanged.

No story is served to learners unless its record is explicitly published, has a recorded reviewer and review date, and is not AI-origin. There are currently **zero** published records. All agent-authored story drafts remain in an explicitly unpublished `ai_candidate` overlay.

## 2. Repository and preflight

- Repository: `/home/user/nihingobridgeupgrade`.
- Branch: `arena/40788dd5-nihingobridgeupgrade` (active); HEAD remains `cf7a4c673236af2f507af8529dae0946fbed3bdf`.
- Pre-M4 preflight found a shallow checkout, only `origin` configured, no upstream branch, no staged changes, four pre-existing tracked M2 edits, and 24 pre-existing untracked M1/M2/M3 paths. All were preserved. No M4 files had been changed at that preflight point.
- No uploaded books/reference material were found during the home/workspace search. Candidate text below is agent-authored, not transcribed or adapted from a book or third-party mnemonic source.
- No new repository was cloned or external source material acquired for M4. The cumulative research register was read and updated.

## 3. Structured content and provenance

`src/lib/kanji/mindtreeMnemonicContent.ts` defines `nihongobridge-kanji-mnemonic@2` records with:

- stable content ID, one supported Unicode character, version, keyword, literal source-component cue references, story text, optional reading hook;
- explicit origin: `first_party`, `editorial`, or `ai_candidate`;
- CMS-compatible editorial status, provenance reference, source-reference list, and `memory-aid-not-etymology` interpretation;
- optional `reviewerId`, `reviewedAt`, and `publishedAt`. These are absent from the current records; the implementation does not invent identities or dates.

Coverage/status totals (the M3 denominator remains exactly 100):

| Dimension | Count |
|---|---:|
| Source-backed visual records | 100 / 100 |
| KANJIDIC2 fact records | 100 / 100 |
| First-party study-record rows | 33 / 100 |
| First-party rows with vocabulary examples | 33 / 100 |
| Remaining first-party mnemonic draft records | 31 |
| AI-candidate overlay records | 44 |
| Total mnemonic records | 75 / 100 |
| Supported characters with no mnemonic record | 25 / 100 |
| Draft / in review / approved / scheduled / published / archived | 75 / 0 / 0 / 0 / 0 / 0 |

The two story wordings which the M2 implementation report explicitly says were revised there (`男`, `箸`) were removed from the canonical first-party `src/data/kanji.ts` mnemonic fields, while retaining their M2-revised text in the AI-candidate overlay. M4 added **42** new agent-authored candidate stories for additional supported characters. The overlay therefore has 44 candidates total. The other 31 existing first-party strings remain first-party drafts. The 25 remaining supported characters without mnemonic records are intentionally not filled by inference.

The candidate strings are short recall cues, not linguistic facts. Every candidate record identifies AI origin and draft status. References to KanjiVG/KANJIDIC2 identify the context considered; they do not source or validate the invented story. Component-cue fields are constrained to exact KanjiVG `kvg:element` labels present for that glyph; no component meaning, dictionary radical identity, phonetic role, history, or etymology is inferred.

### Candidate content artifact

- Path: `src/data/kanji-mindtree/mnemonic-candidates.ts`.
- Size: **7,267 bytes**.
- SHA-256: `cf0709dba391da771bb524b4a7ea4e4d5fc51a423b348177473546293dfec95b`.
- Records: **44** AI candidates, all `draft`; no reviewer/date fields.
- This content is an unpublished overlay, not a canonical or learner-facing record. No legal clearance is asserted for the AI-generated text; no third-party text/data was copied.

## 4. Editorial workflow and local studio

- Development-only route: `/mindtree/studio`; the server page calls `notFound()` unless `NODE_ENV === "development"`. A development-only catalog link is rendered only in development.
- UI: `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx` provides search, editorial-status filters, a missing-coverage queue, editable fields, compact evidence context, validation, review metadata entry, workflow controls, blank human rewrite creation, and deterministic JSON download.
- The studio passes 100 compact fact/annotation summaries, not all SVG paths or the composed learning graph. It does not connect to any production CMS route/service/store.
- The existing pure `CmsStatus` vocabulary and `canTransition` state-machine edges are reused without modifying global CMS behavior. Approval requires a human-entered reviewer identity and date; publication requires a human-entered publication date. No value is auto-filled.
- AI candidates may enter a review queue but cannot transition to approved/scheduled/published. “Start blank human rewrite” creates a fresh empty editorial draft, copying neither AI story text nor component cues.
- Content edits reset an existing non-draft record to draft and clear stored review/publication evidence. One published record per character is permitted. Only non-AI published content with valid review evidence can be returned to learner pages.
- The studio is unauthenticated and is **not** a reviewer identity provider. Inputs are assertions, not verified identity. Its React state is ephemeral; JSON export is a local browser download. No API, database, localStorage, IndexedDB, filesystem/server write, SRS, learner progress, or network source ingestion is used. Reloading discards edits.

### Studio completeness dimensions

The workspace keeps independent counts for visual source, dictionary facts, first-party vocabulary examples, mnemonic record presence, actual review-queue state, learner-visible publication, and missing mnemonic records. The supported-set denominator remains fixed at 100; a draft record is not counted as reviewed or published.

## 5. Learner experience and demonstrations

The existing `Observe → Break down → Associate → Remember → Recall` route is retained. Meaning recall, literal annotation recall, and related-kanji navigation remain available without mnemonic publication. Draft text is never serialized to the learner result. The detail view states whether mnemonic coverage is a draft, in review, approved-but-unpublished, archived, published, or absent. Unsupported glyphs remain a separate source-coverage state.

Demonstration routes checked over local HTTP:

- `/mindtree` — 100-character catalog and development-only studio link.
- `/mindtree/明` — existing first-party mnemonic is in draft; story text is hidden. Expand the visual component-family branch and use the complete recall controls; answers/self-rating remain temporary.
- `/mindtree/一` — additional supported character with an AI-candidate draft hidden from learners; source-backed meaning/readings remain visible.
- `/mindtree/人` — supported visual/dictionary record with no mnemonic record; explicit missing-coverage state.
- `/mindtree/龍` — unsupported-character message; no meaning/decomposition/story is generated.
- `/mindtree/休?from=明&via=component%20日` — related-character journey context/back link remains intact.
- `/mindtree/studio` — local offline editor. Select a draft such as 明 and use “Submit to review” to demonstrate the review-pending state in session; the queue’s default static record counts remain 75 draft / 0 review. The focused test suite also exercises this transition. No reviewer/date evidence is fabricated by the demonstration.

Direct checks returned HTTP 200 for the above routes; the detail HTML did not contain the draft story. The studio route returned a first-render response of about 202 KB in the local development server. This size includes the 100 compact context rows and 75 records, not the 617 KB visual artifact or global graph. Browser automation, screen-reader user testing, and production-mode route verification were not run.

## 6. Safe manual source-refresh reporting

`scripts/report-kanji-mindtree-source-refresh.ts` reads checked-in local artifacts, computes byte counts and SHA-256 values, runs existing artifact validations, and prints a JSON integrity report. It performs no network calls, upstream acquisition, automatic refresh, or ingestion. A successful result means only “local artifacts match pinned expected metadata,” not “upstream is current,” “terms are unchanged,” or “legally cleared.” Manual review of the official EDRDG license notice and source revisions remains required before any refresh.

Source-refresh report outcome: **`PASS_LOCAL_ARTIFACTS`**; `networkAccess=false`; `automaticIngestion=false`; `refreshPerformed=false`; `manualReviewRequired=true`.

## 7. Source identity and hashes

The existing source-derived artifacts were not regenerated or changed in M4:

| Artifact | Exact identity | Size / records | SHA-256 |
|---|---|---:|---|
| KanjiVG source archive | official `KanjiVG/kanjivg`, tag `r20240807`, commit `a4b51d966d832544c371d566f9c84174e4beff3b` | 6,403,118 bytes | `a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd` |
| `kanjivg-structure-slice.json` | 100 glyphs; 602 paths; KanjiVG CC BY-SA 3.0 | 617,047 bytes | `03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862` |
| KANJIDIC2 XML | `Jitendex/edrdg-dictionary-archive@9cb709b87f43c7bceb494eefbe7f8b8f42744502`, blob `e6e448946b29480a765f167e9ee1cc3fc9314c6b` | 15,643,593 bytes; 13,108 records | `260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781` |
| `kanjidic2-facts-slice.json` | 100 English/Japanese fact records; EDRDG KANJIDIC2 CC BY-SA 4.0 terms | 36,356 bytes | `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6` |
| M4 `mnemonic-candidates.ts` | agent-authored AI candidate overlay only | 7,267 bytes; 44 records | `cf0709dba391da771bb524b4a7ea4e4d5fc51a423b348177473546293dfec95b` |

License, attribution, revisions, field exclusions, intended transformations, and manual update procedure are in `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md` and `src/data/kanji-mindtree/NOTICE.md`. The KanjiVG CC BY-SA 3.0 and current EDRDG/KANJIDIC2 CC BY-SA 4.0 licenses remain separate. The older local KANJIDIC2 ETL gate’s historical CC BY-SA 3.0 metadata was not changed. This documentation is not legal advice or clearance.

## 8. Verification

| Check | Result | Scope |
|---|---|---|
| Focused M3 + M4 Vitest | **PASS** | `npx vitest run --config /tmp/kanji-mindtree-m4-vitest.config.mjs`: 2 files, 15 tests passed. Temporary config has `setupFiles: []`, avoiding the DB setup. |
| M1 structural contract | **PASS** | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/kanji-mindtree-contract.test.mjs`: 21 passed, 0 failed. |
| TypeScript | **PASS** | `npm run typecheck` (`tsc --noEmit`). |
| Targeted ESLint | **PASS** | All M4/MindTree source, route, test, and refresh-script files; no diagnostics. |
| Local artifact source-refresh check | **PASS** | `node --import tsx scripts/report-kanji-mindtree-source-refresh.ts`; both hashes match; joined-slice and KANJIDIC2 validations have no issues. |
| Runtime route demonstrations | **PASS** | HTTP 200 for catalog, draft/hidden, missing coverage, unsupported, studio and related-context routes; no candidate story leaked to learner HTML. |
| `git diff --check` | **PASS** | No whitespace errors. |
| Full `npm test` | **NOT RUN** | Repository `vitest.config.ts` loads `tests/setup.ts`, which connects to real PostgreSQL. No DB URL or database access was used. |
| `npm run build` | **NOT RUN** | The app can prerender database-backed pages; no local DB was configured. The new route source is development-gated; no production build/runtime test was attempted. |
| Browser automation / user testing | **NOT RUN** | Route-level HTTP checks and focused tests only. |
| Database / migrations / production / SRS / Phase 26F | **NOT RUN / prohibited** | No database, schema, migration, production endpoint, SRS write, Phase 26F path, or release activation was accessed. |

The existing root route had previously returned 500 in the development preview because `DATABASE_URL` is absent. This is an existing, unrelated app requirement and was not changed or masked. Direct MindTree routes render without a database.

## 9. Release-readiness assessment and blockers

**M4 implementation outcome: PASS WITH CONDITIONS.** The technical release-preparation guardrails are in place, but a public learner release is **not ready**:

1. **No human approval exists.** 75 records are drafts; the review queue has zero submitted records by default; none has reviewer/date evidence; none is approved or published. Draft copy is hidden from learners.
2. **AI copy cannot be promoted.** 44 AI-candidate records remain unpublished. Any later human content must be independently authored as an editorial record; a human cannot simply approve the AI text in this system.
3. **Studio identity is unverified.** It is dev-only and unauthenticated, suitable for local review preparation only; not a production editorial CMS.
4. **Content and license review remain open.** Candidate copy requires human editorial review. Source-derived distributions need continued attribution/share-alike compliance review; the register is not legal clearance.
5. **Upstream freshness is not established by the local report.** The monthly EDRDG/license/source refresh remains a manual owner responsibility.
6. **No deployment or full application build has been cleared.** Root DB behavior and full build/test gates remain outside this safe local slice.

A later release decision requires non-AI human-authored/re-authored content, actual reviewer identity/date evidence, a separately reviewed export/change process, legal/source review, and product-owner approval. M4 itself does not authorize those steps.

## 10. Final Git, artifact, and safety audit

- Branch remains `arena/40788dd5-nihingobridgeupgrade`; HEAD remains `cf7a4c673236af2f507af8529dae0946fbed3bdf`; repository remains shallow; only `origin` exists and no upstream is configured.
- No files staged. No commit, push, PR, merge, branch change, rebase, deployment, or history rewrite.
- Final worktree: 4 tracked-modified paths and 31 untracked paths (24 pre-M4 M1/M2/M3 paths preserved; 7 new M4 paths). The final untracked path list is enumerated below.
- The four tracked-modified paths remain the four pre-existing M2 paths: `src/app/kanji/[character]/page.tsx`, `src/app/kanji/page.tsx`, `src/components/layout/Navbar.tsx`, `src/data/kanji.ts`. The M4 edit to `src/data/kanji.ts` is only the two AI-assisted mnemonic fields set to `null`; the candidate overlay preserves the M2-revised wording. Existing other tracked edits were not reset.
- `package.json`, `package-lock.json`, and all other lockfiles are unchanged; no dependency was added.
- Existing M3 generated artifact hashes remain byte-identical as listed above. M4 added only the small authored candidate overlay, app code, focused test, offline report script, and docs; no new upstream dataset/media was added. `/tmp` archives/XML remain outside Git.
- No `src/db`, DB schema/migrations, Phase 26F, SRS storage/review endpoints, auth/ownership, or production CMS behavior was modified. Full `npm test` and `npm run build` were deliberately not run to avoid database-dependent setup/prerendering.
- `next-env.d.ts` is unchanged. Local ignored `.next/`, `node_modules/`, and TypeScript cache output are not part of the patch.

### Paths at M4 close

**Tracked modified (4):**

- `src/app/kanji/[character]/page.tsx`
- `src/app/kanji/page.tsx`
- `src/components/layout/Navbar.tsx`
- `src/data/kanji.ts`

**Untracked M1/M2/M3 work preserved, plus M4 additions:**

- `docs/architecture/KANJI-MINDTREE-M1-A-CONTRACT.md`
- `docs/architecture/KANJI-MINDTREE-PRODUCT-ARCHITECTURE.md`
- `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md`
- `reports/kanji-mindtree/M1-C-SOURCE-PROVENANCE-AND-ARTIFACT-VERIFICATION-PLAN.md`
- `reports/kanji-mindtree/M2-VERTICAL-SLICE-IMPLEMENTATION-AND-VERIFICATION.md`
- `reports/kanji-mindtree/M3-MEANING-TO-REMEMBER-IMPLEMENTATION.md`
- `reports/kanji-mindtree/M4-MNEMONIC-CONTENT-AND-LEARNING-EXPERIENCE.md`
- `scripts/build-kanji-mindtree-kanjidic2-slice.ts`
- `scripts/build-kanji-mindtree-slice.ts`
- `scripts/report-kanji-mindtree-source-refresh.ts`
- `src/app/mindtree/[character]/page.tsx`
- `src/app/mindtree/page.tsx`
- `src/app/mindtree/studio/page.tsx`
- `src/components/kanji/KanjiMindTreeCatalog.tsx`
- `src/components/kanji/KanjiMindTreeExplorer.tsx`
- `src/components/kanji/KanjiMindTreeLearningJourney.tsx`
- `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx`
- `src/data/kanji-mindtree/NOTICE.md`
- `src/data/kanji-mindtree/kanjidic2-facts-slice.json`
- `src/data/kanji-mindtree/kanjivg-structure-slice.json`
- `src/data/kanji-mindtree/mnemonic-candidates.ts`
- `src/lib/kanji/kanjiMindtreeCatalog.ts`
- `src/lib/kanji/kanjiVgSvgAdapter.ts`
- `src/lib/kanji/kanjidic2MindtreeFacts.ts`
- `src/lib/kanji/learningGraph.ts`
- `src/lib/kanji/mindtreeLearningJourney.ts`
- `src/lib/kanji/mindtreeMnemonicContent.ts`
- `src/lib/kanji/structuralEvidenceGraph.ts`
- `tests/kanji-mindtree-contract.test.mjs`
- `tests/kanji-mindtree-m4.test.ts`
- `tests/kanji-mindtree-product.test.ts`
