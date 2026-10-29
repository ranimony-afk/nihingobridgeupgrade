# NIHONGOBRIDGE — Kanji MindTree M7: Human-Review Workflow and Accessibility Validation

- **Executive verdict:** PASS WITH CONDITIONS for the bounded implementation and isolated automated checks. The actual human pilot gate remains BLOCKED.
- **Date:** 2026-10-29
- **Repository:** `/home/user/nihingobridgeupgrade` (`ranimony-afk/nihingobridgeupgrade`)
- **Initial/final branch and HEAD:** `arena/40788dd5-nihingobridgeupgrade` / `cf7a4c673236af2f507af8529dae0946fbed3bdf`
- **Scope:** Harden the existing local review workflow, revision/evidence validation, v2 export history consistency, learner-containment regressions, and accessibility affordances. Keep M1–M6 and the 100-character source-backed corpus. No real review, approval, release authorization, publication, importer, identity provider, API, database, or schema change was made.

“Pass with conditions” applies only to M7 implementation and checks that actually ran. It is **not** a verdict that any pilot content has been human-reviewed or is safe to release. No qualified Japanese-language reviewer participated in this session.

## 1. Repository identity and pre-M7 preservation baseline

Before editing, read-only preflight confirmed:

- Root: `/home/user/nihingobridgeupgrade`.
- Branch: `arena/40788dd5-nihingobridgeupgrade` — matched the previously reported Arena identity.
- HEAD: `cf7a4c673236af2f507af8529dae0946fbed3bdf` — matched the previously reported Arena identity.
- Remote: `origin` → `https://github.com/ranimony-afk/nihingobridgeupgrade.git` (fetch/push).
- Shallow clone: `true`.
- Initial Git status: **4 tracked modified paths**, **43 untracked paths**, **0 staged paths**, **0 deletions**.
- Initial tracked modifications, all present before M7: `src/app/kanji/[character]/page.tsx`, `src/app/kanji/page.tsx`, `src/components/layout/Navbar.tsx`, and `src/data/kanji.ts`.
- The 43 initial untracked paths were the inherited M1–M6 work. Their complete pre-M7 path inventory is recorded in M6 report §12. M7 did not remove or replace those files.

Before M7 changes, SHA-256 and row-count checks confirmed the two source artifacts each contain 100 records and match their pins; the candidate overlay hash also matched. Final confirmation is in §12.

## 2. M6 baseline verification and discrepancies found

The actual M6 report, M5 report, M1 structural contract, M2–M4 architecture material, M4/M5/M6 focused tests, review/readiness schemas, studio, learner resolver, export verifier, test setup, package scripts, and source-refresh check were inspected. Current-state checks independently confirm 75 unique mnemonic records (31 first-party, 44 AI candidates), all `draft`; 0 records carry reviewer/review/publication fields; and no `人` mnemonic exists. The five M6 pilot identifiers/origins remain as reported. No importer/apply/publish route was found. The learner route obtains data from `getMindTreeEntry(character)`, not an export package.

M6's principal scope claims were consistent, but inspection found these material workflow/verifier gaps; all are addressed below:

1. **Preselected acceptance:** `reviewOutcome` initialized to `accepted` and record selection reset it to `accepted`. A user could submit an acceptance without deliberately choosing that outcome. It now starts at an empty value, has a placeholder, and requires an explicit outcome selection.
2. **No exact-revision acknowledgement / canonical display:** the review panel showed a digest but did not present the canonical revision JSON or a separate acknowledgement that the reviewer inspected it. The panel now exposes canonical JSON, record/version/origin/provenance/source context, and requires an exact-digest acknowledgement.
3. **Unsaved revision ambiguity:** the prior UI allowed a decision on unsaved edits without incrementing the local version. This could package two different contents with the same record/version. The action now requires saving or cancelling edits first; local save increments the version, changes the digest, and requires a fresh acknowledgement.
4. **Version was not compared independently:** `digestMnemonicRevision` includes `version`, but the readiness evaluator matched review freshness by content digest alone. Because the local evidence digest is not authenticated, a caller could alter the event’s version and recompute its SHA-256 while retaining the old content digest. M7 now requires both exact current version and exact current content digest.
5. **Nested evidence shape was not strict:** the top-level review-evidence keys were strict, but the nested `reviewedRevision` object could carry additional keys if its digest were recomputed. M7 rejects any nested key set other than `version`, `digestAlgorithm`, and `contentDigest`.
6. **Same-version package-history conflict:** the v2 verifier checked duplicate historical version numbers and evidence binding, but did not reject a history item whose record ID/version matched a current packaged record while its content differed. The builder and verifier now reject absent-record history, character mismatch, future versions, and same-version/current-content conflicts.
7. **Verification boundaries:** M6’s browser, assistive-technology, and manual interaction limitations remain real. This checkout contains no browser automation package or browser executable, so M7 does not claim a browser-driven interaction or screen-reader audit.

M6’s local-only attribution/timestamp limits, approval/release separation, disabled approved-release-candidate action, and fail-closed learner resolver were retained. The record inventory and the three pinned artifact hashes remain unchanged.

## 3. M7 implementation and changed paths

M7 changed only the following inherited untracked implementation files and added two files:

- `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx` — remove default acceptance; require an explicit decision, reviewer-attribution text, saved revision, and acknowledgement bound to the displayed digest; display canonical revision JSON and provenance; improve action status/focus behavior and review-control focus affordances.
- `src/lib/kanji/mindtreeEditorialEvidence.ts` — add a UI eligibility guard; strictly validate the exact nested revision object keys.
- `src/lib/kanji/mindtreeReleaseReadiness.ts` — require both revision version and revision digest to match current content.
- `src/lib/kanji/mindtreeMnemonicExport.ts` — validate current/history consistency in both builder and verifier.
- `tests/kanji-mindtree-m7.test.ts` — new isolated freshness, workflow guard, learner containment, malformed/tampered package, and studio source-contract regression tests.
- `reports/kanji-mindtree/M7-HUMAN-REVIEW-WORKFLOW-AND-ACCESSIBILITY-VALIDATION.md` — this report.

No tracked path, M6 report, M1–M6 source artifact, package manifest, lockfile, CMS state machine, historical source contract, database schema, migration, Phase 26F path, or SRS path was edited by M7.

## 4. Review interaction, revision binding, and digest semantics

The studio’s decision flow now has no default outcome. A reviewer must explicitly choose `accepted`, `changes_requested`, or `rejected`; enter local attribution; acknowledge the exact displayed revision; and invoke the decision action. The action remains unavailable until the content revision is locally saved and its current digest is acknowledged. Editing relevant content invalidates the acknowledgement; saving creates a new local version and digest, so acknowledgement must be repeated. Unsaved content must be saved or cancelled before recording a review statement.

The review panel now displays the character, record ID, version, origin, provenance reference, source-context references, current SHA-256, and an expandable canonical revision JSON representation. The visible explanation states which record fields enter the canonical revision and that lifecycle/reviewer metadata and volatile UI state do not. Current quality findings and source-backed meanings/readings/glyph annotations remain visible in the same review context. Provenance references are explicitly described as context, not proof of story origin.

M7 verifies that the revision digest changes when any of these fields changes: schema, record ID, character, version, keyword, component cues, story, reading hook, origin, provenance reference, source references, or interpretation. Lifecycle status and unrelated ephemeral UI state are excluded. Evidence verification recomputes canonical evidence JSON SHA-256; nested unsupported fields fail closed. Readiness now treats a review as current only when **both** `reviewedRevision.version === record.version` and the reviewed SHA-256 equals the freshly recomputed digest.

A digest is an integrity check, not a signature. The local reviewer-attribution field is unauthenticated, reviewer role/qualification is not established, and `reviewedAt` remains `null` because there is no trusted timestamp source. Evidence is in browser memory until the user explicitly downloads a package; there is no durable append-only store. An accepted local outcome remains `reviewed_not_approved` and cannot grant approval or release authorization.

## 5. Export/verifier and learner-visibility regression results

The M7 export fix rejects a revision history that:

- refers to a record absent from the package;
- changes the character for an existing record ID;
- contains a version higher than the current packaged version; or
- has different content for the same record ID and version as the current packaged record.

Tests verify both builder and verifier rejection for divergent same-version history, including a re-digested package. Existing M6 tests continue to cover deterministic repeated v2 package output, altered package digest, strict package fields/version, malformed evidence, contradictory release state, and release-candidate rejection. There is still no importer, apply operation, or publication endpoint.

M7 regressions confirm that:

- `明` remains hidden for the legacy CMS states `draft`, `review`, `approved`, `published`, and `archived`; synthetic lifecycle values used to exercise these branches exist only inside test code and are not human-review evidence.
- `一` remains an AI candidate, and the three synthetic local outcome fixtures (`accepted`, `changes_requested`, `rejected`) do not make its story visible. These are test fixtures only, not actual decisions.
- Internal note/provenance sentinels are absent from learner serialization.
- A manipulated exported story fails package verification and is not consumed by the learner route; the route source resolves only via `getMindTreeEntry(character)` and has no export-verifier import.
- `男` remains hidden; `人` remains supported with `missing` mnemonic availability; `龍` and multi-character `明人` remain unsupported.
- A legacy `published` field alone still cannot bypass the separate trusted release gate (no such gate is implemented or populated in M7).

These are isolated function/source-contract regressions, not browser/server-rendered response measurements. No M7 HTML, live-route, or client browser test is claimed.

## 6. Browser and accessibility validation

**Browser-driven workflow test: NOT AVAILABLE / NOT RUN.** Preflight found no Playwright, Puppeteer, Cypress, jsdom, or happy-dom dependency, and no Chromium, Chrome, or Firefox executable. No large browser dependency was installed. A React/Vitest source-contract test now checks that the studio has an empty outcome default, explicit exact-revision acknowledgement, saved-revision gating, visible keyboard focus styling, live status semantics, and status focus after successful save/cancel/review actions. This guards source contracts; it is not a browser interaction test.

Code inspection confirms native labels for review inputs/selects, a labelled exact-revision checkbox, visible focus styles on review controls, semantic headings/sections, native `<details>` disclosures, text labels for warning severity (not color alone), and an `aria-live` status message. Successful local save, cancel, and review actions focus that status message after update; workflow validation uses the live status region, while stale-evidence and export failures use alert semantics. No dialog or focus-trap is used. The page uses responsive grid breakpoints already present in the studio.

**Not tested:** keyboard-only operation in an actual browser, actual tab order, narrow viewport rendering, actual focus retention during Next/React updates, screen-reader announcements, contrast measurement, assistive-technology use, browser download behavior, or manual visual inspection. No screen-reader audit is claimed. Complete the manual walkthrough in §11 before calling interaction/accessibility validation complete.

## 7. Per-record M7 pilot gate assessment

The evaluator was rerun from current repository records with an empty review-evidence list. No reviewer input was supplied or synthesized into the corpus.

| Character / record | Current origin | Readiness | Review evidence | Principal reasons | Approval / release |
|---|---|---|---|---|---|
| `明` / `first-party-660e` | First-party | `blocked` | Absent | Generic shared first-party provenance; quality prompts; automated checks do not establish Japanese correctness; approval evidence absent. | `not_supported` / `not_granted` |
| `休` / `first-party-4f11` | First-party | `blocked` | Absent | Generic provenance/source pointer; quality prompts; automated checks do not establish Japanese correctness; approval evidence absent. | `not_supported` / `not_granted` |
| `一` / `m4-ai-4e00` | AI candidate | `awaiting_human_review` | Absent | AI origin cannot be relabeled; source references are context only; human review absent; quality prompts remain. | `not_supported` / `not_granted` |
| `男` / `m4-ai-otoko` | AI candidate carry-forward | `awaiting_human_review` | Absent | AI origin cannot be relabeled; incomplete AI revision history; context-only references; human review absent; quality prompts remain. | `not_supported` / `not_granted` |
| `人` / no record | Missing | `blocked` | No record/evidence | `MISSING_MNEMONIC_RECORD`; no content or origin inferred. | `not_supported` / `not_granted` |

Exact current revision digests remain:

- `明`: `52e5af8146451c7950ca2d310aee33f9e582b02045c99b27108621187e9b68e2`
- `休`: `99f914403ccc9b6d06075118d1325f7ebf62d5397252846de886c6b0e32b7e72`
- `一`: `ee81b87293bb65e0f1f478c160a5af7cceccce138933c97fc01076fe6fb061a8`
- `男`: `ac2252976e25b84a740f45aae9693db5b16f70f2fc7560e9cff8c8b7a71d5df5`
- `人`: none (no record).

`QUALITY_FINDING` denotes deterministic editorial prompts, not a language-quality verdict. No pilot is eligible for release review. No content was rewritten to make a test pass; AI origin and missing coverage remain unchanged.

## 8. Editorial-quality assistance

The existing quality helper uses stable rule codes, severity, concise message, field association, and `humanDecisionRequired`. M7 added a regression contract over those fields and did not expand heuristics into an approval/rejection mechanism. Findings such as `CANDIDATE_NOT_REVIEWED`, `REVIEW_EVIDENCE_MISSING`, `POSSIBLE_ETYMOLOGY_CLAIM`, `UNSUPPORTED_COMPONENT_CUE`, and human clarity/fact prompts remain explainable flags. Exact string/readings overlap is not Japanese correctness; KanjiVG component annotations do not establish meaning or historical derivation. The readiness reason continues to explicitly state that automation cannot establish language correctness.

## 9. Exact commands and outcomes

Package scripts and setup were inspected before running checks. `npm test` invokes repository Vitest config and `tests/setup.ts`, which loads dotenv for PostgreSQL-backed tests. The isolated MindTree config has `setupFiles: []`; the included M1–M7 tests use local fixtures and reads and do not load that setup. No fixed-output artifact generator was run; source-refresh is read-only.

| Command/check | Actual outcome |
|---|---|
| Initial `npx vitest run --config vitest.mindtree.config.ts` before dependency installation | **FAILED TO START** — `node_modules` was absent; transient `npx` Vitest could not resolve project `vitest/config`. |
| Initial `npm run typecheck` | **FAILED TO START** — `tsc: not found` because locked dependencies were not installed. |
| Initial targeted `npx eslint ...` | **FAILED TO START** — transient `npx` ESLint could not load project ESLint config/dependencies. |
| `npm ci` | **PASS** — installed the existing lockfile dependency set (445 packages); did not add dependencies or change package/lockfile. npm’s install audit reported 12 dependency advisories (6 moderate, 5 high, 1 critical); no `npm audit fix` was run. |
| `npx vitest run --config vitest.mindtree.config.ts` (final) | **PASS** — 5 files, **32 tests**: product/M2–M3 slice tests 11, M4 4, M5 5, M6 6, M7 6. |
| `node --import tsx tests/kanji-mindtree-contract.test.mjs` | **PASS** — **21 tests** for M1 synthetic structural-evidence contract. |
| `npm run typecheck` | **PASS** — `tsc --noEmit`. |
| Targeted `npx eslint src/components/kanji/KanjiMindTreeMnemonicStudio.tsx src/lib/kanji/mindtreeEditorialEvidence.ts src/lib/kanji/mindtreeReleaseReadiness.ts src/lib/kanji/mindtreeMnemonicExport.ts tests/kanji-mindtree-m7.test.ts` | **PASS** — no lint output. |
| `node --import tsx scripts/report-kanji-mindtree-source-refresh.ts` | **PASS_LOCAL_ARTIFACTS** — both 100-row source artifacts and validators pass; no network, acquisition, or refresh. |
| `git diff --check` | **PASS** — final audit below. |
| Repository-wide `npm test` | **NOT RUN** — PostgreSQL setup; no authorization/preconditions for DB-connected suite. |
| Production build, database-backed routes, migrations | **NOT RUN** — not necessary for this bounded check and unsafe/out of scope. |
| Browser automation, screen reader, human Japanese review | **NOT RUN / UNAVAILABLE** — no suitable installed browser harness; no reviewer participated. |

The final Vitest run printed a non-blocking Vite warning that the `.ts` config’s ESM syntax is unsupported by the future `configLoader: 'native'` default. All selected tests passed. The initial missing-dependency command failures are recorded above rather than omitted; they were rerun after installing only the already-locked dependencies.

## 10. Source pins, licensing, and provenance

M7 did not modify corpus data, upstream identifiers, historical source contracts, notices, or license claims. Preflight and final offline integrity checks agree:

- KanjiVG 100-glyph artifact: SHA-256 `03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862` (100 records; 617,047 bytes); source remains `r20240807` / `a4b51d966d832544c371d566f9c84174e4beff3b`, CC BY-SA 3.0.
- KANJIDIC2 fact artifact: SHA-256 `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6` (100 records; 36,356 bytes); source remains the 2023-08 release, current notice recorded as CC BY-SA 4.0.
- M4 AI candidate overlay: SHA-256 `cf0709dba391da771bb524b4a7ea4e4d5fc51a423b348177473546293dfec95b`.

The existing research register documents exact source revisions, attributions, share-alike and update responsibilities, as well as the historical ETL-contract license discrepancy. No legal clearance is asserted. M7 adds no external content, source, or dependency to the app.

## 11. Manual steps still required from a real reviewer

A real reviewer must perform the following before any content is described as human-reviewed:

1. Open `/mindtree/studio` in a supported local browser, select one bounded pilot record, inspect its exact character, dictionary facts, source-backed glyph annotations, origin, provenance, source references, quality flags, canonical revision JSON, and full digest.
2. For `明`/`休`, resolve the generic first-party origin/source pointer and confirm authorship/revision rights. For `一`/`男`, keep AI origin explicit; do not relabel or promote them through this workflow. `人` remains missing unless separately authored content is independently in scope.
3. Save or cancel any edit first. Recheck the version/digest after saving. Personally inspect that exact revision, then explicitly acknowledge it, enter a truthful local attribution, choose an outcome, and record evidence only if you actually performed the review. Summarize notes/issue/provenance concerns honestly. This remains a local unauthenticated assertion—not proof of identity, qualification, or trusted time.
4. Edit a reviewed field and verify the acknowledgement invalidates; save the new revision and verify the old event appears stale. Inspect deterministic export and tamper/history validation. Confirm no release-candidate, approval, or publish control exists.
5. Complete keyboard-only and narrow-viewport walkthrough; verify focus/status behavior and actual downloadable files. Use an actual screen reader for any screen-reader conclusion. None of these human/browser actions is claimed completed in this report.
6. A separately authorized governance process must establish authenticated reviewer roles, trusted timestamps, durable audit evidence, independent approval, release authorization, publication and rollback. M7 does not implement or authorize that process.

## 12. Final preservation audit and gate recommendation

Final Git audit confirms:

- Branch/HEAD unchanged: `arena/40788dd5-nihingobridgeupgrade` / `cf7a4c673236af2f507af8529dae0946fbed3bdf`; shallow clone remains `true`; `origin` remains the only reported remote.
- **4 tracked modifications** are the exact pre-M7 inherited set from §1; M7 changed no tracked file.
- **45 untracked paths** = the 43 inherited M1–M6 paths plus two M7 additions. Complete final inventory (M7-touched inherited paths marked `*`, M7 additions marked `+`):
  - `docs/architecture/KANJI-MINDTREE-M1-A-CONTRACT.md`
  - `docs/architecture/KANJI-MINDTREE-PRODUCT-ARCHITECTURE.md`
  - `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md`
  - `reports/kanji-mindtree/M1-C-SOURCE-PROVENANCE-AND-ARTIFACT-VERIFICATION-PLAN.md`
  - `reports/kanji-mindtree/M2-VERTICAL-SLICE-IMPLEMENTATION-AND-VERIFICATION.md`
  - `reports/kanji-mindtree/M3-MEANING-TO-REMEMBER-IMPLEMENTATION.md`
  - `reports/kanji-mindtree/M4-MNEMONIC-CONTENT-AND-LEARNING-EXPERIENCE.md`
  - `reports/kanji-mindtree/M5-EDITORIAL-REVIEW-AND-LEARNING-QUALITY.md`
  - `reports/kanji-mindtree/M6-CONTROLLED-HUMAN-REVIEW-PILOT-AND-RELEASE-READINESS.md`
  - `reports/kanji-mindtree/M7-HUMAN-REVIEW-WORKFLOW-AND-ACCESSIBILITY-VALIDATION.md` (+)
  - `scripts/build-kanji-mindtree-kanjidic2-slice.ts`
  - `scripts/build-kanji-mindtree-slice.ts`
  - `scripts/report-kanji-mindtree-source-refresh.ts`
  - `src/app/mindtree/[character]/page.tsx`
  - `src/app/mindtree/page.tsx`
  - `src/app/mindtree/studio/page.tsx`
  - `src/app/mindtree/studio/preview/[character]/route.ts`
  - `src/components/kanji/KanjiMindTreeCatalog.tsx`
  - `src/components/kanji/KanjiMindTreeExplorer.tsx`
  - `src/components/kanji/KanjiMindTreeLearningJourney.tsx`
  - `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx` (*)
  - `src/data/kanji-mindtree/NOTICE.md`
  - `src/data/kanji-mindtree/kanjidic2-facts-slice.json`
  - `src/data/kanji-mindtree/kanjivg-structure-slice.json`
  - `src/data/kanji-mindtree/mnemonic-candidates.ts`
  - `src/lib/kanji/kanjiMindtreeCatalog.ts`
  - `src/lib/kanji/kanjiVgSvgAdapter.ts`
  - `src/lib/kanji/kanjidic2MindtreeFacts.ts`
  - `src/lib/kanji/learningGraph.ts`
  - `src/lib/kanji/mindtreeEditorialEvidence.ts` (*)
  - `src/lib/kanji/mindtreeEditorialPilot.ts`
  - `src/lib/kanji/mindtreeLearningJourney.ts`
  - `src/lib/kanji/mindtreeMnemonicContent.ts`
  - `src/lib/kanji/mindtreeMnemonicExport.ts` (*)
  - `src/lib/kanji/mindtreeMnemonicQuality.ts`
  - `src/lib/kanji/mindtreeMnemonicRevisions.ts`
  - `src/lib/kanji/mindtreeReleaseReadiness.ts` (*)
  - `src/lib/kanji/structuralEvidenceGraph.ts`
  - `tests/kanji-mindtree-contract.test.mjs`
  - `tests/kanji-mindtree-m4.test.ts`
  - `tests/kanji-mindtree-m5.test.ts`
  - `tests/kanji-mindtree-m6.test.ts`
  - `tests/kanji-mindtree-m7.test.ts` (+)
  - `tests/kanji-mindtree-product.test.ts`
  - `vitest.mindtree.config.ts`
- **0 staged paths; 0 deletions.** `package.json` and `package-lock.json` have no tracked diff after `npm ci`. `git diff --check` passes.
- All three source/candidate hashes match the preflight baseline; both source-backed fact/visual slices still contain 100 records. No corpus expansion or source regeneration occurred.
- No database, Supabase, schema, migration, Phase 26F, SRS, production build, or database-backed test operation occurred. No external research, publication, or release action occurred.
- No file was staged, committed, pushed, merged, deployed, or opened as a PR. No branch switch occurred. No actual human review evidence was generated outside explicitly isolated automated fixtures.

**Gate recommendation: PASS WITH CONDITIONS for M7’s bounded implementation/tests; keep every pilot record blocked or awaiting review as shown in §7. Do not authorize publication or release.** Human Japanese-language judgment, provenance resolution, browser interaction and accessibility walkthrough, and a separate trusted approval/release process remain required.
