# NIHONGOBRIDGE — Kanji MindTree M6: Controlled Human-Reviewed Pilot, Editorial Evidence Integrity, and Release-Gate Readiness

**Outcome: IMPLEMENTED AS BOUNDED LOCAL REVIEW/READINESS TOOLING; NOT HUMAN-REVIEWED, NOT APPROVED, NOT RELEASE-READY, AND NOT AUTHORIZED FOR LEARNER PUBLICATION.**  
**Date:** 2026-10-29  
**Repository:** `ranimony-afk/nihingobridgeupgrade`  
**Branch / baseline:** `arena/40788dd5-nihingobridgeupgrade` at `cf7a4c673236af2f507af8529dae0946fbed3bdf` (the available shallow/grafted baseline)  
**Scope:** Code, tests, documentation, and local-only tooling for the existing M1–M5 Kanji MindTree fixed 100-character corpus. No corpus expansion, external service, database/schema work, production CMS, publication action, or release authorization was added.

M6 adds a local exact-revision review-evidence format, pilot readiness assessment, a bounded review matrix in `/mindtree/studio`, and a stricter v2 offline export verifier. No actual human review occurred during this implementation. Automated tests use explicitly synthetic fixtures; they do not represent review of Japanese content or human approval.

## 1. Repository identity, baseline, and preservation boundary

Preflight established the active branch as `arena/40788dd5-nihingobridgeupgrade`, HEAD `cf7a4c673236af2f507af8529dae0946fbed3bdf`, `origin` as the configured remote, and a shallow/grafted checkout with only the baseline commit locally available. At the start of M6, four pre-existing tracked M2 paths were modified:

- `src/app/kanji/[character]/page.tsx`
- `src/app/kanji/page.tsx`
- `src/components/layout/Navbar.tsx`
- `src/data/kanji.ts`

M1–M5 implementation and reports were already present as untracked work. They have been preserved. The final audit is recorded in §12; it distinguishes these inherited workspace changes from M6 additions/edits. No staging, commit, push, PR, branch switch, reset, clean, stash, destructive checkout, rebase, migration, database operation, deployment, or production action was performed.

## 2. M5 claims independently checked for this continuation

The M5 report was read, and its scope-critical state was checked against the current repository rather than accepted solely from its narrative.

| Item | Independently checked M6 finding |
|---|---|
| Supported corpus | The current source-refresh validator passes for both 100-record artifacts. No corpus records were added or removed. |
| Mnemonic records | Current tests/probes confirm 75 unique record IDs, all `draft`: 31 first-party seed records and 44 AI-candidate overlay records. No record has reviewer/date/publication fields populated. There are 25 supported characters without mnemonic records; `人` is one. |
| First-party provenance | The 31 first-party rows use the shared generic `first-party:kanji-mindtree:v1` provenance/source pointer; that is not individual author/revision evidence. |
| AI candidates | AI rows remain `ai_candidate` and `draft`. In particular, `一` (`m4-ai-4e00`) is a candidate; `男` (`m4-ai-otoko`) is the carry-forward identified in M4 as AI-revised. The inspected record model contains no competing saved revision history for that carry-forward. |
| Reviews / approval / publication | No actual human review, authenticated reviewer, approval, release authorization, or published record was found in the inspected corpus. This is not a claim that a human has reviewed any selected case. |
| Import path | Source search found no mnemonic importer, apply operation, or publish operation. M6 adds package verification only; it does not add an importer. |
| M5 route claims | M5's reported local HTTP route responses and server-rendered HTML inspection were not repeated in this M6 session. They remain M5-reported results, not M6 verification. |

M5's three package actions were inspected in the current implementation. M6 retains a draft working snapshot and one-record proposed human-review package; the proposed package is not submitted to a service. The prior approved-release-candidate package action is now intentionally disabled in the UI and rejected by the builder because no trusted approval/release evidence model exists. There is no status transition or publication action in the M6 studio.

## 3. M6 implementation and separation of claims

New local modules:

- `src/lib/kanji/mindtreeEditorialEvidence.ts` — strict review-event shape, canonical JSON, exact revision SHA-256, evidence SHA-256, and verifier.
- `src/lib/kanji/mindtreeEditorialPilot.ts` — fixed, justified pilot sample using existing records only.
- `src/lib/kanji/mindtreeReleaseReadiness.ts` — deterministic, reason-bearing fail-closed readiness assessment.

Updated local modules and UI:

- `src/lib/kanji/mindtreeMnemonicExport.ts` — v2 deterministic package builder/verifier, exact revision-evidence binding, stricter shape/state/digest validation, and refusal of release-candidate output.
- `src/lib/kanji/mindtreeMnemonicContent.ts` — learner resolver now returns no MindTree mnemonic without a distinct trusted release gate; legacy `published` status alone is surfaced as `release-authorization-missing`, not learner-visible publication.
- `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx` — local review capture/history, exact revision digest display, stale-event warnings, bounded readiness matrix, and build-then-verify package download; no approve/release controls.
- `src/components/kanji/KanjiMindTreeExplorer.tsx` and `KanjiMindTreeLearningJourney.tsx` — clear learner-facing distinction when a legacy status lacks release authorization.

Review evidence uses schema `nihongobridge-mindtree-editorial-review@1`. It binds the record ID, version, and digest of revision-defining fields (including origin and provenance) to one of three outcomes: `accepted`, `changes_requested`, or `rejected`. It explicitly encodes `identityTrust: "unverified_local_attribution"`, `reviewedAt: null`, and `timestampTrust: "unavailable"`. The browser/local attribution string is not identity or role verification; browser clock time is not represented as a trusted event time. Evidence digests detect accidental/tampered changes only; they are not signatures, tamper-proof storage, authorship, or authority.

Outcome, origin, approval, release authorization, and learner visibility remain separate:

- A local review outcome does not change origin or CMS status.
- `accepted` produces `reviewed_not_approved`, never approval.
- Approval evidence is explicitly `not_supported` by this M6 model.
- Release authorization is always `not_granted`.
- The evaluator's `eligible_for_separate_release_review` status is intentionally unreachable.
- No learner visibility can be inferred from a digest, export, status string, or locally entered reviewer attribution.

All review state, notes, checklist state, and unsaved edits in the studio are in-memory/browser-session only. Closing or reloading the page discards them. A user can explicitly download a package; no API, database, server filesystem, `localStorage`, IndexedDB, network service, SRS route, or learner progress write is used.

## 4. Bounded pilot selection and observed state

The pilot covers only existing cases chosen from the inspected M1–M5 data, plus one supported missing-record case. It does not create a new story or competing historical revision.

| Character / record ID | Pilot case | Selection basis and observed limitation |
|---|---|---|
| `明` / `first-party-660e` | First-party draft | Existing first-party seed; its generic shared source pointer is not individual author/revision evidence. |
| `休` / `first-party-4f11` | Provenance gap | Existing first-party draft whose sole source reference repeats its generic provenance reference; individual attribution/version detail is absent. |
| `一` / `m4-ai-4e00` | AI candidate | Existing AI-origin candidate. Its source references describe context considered, not authorship or factual support for the generated story. |
| `男` / `m4-ai-otoko` | AI-revised carry-forward | M4 identifies it as M2 AI-revised wording. The saved model has no complete original-human revision chain; its AI origin remains unchanged. |
| `人` / no record | Missing coverage | Supported by the fixed 100-character source slice, but has no mnemonic. No review subject/story is fabricated. |

The evaluator was run locally against those current records with **no review evidence**. The resulting readiness states and current content digests are:

| Character / ID | Readiness before any human input | Principal reason codes | Current revision digest (SHA-256) |
|---|---|---|---|
| `明` / `first-party-660e` | `blocked` | `GENERIC_FIRST_PARTY_PROVENANCE`, `QUALITY_FINDING`, `APPROVAL_EVIDENCE_ABSENT`, `RELEASE_AUTHORIZATION_ABSENT`, `AUTOMATED_CHECKS_DO_NOT_ESTABLISH_LANGUAGE_CORRECTNESS` | `52e5af8146451c7950ca2d310aee33f9e582b02045c99b27108621187e9b68e2` |
| `休` / `first-party-4f11` | `blocked` | `GENERIC_FIRST_PARTY_PROVENANCE`, `QUALITY_FINDING`, `APPROVAL_EVIDENCE_ABSENT`, `RELEASE_AUTHORIZATION_ABSENT`, `AUTOMATED_CHECKS_DO_NOT_ESTABLISH_LANGUAGE_CORRECTNESS` | `99f914403ccc9b6d06075118d1325f7ebf62d5397252846de886c6b0e32b7e72` |
| `一` / `m4-ai-4e00` | `awaiting_human_review` | `AI_ORIGIN_CANNOT_BE_RELABELED`, `SOURCE_REFERENCES_ARE_CONTEXT_ONLY`, `HUMAN_REVIEW_ABSENT`, `QUALITY_FINDING`, `APPROVAL_EVIDENCE_ABSENT`, `RELEASE_AUTHORIZATION_ABSENT` | `ee81b87293bb65e0f1f478c160a5af7cceccce138933c97fc01076fe6fb061a8` |
| `男` / `m4-ai-otoko` | `awaiting_human_review` | `AI_ORIGIN_CANNOT_BE_RELABELED`, `AI_REVISION_HISTORY_INCOMPLETE`, `SOURCE_REFERENCES_ARE_CONTEXT_ONLY`, `HUMAN_REVIEW_ABSENT`, `QUALITY_FINDING`, `APPROVAL_EVIDENCE_ABSENT`, `RELEASE_AUTHORIZATION_ABSENT` | `ac2252976e25b84a740f45aae9693db5b16f70f2fc7560e9cff8c8b7a71d5df5` |
| `人` / none | `blocked` | `MISSING_MNEMONIC_RECORD`, `RELEASE_AUTHORIZATION_ABSENT`, `AUTOMATED_CHECKS_DO_NOT_ESTABLISH_LANGUAGE_CORRECTNESS` | none |

`QUALITY_FINDING` is a deterministic prompt, not an automated linguistic verdict. Exact per-record findings and blocker/warning details remain available in the studio/evaluator. These baseline readiness results do not assert that any reviewer was assigned or that any content was reviewed.

## 5. Readiness behavior and evidence integrity

The evaluator validates record/schema/quality inputs; checks generic first-party provenance and AI-origin limits; verifies each supplied local review event; requires the record ID to match; compares evidence against the current exact revision digest/version; and returns stable reason codes and detail. It detects malformed/modified evidence, stale review statements, duplicate identical events, conflicting outcomes on one exact revision, missing coverage, AI-origin/carry-forward limits, and legacy CMS statuses that cannot stand in for approval. With a local event present, reviewer identity and timestamp limitations are explicitly reported. `accepted`, `changes_requested`, and `rejected` produce distinct outcomes, but none supplies approval or release authority.

Synthetic tests exercise the above states and use labels such as `synthetic operator` only inside fixtures. They are not evidence that a human participated. The studio has an explicit manual “Record local review decision” operation for an actual future user to invoke after they themselves review a selected revision; no such operation was performed for this report.

## 6. Export format and import/apply boundaries

M6 upgrades the offline package to schema `nihongobridge-kanji-mnemonic-export@2` / format version `2`. The package separates status, learner visibility, approval, and release authorization effects; includes pinned source digests; orders data deterministically; carries review evidence only for packaged records; binds evidence to a packaged revision or included revision history; and includes schema and readiness rows. The verifier checks the canonical package digest, exact v2 schema/version, source pins, allowed fields, record/history shape, evidence digest/revision binding, duplicates/conflicting decisions, recomputed schema results, readiness result shape/binding, and authorization state. It rejects a re-signed readiness claim of eligibility and contradictory release state. The digest is an integrity/reproducibility check, not an authenticated signature.

| Action | M6 behavior | What it does not do |
|---|---|---|
| `draft_working` | Builds and verifies a deterministic snapshot of current local records and validation/readiness information. | Does not alter records/status or publish. |
| `proposed_human_review` | Packages exactly one selected record with optional explicitly unverified local annotation and exact-revision evidence. | Does not submit, assign a reviewer, authenticate identity, or approve. |
| `approved_release_candidate` | Disabled in the studio; builder throws; verifier rejects this category. | No approval, release authorization, or publication can be generated locally. |
| Import/apply | None exists in the inspected routes/modules. | M6 does not add an importer, general-purpose import, merge, database write, or publish path. |

V1 exports are unsupported by the M6 verifier because they lack the new evidence/state semantics. No external network or persistence dependency was introduced.

## 7. Learner containment and existing first-party policy

The MindTree learner resolver in `src/lib/kanji/mindtreeMnemonicContent.ts` now fails closed: it returns no mnemonic story from the static record set because that model has no separate authenticated approval/release evidence. This applies even if a future/static row were to contain a legacy `published` status; the catalog reports `release-authorization-missing` and the learner explanation says the text remains hidden. The M1–M5 corpus currently has no such published row, so this does not hide a currently published MindTree record. The existing `/kanji` product routes and their separate content are not changed by this resolver change.

Focused tests confirm that the MindTree entries for `明`, `一`, and `男` have `mnemonic: null`; `人` remains supported with `missing` coverage; and unsupported `龍` remains unsupported. A synthetic legacy-published-shaped object is classified as `release-authorization-missing`, and `getPublishedMnemonic("明")` remains null. No review evidence, candidate story, draft text, review notes, or local identity field is supplied to the learner route by the resolver. Dictionary facts and KanjiVG structural annotations remain distinct from mnemonic text; no etymology or semantic decomposition is inferred.

No full browser/HTML route test was run in M6. M5's route/HTML results are explicitly not re-certified here. Browser accessibility, actual downloaded-file handling, visual review, and assistive-technology behavior still need a manual pass.

## 8. Japanese content, origin, and licensing limits

The selected pilot records were inspected for identity, origin, status, and available provenance only. No automated result here establishes Japanese naturalness, correctness, etymology, cultural suitability, pedagogy, or factual support. The first-party rows have a shared generic pointer; the AI rows' context references do not establish story authorship or support; the carry-forward lacks a full saved revision chain; the missing case has no content to review. No proprietary mnemonics, dictionary rows, or third-party story text were added.

The existing `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md` and `src/data/kanji-mindtree/NOTICE.md` remain the source of attribution and licensing context. No M6 external research or source refresh was performed. The register documents KanjiVG `r20240807` / `a4b51d966d832544c371d566f9c84174e4beff3b` under CC BY-SA 3.0 and the KANJIDIC2 2023-08 identity with the current EDRDG CC BY-SA 4.0 notice, attribution/share-alike and update responsibilities. This engineering report does not make a legal-clearance claim.

## 9. Verification actually run

| Command/check | Result |
|---|---|
| `npm run typecheck` | **PASS** — `tsc --noEmit`. |
| `npx vitest run --config vitest.mindtree.config.ts` | **PASS** — 4 test files, 26 tests (M4, M5, M6, product interaction/state tests). The isolated config has `setupFiles: []`; PostgreSQL-backed repository setup is not loaded. |
| `node --import tsx tests/kanji-mindtree-contract.test.mjs` | **PASS** — 21 Node tests for the synthetic M1 structural evidence contract. Kept outside Vitest because it uses `node:test`. |
| Targeted `npx eslint` on the changed studio, learner, evidence/readiness/export/content, and M5/M6/product test files | **PASS** — no lint output. |
| `node --import tsx scripts/report-kanji-mindtree-source-refresh.ts` | **PASS_LOCAL_ARTIFACTS** — offline only, no refresh/network; both 100-row artifacts hash-match pins and validators pass. |
| `sha256sum` for KanjiVG slice, KANJIDIC2 facts slice, M4 candidate overlay | **PASS** — values below match the existing pins/M5 report. |
| `git diff --check` | **PASS** — no whitespace errors. |
| Repository-wide `npm test` | **NOT RUN** — the repository setup imports dotenv/PostgreSQL; the isolated M1–M6 checks were used instead. |
| Full production build / database-backed routes / migrations | **NOT RUN** — outside scope and/or unsafe without explicitly approved preconditions. |
| Live browser manual review, human Japanese review, accessibility review | **NOT RUN** — no real reviewer action or browser-driven walkthrough is claimed. |

Vitest printed a non-blocking Vite `configLoader: 'native'` compatibility warning for the `.ts` config's ESM syntax; all focused tests passed. An initial focused run exposed a mis-imported test helper, an obsolete expectation for an export metadata field, a stale stage expectation, and the `node:test`/Vitest runner mismatch. The fixture/import/expectations were corrected, the Node contract suite was run with its own runner, and the final commands above passed.

## 10. Source hashes and code deltas

Verified unchanged source/candidate artifact hashes:

- `src/data/kanji-mindtree/kanjivg-structure-slice.json` — **100 records**, SHA-256 `03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862`.
- `src/data/kanji-mindtree/kanjidic2-facts-slice.json` — **100 records**, SHA-256 `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6`.
- `src/data/kanji-mindtree/mnemonic-candidates.ts` — SHA-256 `cf0709dba391da771bb524b4a7ea4e4d5fc51a423b348177473546293dfec95b`.

M6 additions/edits, against the existing M1–M5 workspace:

- Added `src/lib/kanji/mindtreeEditorialEvidence.ts`, `src/lib/kanji/mindtreeEditorialPilot.ts`, `src/lib/kanji/mindtreeReleaseReadiness.ts`, `tests/kanji-mindtree-m6.test.ts`, and this report.
- Updated `src/lib/kanji/mindtreeMnemonicExport.ts`, `src/lib/kanji/mindtreeMnemonicContent.ts`, `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx`, `src/components/kanji/KanjiMindTreeExplorer.tsx`, `src/components/kanji/KanjiMindTreeLearningJourney.tsx`, and `vitest.mindtree.config.ts`.
- Updated `tests/kanji-mindtree-m5.test.ts` for v2 export semantics; updated `tests/kanji-mindtree-product.test.ts` for its Observe-to-Explore stage expectation.
- No source-slice, candidate-overlay, lockfile, package manifest, database schema, or migration delta was made.

## 11. Manual walkthrough and remaining human actions

A future local walkthrough may use `/mindtree/studio` and inspect the five cases in §4. Before recording any decision, the user/reviewer must read and personally assess the exact selected content revision; the “Record local review decision” control creates only an unauthenticated local statement. Check that its digest/version matches the reviewed text, inspect stale-event display after an edit, and inspect proposed-review/draft downloads in a browser. Do not attempt an approval or publication action; none is provided.

Still required before any pilot can be called genuinely human-reviewed or any release review can begin:

1. A qualified human Japanese reviewer must independently inspect each actual candidate revision for naturalness, factual/etymological claims and sourcing, learner suitability, clarity, and cultural considerations; document unresolved issues without relying on the automated heuristic as a verdict.
2. A provenance owner must establish the authorship/revision chain for first-party material and the carry-forward, verify story-specific sources/rights, and resolve attribution and licensing questions. Public availability is not reuse permission.
3. A separately authorized engineering/product process must design authenticated reviewer identity/role, trustworthy timestamps, durable append-only evidence, approval semantics, exact-digest invalidation, release authorization, and an independent publication/rollback gate. M6 does not implement those controls.
4. Perform actual browser keyboard/focus and assistive-technology review, visual review, route/HTML learner-containment checks, and exported-package handling with an authorized human; record results separately. This report contains no such human sign-off.

## 12. Final preservation/status audit and explicit non-authorization

Final checks were run on the active session branch. `git status --short --untracked-files=all` reports **4 tracked modified paths** (the four pre-existing paths in §1), **43 untracked paths**, **0 staged paths**, and **0 deletions**. The inherited M1–M5 untracked paths present at final audit are:

- `docs/architecture/KANJI-MINDTREE-M1-A-CONTRACT.md`
- `docs/architecture/KANJI-MINDTREE-PRODUCT-ARCHITECTURE.md`
- `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md`
- `reports/kanji-mindtree/M1-C-SOURCE-PROVENANCE-AND-ARTIFACT-VERIFICATION-PLAN.md`
- `reports/kanji-mindtree/M2-VERTICAL-SLICE-IMPLEMENTATION-AND-VERIFICATION.md`
- `reports/kanji-mindtree/M3-MEANING-TO-REMEMBER-IMPLEMENTATION.md`
- `reports/kanji-mindtree/M4-MNEMONIC-CONTENT-AND-LEARNING-EXPERIENCE.md`
- `reports/kanji-mindtree/M5-EDITORIAL-REVIEW-AND-LEARNING-QUALITY.md`
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
- `src/lib/kanji/mindtreeMnemonicExport.ts`
- `src/lib/kanji/mindtreeMnemonicQuality.ts`
- `src/lib/kanji/mindtreeMnemonicRevisions.ts`
- `src/lib/kanji/structuralEvidenceGraph.ts`
- `tests/kanji-mindtree-contract.test.mjs`
- `tests/kanji-mindtree-m4.test.ts`
- `tests/kanji-mindtree-m5.test.ts`
- `tests/kanji-mindtree-product.test.ts`
- `vitest.mindtree.config.ts`

The five M6-only untracked additions are `reports/kanji-mindtree/M6-CONTROLLED-HUMAN-REVIEW-PILOT-AND-RELEASE-READINESS.md`, `src/lib/kanji/mindtreeEditorialEvidence.ts`, `src/lib/kanji/mindtreeEditorialPilot.ts`, `src/lib/kanji/mindtreeReleaseReadiness.ts`, and `tests/kanji-mindtree-m6.test.ts`. M6 also edited inherited untracked paths `src/components/kanji/KanjiMindTreeExplorer.tsx`, `src/components/kanji/KanjiMindTreeLearningJourney.tsx`, `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx`, `src/lib/kanji/mindtreeMnemonicContent.ts`, `src/lib/kanji/mindtreeMnemonicExport.ts`, `tests/kanji-mindtree-m5.test.ts`, `tests/kanji-mindtree-product.test.ts`, and `vitest.mindtree.config.ts` as detailed in §10. No inherited M1–M5 source or report was removed or overwritten. `git diff --check` passes. Branch and HEAD remain `arena/40788dd5-nihingobridgeupgrade` / `cf7a4c673236af2f507af8529dae0946fbed3bdf`. Artifact hashes match §10.

No Git identity was used for a commit. No file was staged, committed, pushed, merged, or opened as a PR. No branch was switched. No database credentials, production database/Supabase, migration, deployment, publication, or release operation was accessed or run. The user-mandated M1–M5 preservation work and the four pre-existing tracked edits have not been overwritten.

**Final gate: NOT AUTHORIZED.** M6 supplies local evidence structure and a readiness evaluator only. It does not assert any human review, authenticated identity, approval, legal clearance, release authorization, or learner publication. All selected records remain at their existing draft/candidate/missing state.
