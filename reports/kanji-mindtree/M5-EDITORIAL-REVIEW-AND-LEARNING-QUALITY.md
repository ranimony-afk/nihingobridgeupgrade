# Kanji MindTree M5 — Editorial Review Readiness, Mnemonic Quality, Learning Experience & Release Boundaries

**Outcome:** **Implementation complete for the bounded M5 scope; focused verification passed.** This is a development-only, offline editorial studio and package-builder—not an authenticated CMS, reviewer identity service, release authorization, or publication path. No human approval or release event is asserted.  
**Date:** 2026-10-29  
**Scope:** Preserve the M1–M4 source-backed 100-character slice and its existing licensing/provenance boundaries. No database, migration, production CMS, authentication, learner progress, or SRS work was added.

## 1. M5 result

M5 completes a cohesive local review surface over the fixed 100-character source-backed slice:

- A one-glyph source preview is fetched from a read-only development endpoint. The studio shows the pinned source/file/hash and literal KanjiVG labels; it does not call that markup a semantic decomposition.
- Record origin is presented in separate first-party seed, AI-candidate, and independent-editorial layers. AI candidates retain their `ai_candidate` origin and draft status; starting an editorial rewrite creates a blank record without copying candidate text or component cues.
- Deterministic quality findings and completeness measures are presented as review prompts. A local checklist and notes are explicitly unverified, unauthenticated, and non-persistent.
- The studio shows a field-level diff against the last locally saved content revision, keeps a browser-local version sequence, and supports save/cancel. Those counters are editable client state, not trustworthy audit evidence. Unsaved local-note differences are shown separately.
- Three distinct, digest-bearing downloads represent a working snapshot, a proposed human-review package, and a strictly filtered approved-release-candidate package. Export never changes editorial or publication state.
- Learner study is expanded to **Observe → Break down → Associate → Remember → Recall → Explore**. Recall is self-rated in-page only; Explore links to distinct vocabulary, recorded-reading, and visual-annotation neighborhoods with provenance explanations.
- Existing source hashes, licenses, attribution, and safe refresh tooling are preserved; no full upstream archive or unrelated project data was added.

## 2. Fixed-slice and editorial boundary

The denominator remains exactly **100** supported characters, with the M4 baseline unchanged:

| Measure | M5 starting/current data |
|---|---:|
| KanjiVG visual records | 100 / 100 |
| KANJIDIC2 fact records | 100 / 100 |
| First-party mnemonic records | 31 |
| AI-assisted candidate records | 44 |
| Total mnemonic records | 75 / 100 |
| Supported characters with no mnemonic record | 25 / 100 |
| Draft / in review / approved / scheduled / published / archived | 75 / 0 / 0 / 0 / 0 / 0 |
| Authenticated reviewers or actual approvals recorded by M5 | 0 |

The existing 31 first-party strings are still drafts, not automatically cleared for learners. Candidate overlay entries remain visibly AI-origin and unpublished. A new editorial record starts blank and independent; changing a UI label cannot rewrite record origin. Missing coverage remains a first-class case rather than prompting story generation. Learner resolution continues to return no mnemonic text for draft, review, approved-but-unpublished, or AI-candidate records.

## 3. Source preview and evidence separation

`src/app/mindtree/studio/preview/[character]/route.ts` is a no-store, read-only endpoint. It returns a preview only in development and only for one supported character; production mode and unknown/unsupported characters return 404. The preview carries exact pinned source reference/version, license, filename, source hash, stroke paths, and annotation occurrences. The component highlighter groups paths by source occurrence only; it does not infer meaning from a visual grouping.

The studio separately displays:

1. **First-party/editorial text:** content provenance and lifecycle state;
2. **AI candidate text:** explicit AI-candidate origin and draft/unpublished boundary;
3. **Canonical source facts:** KANJIDIC2 meanings/readings/grade/stroke count;
4. **Structural evidence:** literal KanjiVG paths and nested labels;
5. **Editorial interpretation:** mnemonic and reading hook, expressly not etymology.

The research register remains the source of truth for upstream study, attributions, immutable identities, and unresolved legal/operational follow-up. The current EDRDG notice says KANJIDIC2 and derivatives are CC BY-SA 4.0 and calls for regular updates; the historical ETL metadata was not rewritten. This engineering report is not a legal-clearance opinion.

## 4. Mnemonic quality matrix and human-review findings

`src/lib/kanji/mindtreeMnemonicQuality.ts` supplies a deterministic assessment over independent dimensions rather than a single “quality score.” The assessment is neither an automated verdict nor a promotion gate by itself.

| Dimension | Current evidence / deterministic checks | What remains a human decision |
|---|---|---|
| Coverage and source context | Record presence, supported-character context, pinned visual source, dictionary meaning, readings, first-party vocabulary examples | Whether the source/context is sufficient for the intended editorial purpose |
| Structure and traceability | Schema/content checks, origin/provenance reference, source-reference presence, record version and status fields | Whether a cited source actually supports any factual claim attributed to it |
| Component cue alignment | Exact cue-label comparison against nested KanjiVG annotation labels | Whether a visual cue is useful; KanjiVG labels do not establish semantic parts or history |
| Reading hook | Normalized overlap check against the supplied KANJIDIC2 On/Kun readings | Pronunciation, naturalness, usefulness, and whether the hook teaches rather than misleads |
| Learner-cue usability | Story presence/length, keyword string presence, and an explicit clarity-review prompt | Comprehensibility, cultural suitability, memory usefulness, and target learner fit |
| Factual/etymology risk | Conservative phrase heuristic for wording resembling historical or etymological assertions; explicit factual-review prompt | Whether a statement is factual, accurate, sufficiently sourced, or should be removed |
| Editorial evidence | Candidate origin, status, reviewer/date field presence and parseability | Identity and authority cannot be authenticated in this local studio; actual approval requires a separate trusted process |
| Learner/release eligibility | Published state is counted separately; draft content remains hidden; package builder filters and validates | A real editorial decision and any release authorization remain outside M5 |

Examples of output include `CANDIDATE_NOT_REVIEWED`, `REVIEW_EVIDENCE_MISSING`, `UNSUPPORTED_COMPONENT_CUE`, `READING_NOT_IN_SOURCE`, `POSSIBLE_ETYMOLOGY_CLAIM`, `MNEMONIC_TOO_LONG`, `MISSING_VOCABULARY`, `HUMAN_CLARITY_REVIEW_REQUIRED`, and `HUMAN_FACT_REVIEW_REQUIRED`. Findings are deterministic for the same inputs. Heuristic warnings can be false positives or false negatives; they are not fact checking and do not claim a reviewer has performed the action.

The workspace completeness matrix also keeps seven counts separate: visual-source coverage, dictionary-fact coverage, first-party study-example coverage, mnemonic-record coverage, review-pending coverage, published coverage, and missing-record coverage. Per-record quality assessment reports mnemonic/meaning/visual availability, reading-hook and component recall eligibility, vocabulary count, origin/status, and review-evidence presence.

## 5. Local editing, notes, revision comparison, and cancellation

The M5 studio now exposes the following for a selected record:

- editable keyword, story, reading hook, literal component-cue references, and source/context references;
- one displayed diff per changed field against the last locally saved content revision;
- separate previous/working local-note comparison;
- a browser-session version counter and saved revision list, with no invented author or timestamp;
- explicit **Save local revision** and **Cancel unsaved edits** controls.

These are not durable storage or immutable audit logs. Reloading the route discards edits. A note/checklist is not reviewer evidence and cannot satisfy an identity or approval requirement. The UI does not modify the record's origin when content is edited. A fresh editorial rewrite from an AI candidate has no inherited story or components.

## 6. Versioned package and release-boundary design

`src/lib/kanji/mindtreeMnemonicExport.ts` builds schema `nihongobridge-kanji-mnemonic-export@1` packages with deterministic record and validation ordering, pinned source artifact digests, quality findings, schema-validation results, optional local revision history, explicit status/publication effects of `none`, and SHA-256. The digest covers canonical, pretty-printed unsigned package JSON without a trailing newline; the serialized result adds the digest field and one final newline. This is a reproducibility/integrity check, not a signature, provenance proof, identity assertion, or authorization token.

| Package action | Included content and guard | Meaning (not implied) |
|---|---|---|
| `draft_working` | Current record set; blocked when the working set fails schema validation | Local working snapshot only |
| `proposed_human_review` | Exactly the selected record plus local checklist/note; identity is explicitly unverified and reviewer/date fields are null | A proposal for a person to review; not a review submission to a service, reviewer assignment, or approval |
| `approved_release_candidate` | Non-AI `approved` records only; builder requires explicit reviewer/date evidence and rejects an empty eligible set | A local candidate bundle for a future independent release process; not release authorization, deployment, or publication |

All 75 current records are drafts and there are no current release-candidate-eligible records. No M5 action altered those baseline statuses. In particular, the title “approved release candidate” names a package category only; the artifact cannot approve records, identify an authorized reviewer, or send anything to learners.

No API, CMS service/store, filesystem/server write, database, localStorage, IndexedDB, SRS route, learner account, or progress persistence is used. Browser download is the only package output.

## 7. Learning experience and learner privacy

The ephemeral journey now has six keyboard-operable steps. Observe separates displayed meaning from source; Break down presents literal source annotations without assigning them semantics; Associate progressively reveals only a published mnemonic; Remember supports covering/revealing that published cue; Recall offers meaning or component self-check and a temporary self-rating; Explore follows source-backed vocabulary, reading relations, and visual-neighbor links. Shared reading/shape relations are explicitly not etymology claims.

When a record is draft, candidate, in review, approved-but-unpublished, archived, missing, or unsupported, the learner view does not serialize or display its story. Unsupported multi-character input is not decomposed or assigned invented meanings. Recall answers and self-ratings remain in the component's transient reducer state and never create SRS cards or learner progress.

## 8. Demonstration and verification

### Automated scenarios

Added `tests/kanji-mindtree-m5.test.ts` and `vitest.mindtree.config.ts`. The isolated config intentionally has `setupFiles: []` because the repository-wide Vitest setup imports dotenv and connects to PostgreSQL. The focused tests cover:

- first-party draft, AI-candidate draft, and missing mnemonic findings, including explicit human-review prompts;
- schema-versioned/digest-bearing export equality when input records and findings are reversed;
- candidate preservation in working packages and an explicitly unverified proposed-review annotation with null reviewer/date;
- rejection of candidate-only approved-release-candidate export;
- field revision comparison, version increment, cancellation, and removal of an unsaved new record;
- learner hiding for a draft candidate, missing supported coverage, unsupported `龍`, story segmentation, Recall, and transition to Explore.

Commands and results:

| Check | Result |
|---|---|
| `npx vitest run --config vitest.mindtree.config.ts` | **PASS** — 2 files, 9 tests (M4 + M5); database setup not loaded |
| `npm run typecheck` | **PASS** — `tsc --noEmit` |
| Targeted ESLint on the changed M5 implementation/test files | **PASS** |
| `git diff --check` | **PASS** |
| `node --import tsx scripts/report-kanji-mindtree-source-refresh.ts` | **PASS_LOCAL_ARTIFACTS** — both 100-row artifacts hash-match their pins and validate; no network or refresh performed |
| Local `GET /mindtree/studio` | **HTTP 200**, 235,788 bytes |
| Local `GET /mindtree/studio/preview/明` | **HTTP 200**, one-character source preview JSON, 2,029 bytes |
| Studio preview for unsupported `龍` and multi-character `明人` | **HTTP 404** in development |
| Local learner routes `/mindtree/明`, `/mindtree/一`, `/mindtree/人`, `/mindtree/龍` | **HTTP 200** for the two supported records, supported-but-missing record, and graceful unsupported-character page |
| Learner HTML inspection for AI candidate `一` | Candidate story text `Picture one clean stroke: one mark for one.` was **absent** from server-rendered HTML |

A browser automation package/browser executable was not available in the inspected workspace, so actual mouse/keyboard interaction, downloaded-file handling in a user browser, accessibility testing with assistive technology, and visual regression were not executed. The save/cancel/revision/recall/export behaviors are exercised at module/state level by the isolated tests; the UI controls are available on `/mindtree/studio` for manual walkthrough. The development-only guard was inspected in source; no production server was started to exercise that negative path.

The repository-wide `npm test` was **not run** because its configured setup connects to PostgreSQL and some tests seed data; this would violate the instructed safety boundary. A full production build was not run because app routes may trigger database-backed prerendering. No database-backed, destructive, or migration command was run.

### Manual walkthrough (local development server)

1. Open `/mindtree/studio`; select `明` for a first-party seed draft, or `一` for an explicitly marked AI-candidate draft. Inspect the distinct content-layer labels and deterministic findings.
2. Edit a story or keyword. Inspect the previous/working field diff. Choose **Cancel unsaved edits** and confirm the last saved value returns; edit again and choose **Save local revision** to see the local sequence advance.
3. Type a local note, inspect its separate before/working diff, and save or cancel it. The screen labels the note as unauthenticated and local.
4. Select a supported character without a record (for example, `人`) to see the missing-record assessment and blank-draft option. Do not enter an inferred story. `龍` remains outside the supported 100-character slice.
5. Try each of the three package buttons. The working package is deterministic; proposed review is explicitly unverified; the approved-release-candidate button is unavailable with the current zero eligible records. No approval or publication should be recorded during this walkthrough.
6. Open `/mindtree/明`, `/mindtree/一`, and `/mindtree/人`; the draft mnemonic text is hidden while sourced meanings/readings and missing coverage remain distinct. Open a supported published entry only if one exists after an independently authorized future release. Use **Recall** and continue to **Explore**; self-rating remains temporary.

## 9. Source integrity and preservation

M5 did not regenerate or alter either source-derived slice. Expected SHA-256 values remain:

- KanjiVG 100-glyph slice: `03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862`
- KANJIDIC2 facts slice: `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6`
- M4 AI-candidate overlay: `cf0709dba391da771bb524b4a7ea4e4d5fc51a423b348177473546293dfec95b`

The KanjiVG upstream remains pinned to `r20240807` / `a4b51d966d832544c371d566f9c84174e4beff3b`, CC BY-SA 3.0; the KANJIDIC2 data identity remains the 2023-08 release from immutable archive snapshot `9cb709b87f43c7bceb494eefbe7f8b8f42744502`, under the current EDRDG CC BY-SA 4.0 notice. Notices and the research register preserve attribution, share-alike obligations, revision identities, and manual refresh guidance. These engineering controls do not establish legal clearance.

M1–M4 tracked/untracked changes and the four pre-existing tracked M2 edits remain preserved. Final audit confirmed the active branch is still `arena/40788dd5-nihingobridgeupgrade` at the original HEAD, exactly those four pre-existing tracked paths remain modified, all M1–M5 additions are still untracked, and there are no staged changes or deletions. `package.json` and lockfile have no diff. The three pinned source/candidate digests were recomputed and match the recorded values. No database schema, auth, global CMS, Phase 26F, or SRS activation/persistence changes were made. No file was staged, committed, pushed, or opened as a PR.

## 10. Future release workflow (not activated by M5)

A practical later workflow should be independently designed and authorized before any production use:

1. A trusted, authenticated identity and role gate assigns a real reviewer; immutable server-side review events record the actual actor, timestamp, record version, and evidence references.
2. Reviewers assess the quality matrix, source claims, licensing/attribution, learner fit, accessibility, and candidate-origin policy; unresolved findings remain visible. AI candidates must be independently authored into a new editorial record and must never be promoted by changing origin labels.
3. A controlled approval transition binds explicit review evidence to a precise content digest and policy version. Changes after approval invalidate that approval and require re-review.
4. A reproducible build creates a signed/attested release manifest, with source pins, schema versions, license notices, content digest, tests, and approval-event references. Independent release authority verifies it before deployment.
5. A separate publish action updates learner visibility. Monitoring, rollback, source refresh, and corrections have named owners and auditable procedures.

M5 implements only local package structure and fail-closed eligibility checks. It does not supply identity, authoritative event storage, cryptographic signatures, reviewer permissions, legal clearance, build attestations, deployment, publication, or rollback.
