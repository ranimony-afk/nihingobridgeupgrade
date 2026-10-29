# NIHONGOBRIDGE — Kanji MindTree M8: Full Feature and Vercel Readiness

- **Executive verdict: PASS WITH CONDITIONS for the implementation, locked dependency remediation, production build, and local production-runtime checks.** This is **not** a Vercel deployment, human user-acceptance sign-off, Japanese editorial approval, or release authorization.
- **Release/deployment gate:** no MindTree mnemonic is eligible for learner display under the current trusted resolver; the editor is intentionally development-only. No Vercel project is linked in this workspace, no database runtime URL is configured, and this session is not authorized to push or deploy. Owner action is required before preview/production acceptance.
- **Date:** 2026-10-29
- **Repository:** `/home/user/nihingobridgeupgrade` (`ranimony-afk/nihingobridgeupgrade`)
- **Initial/final branch and HEAD:** `arena/40788dd5-nihingobridgeupgrade` / `cf7a4c673236af2f507af8529dae0946fbed3bdf`

A passing local production build establishes build compatibility for this checkout. It does not establish Vercel deployment, real browser interaction, screen-reader accessibility, owner acceptance, or authorization to expose unreleased editorial content.

## 1. Repository preflight and preservation baseline

Preflight happened before M8 edits. It independently verified:

- Root `/home/user/nihingobridgeupgrade`; current branch `arena/40788dd5-nihingobridgeupgrade` (reported active by Arena); HEAD `cf7a4c673236af2f507af8529dae0946fbed3bdf`.
- `origin` fetch/push is `https://github.com/ranimony-afk/nihingobridgeupgrade.git`; no other remote was listed. **No upstream is configured** for this branch.
- Shallow clone: `true`.
- Initial status: **4 tracked modified paths**, **45 untracked paths**, **0 staged**, **0 deletions**. The four tracked modifications and 45 untracked M1–M7 files matched the prior M7 preservation audit.
- Initial tracked changes: `src/app/kanji/[character]/page.tsx`, `src/app/kanji/page.tsx`, `src/components/layout/Navbar.tsx`, and `src/data/kanji.ts`. These predate M8. The existing MindTree link in `Navbar.tsx` is inherited; M8’s responsive/accessibility additions in that same path are identified in §13.
- The complete 45-path inherited untracked inventory is recorded again in §13, with M8 edits/additions marked.
- The M7 report and M6/M5/M4/M3/M2/M1-C reports and current route/data/UI/test code were read. The report claims were rechecked against code and local runtime rather than treated as deployment evidence.
- Pinned input hashes at preflight: KanjiVG slice `03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862`, KANJIDIC2 fact slice `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6`, and candidate overlay `cf0709dba391da771bb524b4a7ea4e4d5fc51a423b348177473546293dfec95b`.
- Before dependency changes, `package.json` and `package-lock.json` had SHA-256 `ab08f6cb018a6d5a8139d120dd31369b8579ef4da1ff542f108dd33c8e7a9169` and `bb581342609a2814cd0f252f94bc80549458900cc942321ac5443609e0ab1ff5`; neither had an initial Git diff.
- No `.env`, `.env.local`, `.vercel/project.json`, `vercel` CLI, or browser executable was found. Environment inspection reported only whether variables were set; no secret values were read. `DATABASE_URL` and Supabase variables were unset.

### M7 baseline and currently verified editorial state

M7’s claims remain consistent with the current modules/tests: the exact-revision evidence guard is separate from approval/release; the learner resolver remains fail-closed; the studio has no production publication action. Current snapshot contains 75 unique records (31 first-party, 44 AI candidates), all `draft`; no record has reviewer, review-date, approval, or publication evidence, and `人` has no mnemonic record. The five M6 pilot cases remain unchanged. M7’s version-plus-digest matching and v2 export-history conflict rejection remain covered by its focused tests.

A material product limitation remains: `getPublishedMnemonic()` deliberately returns `null` until a separate authenticated release gate exists. Therefore the 31 first-party draft stories and 44 AI-candidate stories are **all hidden** in learner routes. No real review occurred during M8 and no status/content was promoted to make the feature appear complete. This is an intentional editorial boundary, but it means the current learner experience does not yet expose a mnemonic to associate/remember; the stages explain the hidden/missing state instead of inventing a fallback.

## 2. Implementation checklist from actual findings

| Area | Pre-M8 finding | M8 result / remaining condition |
|---|---|---|
| Navigation/discoverability | Global desktop nav had a MindTree entry from earlier work; primary nav was hidden below `md`, leaving no mobile route list. | Added a compact, horizontally scrollable mobile navigation using the shared `navItems` source, with MindTree, existing Kanji, dictionary, Overview, Today, visible focus, and current-page semantics. Desktop navigation retained. |
| Search/filter | Search already matched supported glyph, meaning and recorded readings; only JLPT filters existed even though many dictionary-only rows are identified by school grade. | Extracted deterministic search/filter helper; added a Grade 1 filter, semantic fieldset/legend, clearer no-result text and a reset control. Empty input returns the current filter set; unsupported input returns no result. |
| Catalog/detail/direct route | 100-row catalog and one-character detail route already existed. Client selection/recall state could persist between dynamic character routes. | Keyed the explorer by exact character so per-character state resets on route changes. Direct encoded Japanese paths and unsupported/multi-codepoint state were runtime checked. |
| Glyph/readings/facts | Source-backed SVG paths, nested literal annotations, source hashes, meanings/readings, and source-specific labels were already present. | Preserved; no inferred etymology, semantic component meanings, or fabricated records added. |
| Related exploration | Main graph-panel links kept `from`/`via`; Explore-stage links did not. | Centralized route helper and applied `from`/`via` relation context to component, reading, and Explore-stage links. Tested Unicode path/query round-trip. Graph depth/node/edge limits are unchanged. |
| Learning stages | Observe → Break down → Associate → Remember → Recall → Explore existed. | Preserved all six stages. Added a reversible “Reveal answer / Cover answer” recall control; self-check remains ephemeral. Moving to another character resets route-specific state; link-back context remains visible. |
| Mnemonic origin/visibility | Safe resolver hides drafts and candidates, and in this model hides all stories absent a trusted release gate. | Preserved; no unreviewed story was exposed. **Mnemonic learning content remains unavailable to learners pending real review and a separately authorized trusted publication design.** |
| Missing/unsupported content | Missing record and unsupported character were explicit, non-generative states. | Preserved and checked at runtime for `人`, `龍`, and a multi-character path. |
| Loading/error | Catalog/detail are local synchronous data; no data fetch loading state is required. Studio’s development-only source preview already has loading/error/404 behavior. | Preserved; development preview for a supported glyph returned JSON; unsupported preview returned 404. Production studio and preview both returned 404. |
| Responsive/accessibility | Existing catalog/detail have focus classes, landmarks, controls, and some responsive grids; browser behavior had not been tested. | Added mobile nav and Grade 1 filter semantics. Automated/source and HTTP evidence only; no real browser, keyboard, viewport, or assistive-technology test. |
| Learner safety | M4–M7 resolver/serialization tests cover candidate/draft hiding and export non-publication. | Kept unchanged; final production HTML for `一` did not contain its AI-candidate story. Focused M4–M8 regression suite passed. |
| Build/deploy | Default Next config; no Vercel project linkage. Root runtime needs PostgreSQL. | Production build and local production server pass for MindTree without DB. `/` still fails without `DATABASE_URL`; owner must supply the existing app’s runtime DB configuration before whole-site acceptance. |

## 3. User-facing route and navigation verification

### Local development server

Started the project Next development server on `0.0.0.0:3100` and issued local HTTP requests only. Direct route results:

- `GET /mindtree` — **200**, 180,148-byte server response.
- `GET /mindtree/%E6%98%8E` (`明`) — **200**, 89,601 bytes.
- `GET /mindtree/%E4%B8%80` (`一`) — **200**, 53,708 bytes.
- `GET /mindtree/%E4%BA%BA` (`人`, supported without mnemonic) — **200**, 54,814 bytes.
- `GET /mindtree/%E9%BE%8D` (`龍`, unsupported) — **200**, 34,378 bytes, explicit unsupported message.
- `GET /mindtree/%E4%BC%91?from=%E6%98%8E&via=component%20%E6%97%A5` — **200**, breadcrumb preserved `明`/component context.
- `GET /mindtree/studio` — **200 only in development**; 249,726-byte HTML response.
- `GET /mindtree/studio/preview/%E6%98%8E` — **200**; one-glyph JSON preview, 2,029 bytes.
- `GET /mindtree/studio/preview/%E9%BE%8D` — **404**.
- Server-rendered catalog contains the global “MindTree Lab” link and Grade 1 filter. `明` displays its current sourced meaning; `人` shows “No mnemonic coverage”; the candidate story `Picture one clean stroke: one mark for one.` is absent from `一` learner HTML.

The M8 HTTP smoke script’s first draft used two incorrect case/text assertions and a mismatched temporary filename; those were corrected and the final route assertions above passed. These were test-script assertion mistakes, not application route failures.

### Local optimized production build/runtime

After `npm run build`, started `next start` on `0.0.0.0:3101` with `DATABASE_URL` unset. The same MindTree catalog, supported, missing, unsupported, and context-preserving detail routes returned **200**; candidate story remained absent. `/mindtree/studio` and the studio preview endpoint returned **404** as designed in production. `/mindtree/` returned Next’s standard **308** redirect to `/mindtree`. Percent-encoded Japanese route parameters worked. A two-character route returned the unsupported-state page, not fabricated decomposition.

`GET /` on both local development and optimized production returned **500** because the existing home page queries PostgreSQL (`questions` and `jlpt_tests`) and `DATABASE_URL` is absent. `src/db/index.ts` defers its error until first database use; no database connection was attempted or made. This is not caused by MindTree, which uses static local artifacts and the shared layout’s client Navbar only. The layout itself has no database read.

These requests establish local HTTP behavior only. They do not constitute browser execution, preview-deployment evidence, or production-site evidence.

## 4. Learning flow, graph bounds, and data provenance

The six-stage learning journey is present and keyboard-operable by code structure. Recall meaning/component answer reveal and self-check run in client reducer state, are not persisted, and now allow covering the revealed answer. Learners can select Explore or continue; character links retain `from`/`via`; the detail breadcrumb links back to the source character and the catalog. A route change resets local state by character key. No account state, DB, SRS card, scheduler, or learning history was introduced.

Relationships remain those from the existing deterministic server-side graph with the prior limits (depth 2; max 80 nodes/96 edges; bounded related/component lists). Links keep literal KanjiVG overlap, exact KANJIDIC2 On-reading overlap, and first-party study examples in separately labeled lanes. No arbitrary edges were added; no recursive graph walk was added. The component-tree renderer still has a visited-occurrence guard. M8 changed only link construction/context, not graph content or limits.

The fixed 100-character catalog/search data still comes from the checked-in KanjiVG/KANJIDIC2 slices joined with the existing first-party seed. No new facts, readings, fallback stories, source rows, or coverage records were introduced. Existing first-party vocabulary remains labeled as first-party examples and not a dictionary feed. KanjiVG markup is labeled as visual annotation, not etymology.

## 5. Learner-visibility and editorial boundary results

M4–M7 learner resolver, serialization, malformed-export and lifecycle regressions remain in the focused suite. M8 added no visibility bypass. Local optimized HTML confirms the AI candidate story remains absent. Supported-without-record `人` has no generated story; unsupported `龍` and `明人` receive no inferred decomposition or meaning. Internal review notes/provenance remain outside learner serialization per M7 tests. An export file does not enter the learner resolver. Legacy `published` status cannot override missing trusted release evidence.

**Current status, verified from data:** 75 unique records; 31 first-party + 44 AI candidates; 75 `draft`; 0 `review`, `approved`, `scheduled`, `published`, or `archived`; 0 reviewer/review/publication fields. No actual human decision was recorded. All mnemonic story text is hidden on learner pages today. An approved release cannot be asserted merely because routes/build work.

The editor remains explicitly **development-only and unauthenticated**. Production `/mindtree/studio` is a 404, not an owner production CMS. M8 did not add auth, role validation, persistence, an importer, apply path, approval control, publish action, or release process. This is deliberate privacy and editorial protection; expose no studio on Vercel until a separately reviewed authorization/privacy design exists.

## 6. Accessibility and responsive results

Automated checks confirm the responsive mobile navigation is in the shared header, contains the MindTree destination, exposes selected page state, and has visible focus styles; Grade 1/JLPT controls use a labelled fieldset and pressed states. Search has a native search input/label and a live result count. The detail page retains semantic headings, breadcrumb, native `details/summary`, labelled SVG title, selected occurrence buttons, and visible focus styles. Recall uses buttons, is keyboard reachable by markup, and the answer can now be covered again. The local source-contract/reducer tests do not simulate a browser.

**Not performed:** real keyboard-only traversal, actual tab/focus order, viewport rendering at 320/375/768/desktop widths, screen reader/voice control, contrast measurement, mobile horizontal-scroll testing, browser console/network inspection, and browser download testing. The workspace had no Playwright/Puppeteer/Cypress/browser binary; none was installed. No assistive-technology test is claimed. Complete the owner checklist in §12.

## 7. Dependency security assessment and remediation

### Before M8

Pre-change `npm audit` (current registry snapshot during this task) reported **12 affected package entries: 6 moderate, 5 high, 1 critical**. Relevant installed versions included Next `16.3.6`, eslint-config-next `16.2.6`, PostCSS `8.5.8`, Vitest/`@vitest/mocker` `5.0.0`, Vite `8.3.0`, sharp `0.35.4`, source-map-js `1.2.1`, and zod `4.6.5`.

| Package / before → after | Before advisory IDs and affected ranges | Dependency / deployment reachability |
|---|---|---|
| `next` direct: `16.3.6` → `16.4.3` | GHSA-3w37-wq28-93x7 (`>=16.3.0 <16.3.8`); GHSA-4jqv-mc3x-m676, GHSA-39w2-rjm5-chcv, GHSA-f87g-xv8r-7p7x, GHSA-mcj8-r9mp-w47p, GHSA-cjq9-62q9-8jv4 (`>=16.0.0 <16.3.8`); GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r, GHSA-673q-mjm6-r5xr (`>=16.0.0 <=16.4.0`); GHSA-h694-7cp9-m8p3 (`>=16.3.0 <16.3.8`). npm grouped the `next` package as **critical**. | Direct framework/runtime plus build. App Router routes are reachable. No `use cache` or server actions were found; the existing `next/image` stroke-order call is marked `unoptimized`, and no remote image host patterns are configured, but the Next framework remains in the runtime attack surface. Updated to npm-audit-cleared `16.4.3`. |
| `postcss` direct dev: `8.5.8` → `8.5.32` | GHSA-qx2v-qp2m-jg93 (`<8.5.10`); GHSA-6g55-p6wh-862q (`<=8.5.11`); GHSA-r28c-9q8g-f849 (`<=8.5.17`); GHSA-fxqj-rqcc-2cmp (`<=8.5.22`). | CSS/build tooling; not imported by MindTree runtime code. Reachable in build/development pipeline. Updated to audit-cleared `8.5.32`. |
| `sharp` optional transitive: `0.35.4` → `0.35.5` | GHSA-wq5f-xc86-pv6w (`<0.35.5`, librsvg dependency). | Next optional image optimization dependency; not directly imported by MindTree, but can be consumed by the existing Next runtime/build. Updated through the targeted Next-compatible dependency resolution. |
| `source-map-js` transitive: `1.2.1` → `1.2.2` | GHSA-68fv-2mgg-jv7q (`>=1.0.0 <1.2.2`). | PostCSS/Tailwind/Vite source-map tooling; build/test rather than MindTree request logic. Updated by the targeted lock resolution. |
| `vite` transitive dev peer: `8.3.0` → `8.3.5` | GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm, GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg (each `>=8.3.0 <=8.3.2`). | Vitest test tooling; Vite is not the Next production build server or app runtime. Updated within compatible Vite 8 peer range. |
| `vitest` / `@vitest/mocker`: `5.0.0` → `5.0.5` | GHSA-qxg6-89mg-rqv8 (`@vitest/mocker >=5.0.0-beta.1 <5.0.3`); GHSA-xp26-3454-mjgp (`@vitest/mocker >=5.0.0-rc.2 <5.0.3`). | Development/test-only. Updated to patched compatible Vitest and mocker `5.0.5`. |
| `zod` transitive dev: `4.6.5` → `4.6.7` | GHSA-mrhx-c7xc-m3w5 (`<4.6.6`, constrained-collection memory exhaustion). | Pulled by `eslint-plugin-react-hooks` under `eslint-config-next`; lint tooling only. Lock-only `npm update zod` selected patched `4.6.7`; no new direct dependency added. |

The direct framework lint package was matched to Next: eslint-config-next `16.2.6` → `16.4.3`. Changes were targeted, then audited and tested. `package.json` now pins Next/eslint-config-next/PostCSS/Vitest to the stated versions; `package-lock.json` locks the resolved transitive patches. No `npm audit fix --force` or blind bulk upgrade was run. npm’s updates changed the necessary framework/test transitive closure; the manifest has no new direct dependency.

### After M8

`npm audit --json` reports **0 high, 0 critical, 4 moderate package entries** and exits 1 because the moderate findings remain. They are `drizzle-kit@0.31.10` (direct dev CLI), its `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` chain, and nested `esbuild` (advisory GHSA-67mh-4wv8-2f99; `esbuild <=0.24.2`). The chain is exercised by database config/migration tooling commands, not `npm run build`, MindTree route code, or Vercel runtime. npm offers `drizzle-kit@0.18.1` as a fix, a major downgrade incompatible with an untested DB tooling change; the newer beta line also changes tool behavior. M8 did not downgrade or override it. **Owner decision remains required** before running untrusted-network-exposed tooling or adopting a breaking drizzle-kit replacement. This is not a clean audit/security-clearance claim.

## 8. Tests, lint, build, and artifact verification

| Check | Result |
|---|---|
| `npx vitest run --config vitest.mindtree.config.ts` | **PASS — 6 files, 38 tests.** Includes product/graph/route-source, M4–M7 editorial/export/learner containment, and 6 new M8 search/filter/navigation/recall-context tests. Isolated config does not load PostgreSQL setup. |
| `node --import tsx tests/kanji-mindtree-contract.test.mjs` | **PASS — 21 tests** (M1 synthetic structural-evidence contract). |
| `npm run typecheck` | **PASS** — `tsc --noEmit`. |
| `npm run lint` | **PASS** — 0 errors, 3 warnings. Warnings are existing: custom Google font link in `src/app/layout.tsx`; missing `fetchQuestions` dependency in `src/app/question-bank/page.tsx`; missing `loadSummary` dependency in `src/app/review/session/[id]/page.tsx`. No M8 warning/error was introduced. |
| Targeted ESLint on M8 changed UI/helper/route/tests | **PASS**. |
| `npm audit --json` after updates | **0 high / 0 critical; 4 moderate** remain; command’s nonzero exit is due to those moderate findings. |
| `node --import tsx scripts/report-kanji-mindtree-source-refresh.ts` | **PASS_LOCAL_ARTIFACTS**, no network/refresh/ingestion; both slices validate and hash-match. |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | **PASS** with no `DATABASE_URL`. Next.js `16.4.3` compiled, typechecked, collected page data, generated all **114 static pages** and finalized optimization. MindTree routes appear in route table: `/mindtree` static; `/mindtree/[character]`, `/mindtree/studio`, preview route dynamic. No DB or migration command ran. |
| `git diff --check` | **PASS**; final untracked-file whitespace scan is in §13. |
| Repository-wide `npm test` | **NOT RUN**: `tests/setup.ts` loads dotenv for tests explicitly connected to real PostgreSQL. No DB URL/access was available or authorized. |
| Browser/assistive technology | **NOT RUN / unavailable**, as detailed in §6. |

Build generated an automatic `next-env.d.ts` route-types import. It was recorded as tool-generated, then restored byte-for-byte to its verified pre-M8 hash `7b550dda9686c16f36a17bf9051d5dbf31e98555b30d114ac49fc49a1e712651`; it is not a final M8 change. `.next` is ignored build output. Local `.next` occupied 241 MB including compiler/cache/build data; the MindTree server output directory was 169 KB and the character route trace listed 133 dependencies (~2.47 MB by traced file size). These are local Next artifacts, not Vercel function-size measurements. The static catalog HTML response was ~180 KB; a detail response ~90 KB uncompressed in the local HTTP checks. No external SVG/network asset was needed for MindTree routes.

## 9. Vercel and runtime architecture

- No `vercel.json`, `.vercel/project.json`, Vercel CLI, deployment URL, or project-specific Vercel configuration is present. `next.config.ts` is the default empty Next config; Vercel can auto-detect the Next framework, but project linkage/settings were not available to inspect. No production/preview Vercel environment settings were queried.
- `package.json` requires Node `>=22.0.0`; Vercel must select Node 22 or newer supported by the platform. The tested local runtime was Node `v22.22.3` with npm `10.9.8`. `package-lock.json` supports the standard `npm ci` install. Vercel’s actual builder/runtime version and limits were not observed.
- MindTree imports checked-in data and does not import `@/db`, `pg`, Supabase, AI providers, or an API for learner routes. Build passed without environment variables. A direct built MindTree request does not query the DB.
- The overall site **does** need a runtime `DATABASE_URL` for `/` and numerous existing database-backed APIs/pages. In the local optimized server, `/` returned HTTP 500 with `DATABASE_URL is required`; direct `/mindtree` routes still returned 200. Thus the shared layout/nav is database-independent, but the main Overview entry route is not. Configure a valid, appropriately scoped Vercel runtime DB connection and ensure the existing app schema is provisioned by the owner’s authorized process. No DB/schema/migration action was taken. Do not put a URL/secret in chat or commit it.
- `.env.example` documents `DATABASE_URL` with a local placeholder and the existing Supabase public auth URL/publishable key. No real values were present in process environment or local env files. MindTree itself needs none of those; the existing auth callback and database-backed application surfaces have their own requirements. No service-role key is documented or added.
- `/mindtree/studio` and `/mindtree/studio/preview/[character]` check `NODE_ENV === "development"`; local production smoke returned 404 for both. This is a deliberate unauthenticated-authoring privacy boundary. Do not expose the studio via Vercel by removing its guard.
- No Vercel preview or production deployment occurred. This branch has no upstream configured, the workspace has no Vercel project authorization/link, and pushing/deployment are expressly unauthorized. No preview URL is claimed.

## 10. Source hashes and corpus preservation

Final offline check confirms exact preflight hashes and row counts:

| Artifact | Records | SHA-256 |
|---|---:|---|
| `src/data/kanji-mindtree/kanjivg-structure-slice.json` | 100 | `03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862` |
| `src/data/kanji-mindtree/kanjidic2-facts-slice.json` | 100 | `4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6` |
| `src/data/kanji-mindtree/mnemonic-candidates.ts` | 44 candidate overlay entries, fixed corpus unchanged | `cf0709dba391da771bb524b4a7ea4e4d5fc51a423b348177473546293dfec95b` |

No source artifact, candidate content, license, upstream pin, or supported-character count was changed. No corpus generation/refresh occurred. Integrity is not upstream freshness, legal clearance, Japanese correctness, or human review.

## 11. Remaining limitations and owner actions

1. **Mnemonic editorial gate:** a qualified reviewer must review existing content under an actual identity/role process; resolve first-party provenance and AI-origin editorial policy. Until a separately trusted release mechanism is approved, no story should be learner-visible. M8 intentionally does not enable one.
2. **Vercel access:** owner must provide a linked project/authorize a preview workflow and separately authorize pushing the current session branch if required. The agent did not push, commit, or deploy.
3. **Environment:** owner/operator must configure a valid runtime `DATABASE_URL` for the existing site Overview and database-backed routes in the appropriate Vercel environment; verify schema/data via existing authorized procedures. MindTree route rendering itself does not need DB access.
4. **Accessibility/browser acceptance:** complete §12 on actual supported browsers and assistive technologies. No browser test is claimed.
5. **Dependency follow-up:** decide how to retire/replace the moderate Drizzle Kit/esbuild chain without an unsafe major downgrade. Re-audit the locked tree before production release.
6. **Studio:** do not make the local studio available on preview/production without authentication, role authorization, persistence/audit semantics and privacy/security review. No release/publish operation is available today.

## 12. Owner UAT and post-deployment acceptance checklist

After an authorized Vercel preview URL exists and required runtime configuration is present:

1. Open `/mindtree` directly, refresh it, and follow the visible MindTree global-nav entry on desktop and mobile.
2. Search a supported glyph (e.g. `明`), a meaning (`bright`), and a recorded reading; clear search. Search `龍` and confirm a clear no-result state, not a fabricated result. Try JLPT and Grade 1 filters and clear them.
3. Open `/mindtree/%E6%98%8E` directly and refresh; verify the exact character, meaning/source lane, On/Kun labels, stroke count, source-backed SVG annotations, and component details.
4. Select repeated/nested source annotations by keyboard; confirm visual highlight and text details stay associated. Do not interpret source group markup as etymology.
5. Follow a related component and a shared reading link; verify the `from`/`via` breadcrumb and return link, then change characters and confirm stale focus/selection does not carry over.
6. Walk Observe → Break down → Associate → Remember → Recall → Explore. With current no-release state, verify draft stories remain hidden; practice meaning/component recall, reveal/cover answer, switch activity, and return to Explore. Confirm no answer/rating is persisted.
7. Open `/mindtree/%E4%B8%80`, `/mindtree/%E4%BA%BA`, `/mindtree/%E9%BE%8D`, and `/mindtree/%E6%98%8E%E4%BA%BA`; confirm candidate-hidden, supported-missing, unsupported-single, and unsupported-multi-character states respectively.
8. Try `/mindtree/` and confirm canonical redirect; test Japanese URL encoding, reload and browser back/forward.
9. Verify no AI-candidate story, review note, provenance finding, draft text or export content appears in learner DOM/network payload. Do not attempt to make one visible.
10. Confirm `/mindtree/studio` is unavailable on production and its preview endpoint returns 404; do not weaken the development-only guard.
11. At 320px, 375px, tablet and desktop widths, inspect no horizontal page overflow, mobile nav scroll, card layout, graph sections and forms. Perform actual keyboard-only tab/shift-tab activation and focus return.
12. Test with an actual screen reader if making screen-reader claims; measure contrast and check focus, live announcements, heading order, names, SVG announcement and error/missing states.
13. Inspect browser console/network requests and production logs for failed assets, React hydration issues, unexpected DB requests from MindTree or server exceptions.
14. Separately verify `/` and DB-backed application areas with owner-provisioned Vercel runtime DB. A MindTree 200 does not prove the full app or database is healthy.
15. Record preview build ID/URL and owner UAT outcomes separately from this local report. Do not call the result production-accepted until the owner approves it.

## 13. Final preservation and authorization audit

Final repository state after M8 edits/report:

- Root and identity unchanged: `/home/user/nihingobridgeupgrade`; branch `arena/40788dd5-nihingobridgeupgrade`; HEAD `cf7a4c673236af2f507af8529dae0946fbed3bdf`; shallow `true`; `origin` only; no upstream.
- **6 tracked modified paths** = 4 inherited application edits plus the M8 dependency manifest/lockfile changes. **48 untracked paths** = 45 inherited M1–M7 paths plus two M8 implementation/test files and this M8 report. **0 staged; 0 deletions.** Complete final untracked inventory follows; `*` means inherited path modified by M8, `+` means new in M8:
  - `docs/architecture/KANJI-MINDTREE-M1-A-CONTRACT.md`
  - `docs/architecture/KANJI-MINDTREE-PRODUCT-ARCHITECTURE.md`
  - `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md`
  - `reports/kanji-mindtree/M1-C-SOURCE-PROVENANCE-AND-ARTIFACT-VERIFICATION-PLAN.md`
  - `reports/kanji-mindtree/M2-VERTICAL-SLICE-IMPLEMENTATION-AND-VERIFICATION.md`
  - `reports/kanji-mindtree/M3-MEANING-TO-REMEMBER-IMPLEMENTATION.md`
  - `reports/kanji-mindtree/M4-MNEMONIC-CONTENT-AND-LEARNING-EXPERIENCE.md`
  - `reports/kanji-mindtree/M5-EDITORIAL-REVIEW-AND-LEARNING-QUALITY.md`
  - `reports/kanji-mindtree/M6-CONTROLLED-HUMAN-REVIEW-PILOT-AND-RELEASE-READINESS.md`
  - `reports/kanji-mindtree/M7-HUMAN-REVIEW-WORKFLOW-AND-ACCESSIBILITY-VALIDATION.md`
  - `reports/kanji-mindtree/M8-FULL-FEATURE-AND-VERCEL-READINESS.md` (+)
  - `scripts/build-kanji-mindtree-kanjidic2-slice.ts`
  - `scripts/build-kanji-mindtree-slice.ts`
  - `scripts/report-kanji-mindtree-source-refresh.ts`
  - `src/app/mindtree/[character]/page.tsx` (*)
  - `src/app/mindtree/page.tsx`
  - `src/app/mindtree/studio/page.tsx`
  - `src/app/mindtree/studio/preview/[character]/route.ts`
  - `src/components/kanji/KanjiMindTreeCatalog.tsx` (*)
  - `src/components/kanji/KanjiMindTreeExplorer.tsx` (*)
  - `src/components/kanji/KanjiMindTreeLearningJourney.tsx` (*)
  - `src/components/kanji/KanjiMindTreeMnemonicStudio.tsx`
  - `src/data/kanji-mindtree/NOTICE.md`
  - `src/data/kanji-mindtree/kanjidic2-facts-slice.json`
  - `src/data/kanji-mindtree/kanjivg-structure-slice.json`
  - `src/data/kanji-mindtree/mnemonic-candidates.ts`
  - `src/lib/kanji/kanjiMindtreeCatalog.ts`
  - `src/lib/kanji/kanjiVgSvgAdapter.ts`
  - `src/lib/kanji/kanjidic2MindtreeFacts.ts`
  - `src/lib/kanji/learningGraph.ts`
  - `src/lib/kanji/mindtreeCatalogSearch.ts` (+)
  - `src/lib/kanji/mindtreeEditorialEvidence.ts`
  - `src/lib/kanji/mindtreeEditorialPilot.ts`
  - `src/lib/kanji/mindtreeLearningJourney.ts` (*)
  - `src/lib/kanji/mindtreeMnemonicContent.ts`
  - `src/lib/kanji/mindtreeMnemonicExport.ts`
  - `src/lib/kanji/mindtreeMnemonicQuality.ts`
  - `src/lib/kanji/mindtreeMnemonicRevisions.ts`
  - `src/lib/kanji/mindtreeReleaseReadiness.ts`
  - `src/lib/kanji/structuralEvidenceGraph.ts`
  - `tests/kanji-mindtree-contract.test.mjs`
  - `tests/kanji-mindtree-m4.test.ts`
  - `tests/kanji-mindtree-m5.test.ts`
  - `tests/kanji-mindtree-m6.test.ts`
  - `tests/kanji-mindtree-m7.test.ts`
  - `tests/kanji-mindtree-m8.test.ts` (+)
  - `tests/kanji-mindtree-product.test.ts` (*)
  - `vitest.mindtree.config.ts`
- Tracked modification inventory: inherited `src/app/kanji/[character]/page.tsx`, `src/app/kanji/page.tsx`, `src/data/kanji.ts`; `src/components/layout/Navbar.tsx` contains the inherited MindTree nav item plus M8 responsive/mobile/focus changes; M8 security-only changes in `package.json` and `package-lock.json`.
- `next-env.d.ts` was confirmed clean before preflight, changed by Next dev/build, and restored to the exact pre-M8 bytes. No source artifact was modified. `git diff --check` and untracked M8 test/report whitespace checks pass.
- No DB URL or secret was read; no PostgreSQL/Supabase connection, migration, seed, production data action, schema change, Phase 26F or SRS change occurred. No external source refresh or corpus generation occurred.
- No file was staged or committed; no push, PR, merge, branch switch, Vercel deployment, external publication, or release action was performed. No reviewer identity, human review, approval, timestamp or authorization was fabricated.

**Owner gate recommendation:** keep content unpublished. Authorize and configure the Vercel preview/runtime path separately, then perform the manual UAT in §12. Review the remaining four moderate dev-tool audit findings before deciding production policy. Do not claim an M8 production acceptance or deploy until those owner actions are complete.
