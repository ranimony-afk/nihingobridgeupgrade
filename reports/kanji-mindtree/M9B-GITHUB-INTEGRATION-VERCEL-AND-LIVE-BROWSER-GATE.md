# M9B — Controlled GitHub Integration, Vercel Deployment Verification & Live Browser Gate

**Date:** 2026-10-30 (Asia/Kolkata)

**Repository:** `ranimony-afk/nihingobridgeupgrade`

**Working branch:** `arena/b8d97f5b-nihingobridgeupgrade`

**Scope boundary:** M9A MindTree/filter integration and release readiness only. No 2,500-kanji ingestion was started. No remote, Vercel, Supabase, or production database mutation was performed.

---

## 1. Executive verdict

| Gate | Verdict | Evidence-based conclusion |
|---|---|---|
| M9A implementation integrity | **PASS WITH CONDITIONS** | The persisted M9A workspace implementation was independently audited and revalidated. The alleged original Git object `28bd280` is not present in this new checkout or on GitHub, so its full SHA cannot be verified; the recovered content is committed as `9b934ffecba574479b183e8ee3434fe71cbdb374` with explicit provenance. |
| GitHub integration readiness | **PASS WITH CONDITIONS** | Current `origin/main` is exactly the M9A baseline and merges cleanly. The delivery branch is unpushed, and a potential one-file textual conflict exists only if open PR #22 merges first. |
| Local automated tests | **PASS WITH CONDITIONS** | Required M9A suites, typecheck, lint, source integrity, build, and local route checks pass. The whole-repository suite remains non-green because 80 tests require absent gitignored corpora/derived artifacts or hit a pre-existing PGlite error-shape issue. |
| Local browser acceptance | **PASS** | Real headless Chromium against `next start` reproduced **49/49** documented checks. A forced out-of-order rapid-element-switch test also passed. |
| Vercel deployment identity | **PASS (baseline identity verified)** | GitHub deployment metadata verifies the current Production URL is sourced from `23546cf...`, not M9A. A successful Vercel status is not treated as live M9A acceptance. |
| Live browser acceptance | **BLOCKED** | No remote branch/PR/deployment contains M9A; publishing is not authorized. The sandbox also cannot reach the Vercel URLs (HTTP transport result `000`). |
| Security and editorial restrictions | **PASS WITH CONDITIONS** | Local production-mode checks prove Studio and Studio preview return 404 and tested AI candidate strings are absent. No deployed-output inspection or Vercel environment-variable inspection was possible. |
| Whole-site runtime readiness | **BLOCKED** | The whole site requires a valid database connection. In a no-`DATABASE_URL` local production server, `/` and `/api/kanji` returned 500; Vercel environment presence is not inspectable with the available authorization. |

**Overall: PASS WITH CONDITIONS for local M9A delivery readiness; BLOCKED for deployed/live acceptance.** M10 must **not** begin the 2,500-kanji ingestion. It may begin only after the owner authorizes delivery, the deployed commit is verified, and the live browser gate passes.

---

## 2. Exact initial Git identity

The following was captured **before modifying files** in this M9B session:

| Item | Initial value |
|---|---|
| Repository root | `/home/user/nihingobridgeupgrade` |
| Current branch | `arena/b8d97f5b-nihingobridgeupgrade` |
| Initial `HEAD` | `23546cf4966fbc6321c72af2ee1313c7c3af0b3a` |
| Initial commit subject | `Merge pull request #23 from ranimony-afk/arena/40788dd5-nihingobridgeupgrade` |
| `origin` fetch/push URL | `https://github.com/ranimony-afk/nihingobridgeupgrade.git` |
| Remote default branch | `main` |
| Initial `origin/main` | `23546cf4966fbc6321c72af2ee1313c7c3af0b3a` |
| Initial clone state | Shallow clone (`.git/shallow` present) |
| Post-review clone state | Full clone after safe `git fetch --deepen=200` for merge simulation |
| Initial merge/rebase state | None (`MERGE_HEAD`, `rebase-merge`, and `rebase-apply` absent) |
| Initial staged/deleted files | None |
| Initial changed files | Six modified M9A source files and seven untracked M9A reports/scripts/tests, listed below |

Initial modified files:

```text
M src/app/api/kanji/route.ts
M src/app/kanji/page.tsx
M src/components/kanji/KanjiMindTreeCatalog.tsx
M src/components/kanji/KanjiMindTreeMnemonicStudio.tsx
M src/components/layout/Navbar.tsx
M src/services/knowledge/knowledgeService.ts
```

Initial untracked M9A files:

```text
reports/kanji-mindtree/M9A-ELEMENT-FILTER-AND-2500-KANJI-EXPANSION-FOUNDATION.md
reports/kanji-mindtree/m9a-browser-acceptance-log.json
scripts/m9a-browser-acceptance.mjs
src/lib/kanji/elementFilterContract.ts
tests/kanji-element-filter-service.test.ts
tests/kanji-element-filter.test.ts
tests/kanji-mindtree-m9a.test.ts
```

No destructive cleanup, reset, checkout, history rewrite, force push, branch deletion, or remote mutation was used.

---

## 3. Verified M9A commit identity

### Reported object versus independently recoverable evidence

M9A reported commit short SHA `28bd280`. In this fresh M9B checkout:

```text
git rev-parse 28bd280  -> fatal: ambiguous argument / unknown revision
git cat-file -t 28bd280 -> invalid object name
git fsck --no-dangling -> no recoverable dangling M9A commit
gh api repos/ranimony-afk/nihingobridgeupgrade/commits/28bd280 -> HTTP 422, “No commit found for SHA”
origin refs/heads/arena/b8d97f5b-nihingobridgeupgrade -> absent
gh pr list --head arena/b8d97f5b-nihingobridgeupgrade -> []
```

The branch reflog shows it was created directly from `23546cf...` in this checkout. Therefore **the original full SHA for `28bd280` cannot be independently resolved**. It would be incorrect to claim that `28bd280` itself was recovered or verified as a Git object.

### Evidence-backed recovery

The actual M9A files persisted in the Arena workspace. They were audited against the claimed M9A change inventory, diffed against verified baseline `23546cf...`, validated, and committed without reconstructing missing content from memory:

| Commit | Purpose |
|---|---|
| `9b934ffecba574479b183e8ee3434fe71cbdb374` | Recovery commit: canonical element-filter contract, service/route/page fixes, mobile/focus fixes, M9A tests, browser harness, M9A report and log. |
| `c15ead0ac1ded0e25261ed6d0650a1095e73276b` | Narrow M9B accessibility correction: `Elements` changed from `h3` to sequential `h2` under the `/kanji` page `h1`; no visual, data, or filter behavior changed. |

Recovery-commit diff statistics relative to baseline were exactly **13 files, 3,571 insertions, 141 deletions**. `git diff --check` returned exit 0.

This provenance qualification is why M9A implementation integrity is **PASS WITH CONDITIONS**, not an unqualified historical-commit PASS.

---

## 4. Current remote `main` identity

A non-mutating `git fetch origin` was performed before integration assessment:

| Item | Value |
|---|---|
| `origin/main` | `23546cf4966fbc6321c72af2ee1313c7c3af0b3a` |
| Default branch | `main` |
| Verified merge base, delivery branch ↔ `origin/main` | `23546cf4966fbc6321c72af2ee1313c7c3af0b3a` |
| Remote advancement since M9A baseline | None |
| PR #23 | Merged 2026-10-29; head `fa39414ef76024079ab86b010f0352f053666c08`, merge commit `23546cf...` |

At this report’s preparation point, the delivery work is two local commits ahead of `origin/main` and zero commits behind it (`0 2` from `git rev-list --left-right --count origin/main...HEAD`). This report will be committed separately as evidence, making the final delivery branch one additional local commit ahead until an authorized push occurs.

---

## 5. Complete integration diff summary

### Audited M9A implementation

| Area | Audited result |
|---|---|
| Canonical filter contract | Added `src/lib/kanji/elementFilterContract.ts` (pure normalization, deterministic ordering, element usage/count analysis, zero taxonomy, reset helpers, request sequencer). |
| API/service count semantics | `KnowledgeService.listKanji`, `listElements`, and `GET /api/kanji` now use one contract. `total` is filtered result count; `catalogTotal`, `elementFilter`, `emptyKind`, `relationshipCount`, `usedInCount`, and `visibleKanjiCount` are explicit. |
| `/kanji` client state | Independent level/element/keyword facets; request sequencing rejects stale responses; context-specific reset actions; explanatory empty states; focus-visible treatment. |
| Responsive fixes | Navbar mobile scroll container is `relative`; MindTree catalog and Studio grids have a minimum zero-width column. |
| Tests/evidence | Added pure contract tests, DB/API contract tests, MindTree M9A regression tests, real Chromium acceptance harness/log, and M9A architecture report. |
| M9B accessibility correction | One semantic-only heading change (`h3` → `h2`) in `/kanji`. |

### Explicit non-changes

The audited delivery diff contains **no changes** under canonical `src/data/`, `src/db/`, `drizzle/`, SRS service paths, Phase 26F paths, source-provenance hashes, mnemonic canonical-content files, or the production Studio guard. Hunk review confirmed:

- No kanji records, relationships, readings, provenance, source hashes, or corpus files were invented or changed.
- No database schema or migration files were changed.
- No SRS methods were changed; `knowledgeService.ts` changes are confined to imports and Kanji list/element methods.
- `src/app/mindtree/studio/page.tsx` retains `if (process.env.NODE_ENV !== "development") notFound();`.
- Publication remains mediated by existing `getPublishedMnemonic`; no editorial state was published.
- No 2,500-kanji corpus data was imported or generated.

---

## 6. Conflict and preservation assessment

### Current main

`git merge-tree --write-tree --name-only HEAD origin/main` exited **0**. Current `origin/main` is the direct merge base, so the M9A/M9B delivery branch has **no integration conflict with current main**.

### Other open work

| Open PR | Head | Result of local merge-tree simulation against final M9B source | Assessment |
|---|---|---|---|
| #21 `fix(read-paths)` | `1f56e6110b068caf2eabcb6da712479d433c0d55` | Exit 0 | Clean. |
| #22 `integration/phase-26f-combined` | `82952526f04ef6ee9e773faa99db44e099402ebd` | Exit 1, only `src/services/knowledge/knowledgeService.ts` conflicts | Potential future conflict only; not a conflict with current `main`. |

PR #22 adds `requireOwner`/learner SRS imports and changes starting in the baseline SRS section around line 615. M9A changes the Kanji filtering section around lines 290–472. The shared textual hunk is the import block. If #22 lands first, resolve by retaining **both** import groups, then rerun typecheck plus relevant M9A and Phase 26F checks. No attempt was made to merge, alter, or pre-resolve #22 without owner direction.

All inherited M9A content was preserved; no unrelated changes were discarded.

---

## 7. Revalidated test results

All commands below were run in this session; no earlier report totals were copied as validation.

| Validation | Command / method | Result |
|---|---|---|
| Dependency restoration | `npm ci` | PASS, exit 0 |
| TypeScript | `npx tsc --noEmit` (also rerun after M9B heading correction) | PASS, exit 0 |
| Lint | `npm run lint` | PASS, exit 0; **0 errors, 3 pre-existing warnings** |
| MindTree isolated suite | `npx vitest run --config vitest.mindtree.config.ts` | PASS, **47/47** |
| M1 contract | `node --import tsx tests/kanji-mindtree-contract.test.mjs` | PASS, **21 pass / 0 fail** |
| M9A filter/MindTree/expansion tests | `npx vitest run tests/kanji-element-filter.test.ts tests/kanji-element-filter-service.test.ts tests/kanji-mindtree-m9a.test.ts tests/kanji-expansion.test.ts` | PASS, **62/62** (34 pure + 14 service/route + 9 M9A MindTree + 5 expansion) |
| Source integrity | `node --import tsx scripts/report-kanji-mindtree-source-refresh.ts` | PASS, `PASS_LOCAL_ARTIFACTS`; both local slice hashes match and both validations are true |
| Production build | `NEXT_TELEMETRY_DISABLED=1 npm run build` | PASS, **114/114** static pages |
| Local optimized route checks | Real `next start` with disposable local DB | PASS, 9/9 (`/`, `/kana`, `/kanji`, `/kanji/灯`, `/mindtree`, encoded `/mindtree/明`, `/api/kanji`, production Studio 404, trailing-slash redirect) |
| Browser acceptance | `LD_LIBRARY_PATH=/tmp/al2023-libs/lib node scripts/m9a-browser-acceptance.mjs --base-url http://127.0.0.1:3100 ...` | PASS, **49/49**; evidence at `reports/kanji-mindtree/M9B-BROWSER-ACCEPTANCE-LOG.json` |
| Rapid element switching | Chromium request interception delayed older 木/日 requests 850 ms; 月 response was allowed first | PASS: final selected 月, older buttons false, exactly `明` rendered, live text says “月 — 1 of 1”. |

The production server used a **local disposable PGlite PostgreSQL-compatible instance only** (`nihongo_test` under `/tmp`). Schema initialization/reset via `drizzle-kit push --force` was limited to that disposable test target. No hosted database, Supabase project, shared database, or migration history was changed.

---

## 8. Full-suite failure classification

### Exact final full-suite result

```text
DATABASE_URL=...nihongo_test NIHONGO_DB_TARGET_CLASS=disposable \
NIHONGO_DB_EXPECTED_DATABASE=nihongo_test \
npx vitest run --reporter=json --outputFile=/tmp/m9b-full-suite-final.json

1,376 total | 1,239 passed | 80 failed | 57 skipped | exit 1
```

The 80 failures occur in Phase 14 corpus/derived-artifact suites and one untouched questions test. All four M9A test files passed in the complete run:

```text
kanji-element-filter.test.ts          34 pass / 0 fail
kanji-element-filter-service.test.ts  14 pass / 0 fail
kanji-mindtree-m9a.test.ts             9 pass / 0 fail
kanji-expansion.test.ts                5 pass / 0 fail
```

### Evidence-based classification of 80 failures

| Classification | Count | Evidence |
|---|---:|---|
| Missing gitignored source or derived artifacts (`ENOENT`) | 32 | Examples: absent `data/JMdict.xml`, KanjiVG index/assets, and derived graph/decomposition state. |
| Missing full-corpus-derived records/coverage | 19 | Assertions find seed/pilot coverage rather than required derived graph, vocabulary, attachment, or decomposition records. |
| Deliberate fail-closed corpus/baseline target gates | 12 | `TARGET_CLASSIFICATION`, canonical-baseline, or source-verification stops correctly refuse the disposable non-canonical target. |
| Full-corpus scale/hash expectations | 5 | Expected KANJIDIC2/JMdict corpus counts/hashes (for example 13,108 / 206,747) cannot hold for the local seed/pilot data. |
| Other corpus-specific baseline/fixture expectations | 11 | Reading, hash, expected-count, and related assertions trace to absent corpus/derived state rather than M9A filter changes. |
| PGlite unique-violation error-shape mismatch | 1 | `questions-post-authorization.test.ts` expected HTTP 409 but received 500 because PGlite’s nested error did not expose the PostgreSQL `code` consumed by the untouched questions code. |
| **Total** | **80** |  |

The 80 failed assertions are distributed across `dry-run-jmdict`, KANJIDIC2 ingestion/gate/ETL suites, KanjiVG acquisition/attachment/ETL suites, Kanji-JMdict graph/decomposition/lexical suites, the stroke-order panel, and the single questions test. Four additional test files were marked failed by Vitest status while containing only skipped/conditional assertions; they do not add to the 80 failed assertions.

For attribution control, a detached baseline worktree at `23546cf...` reproduced representative failures: the JMdict dry run, KanjiVG stroke-order panel, PGlite questions test, and 20 failures across lexical/KANJIDIC2 suites. No M9A-touched test file failed. This supports **not a demonstrated M9A regression**, but it does **not** make the full-suite failures harmless or resolved.

---

## 9. Vercel project and deployment identity

No Vercel CLI link/configuration is present in the repository (`vercel.json` and `.vercel/` are absent), and no Vercel credential or environment-variable access was used. GitHub’s Vercel deployment integration provides the following auditable identity:

| Item | Verified value |
|---|---|
| Linked repository evidence | GitHub repository deployment record created by `vercel[bot]`; commit status context `Vercel` on `23546cf...` |
| Vercel dashboard project path exposed by GitHub status | `kim-j/nihongobridge` |
| Latest GitHub Production deployment ID | `7413851298` |
| Latest Production deployment timestamp | `2026-10-29T13:42:02Z` |
| GitHub deployment environment/status | `Production`; status `success` / “Deployment has completed” |
| Vercel dashboard deployment URL | `https://vercel.com/kim-j/nihongobridge/9gUoryAeyFUv5KJ9qz61Z9aA6AHV` |
| Latest Production application URL | `https://nihongobridge-j0xzzsvgj-kim-j.vercel.app` |
| Latest observed Preview GitHub deployment ID | `7413693724` |
| Preview source / URL | PR #23 head `fa39414ef76024079ab86b010f0352f053666c08` → `https://nihongobridge-11owjc21g-kim-j.vercel.app` |

Observed Preview records for PR work (including #23 and #22) show that the existing integration creates Vercel Preview deployments for GitHub branch/PR commits. The explicit Vercel production-branch setting itself is not readable through the available GitHub-only metadata; however, the latest Production deployment’s SHA exactly equals `origin/main`.

Deployment logs and Vercel environment-variable presence could not be independently read: direct Vercel hosts are outside the sandbox’s permitted egress, and GitHub secret metadata returned HTTP 403 for this integration. No secret values were requested, displayed, or changed.

---

## 10. Deployment source-commit verification

The current production deployment record is unambiguous:

```text
GitHub deployment ID: 7413851298
Environment:          Production
Creator:              vercel[bot]
Source ref / SHA:     23546cf4966fbc6321c72af2ee1313c7c3af0b3a
Deployment status:    success / Deployment has completed
```

`23546cf...` is the merged PR #23 baseline. It does **not** contain the M9A diff: the M9A recovery commit `9b934ff...` and M9B accessibility commit `c15ead0...` are local-only and the branch does not exist on `origin`.

Therefore:

- The deployed application is **A. Only the prior PR #23 implementation**, not B (M9A) and not C (an unexpected commit).
- The original reported 丁 count/result correction is **not deployed**.
- A successful Vercel deployment status proves deployment completion for baseline `23546cf...`; it does **not** prove M9A deployment or M9A browser acceptance.

---

## 11. Local browser results

A production build was served with `next start` on local port 3100 using the disposable local database. Real headless Chromium was provisioned from `@sparticuz/chromium`; no browser dependency was committed.

**Result: 49 passed, 0 failed, 0 skipped.** The machine-readable evidence log is committed beside this report:

```text
reports/kanji-mindtree/M9B-BROWSER-ACCEPTANCE-LOG.json
```

Coverage includes:

- `/kanji` navigation and source-backed `/mindtree` catalog round trip.
- 丁 default and N5-excluded paths, 木 raw-edge vs distinct-character counts, zero-count 金, literal keyword semantics, resets and explanatory empty states.
- Grade 1 catalog count/result consistency and query combination.
- Percent-encoded Japanese direct routes, unsupported-character behavior, existing Kanji detail route, and graceful multi-character handling.
- All six learning journey stages; Recall reveal/hide; per-character transition; Explore context links; browser back/forward history.
- Honest absent-local-KanjiVG stroke-order response (`404 STROKE_ORDER_UNAVAILABLE`).
- 375px, 768px, and 1280px responsive checks with no horizontal overflow.
- Keyboard Tab reachability, Enter toggle, `aria-pressed`, and focus-visible class checks (0 missing).
- Production Studio and Studio-preview 404s, AI candidate/legacy story absence, GET-only test behavior, and no unexpected browser errors.

The final log classifies non-product network noise as 16 environment/font failures, 125 Next prefetch aborts, and 2 missing-local-corpus requests; it records **0 unexpected** browser/page/console/network failures.

---

## 12. Live browser results, if actually executed

**Verdict: BLOCKED / NOT RUN.**

No live browser test was executed against Vercel because:

1. No Vercel deployment contains `9b934ff...` / `c15ead0...`; the live application is baseline `23546cf...`.
2. Pushing the branch, creating a PR, triggering/promoting a Vercel deployment, or modifying Vercel settings is outside current authorization.
3. Direct probes of the known Vercel app and dashboard URLs returned HTTP transport result `000` in this sandbox, whose allowed outbound hosts do not include Vercel.

No local result is described as a deployed result. No live screenshots, deployed console logs, or deployed accessibility claims were fabricated.

---

## 13. Element-filter acceptance matrix

### Contract verified

The canonical contract is implemented in `src/lib/kanji/elementFilterContract.ts`:

- `relationshipCount`: raw composition-edge count; diagnostic only.
- `usedInCount`: distinct integrity-valid catalog kanji using the element, not raw edges.
- `visibleKanjiCount`: distinct matching catalog kanji after active level and keyword facets; this is the palette badge.
- API `total`: filtered visible result total.
- **Invariant:** `visibleKanjiCount === displayedResult.length` whenever the badge represents visible kanji.
- Dangling/missing records never fabricate a matching character.
- Level, element, and keyword are AND-composed but independent facets; reset actions clear only the stated facet(s).
- Zero taxonomy distinguishes unknown element, no relationships, no catalog kanji, level exclusion, keyword exclusion, and combined exclusion.

### Fresh-seed API acceptance

Against a freshly reset local 33-kanji/55-element seed:

| Probe | Result |
|---|---|
| 丁 (`el-chou`) | `total=1`, result 灯, `usedInCount=1`, `relationshipCount=1`, `visibleKanjiCount=1` |
| 丁 + N5 | `total=0`, `zeroKind=element-excluded-by-level`, one hidden by level, badge `0 of 1` |
| 木 (`el-ki`) | `relationshipCount=8`, distinct catalog / visible result count `5`; proves raw edges are not presented as visible result count |
| 木 + N5 | Browser acceptance confirms `3 of 5` visible and exactly 3 cards rendered |
| 日 | `total=3` |
| 月 | `total=1`, result 明 |
| 金 | `total=0`, `zeroKind=element-no-relationships`, raw relationship count 0 |
| Unknown element ID | `total=0`, `zeroKind=element-unknown` |
| `q=%` | 0 results; literal keyword behavior (no wildcard expansion) |

### Exhaustive available-element/level checking

| Matrix | Requests | Result |
|---|---:|---|
| Every fresh-seed palette element (55) × every level (`all`, N5, N4, N3, N2, N1) | 330 | **330/330 PASS**: selected element badge equals API result total; selected-element visible count equals total; exclusion partition reconciles with catalog count. |
| Every element present after ETL test-state expansion (63) × every level × an unmatched keyword (`zzz`) | 378 | **378/378 PASS**: `total=0`, palette `visibleKanjiCount=0`, and contract/API counts agree. This intentionally validates state tolerance rather than a hard-coded seed count. |
| Forced rapid sequence 木 → 日 → 月 | 1 browser scenario | **PASS** under deliberate out-of-order request delay; older 木/日 responses could not overwrite final 月 state. |

The original defect—badge 1 for 丁 while no result rendered under a level filter—is corrected locally. It remains **unverified in deployment** because the deployed source commit predates M9A.

---

## 14. Accessibility and responsive findings

### Automated/local findings

- Keyboard acceptance passed: Tab reaches filters, palette, and cards; Enter toggles an element and updates `aria-pressed`.
- All inspected `/kanji` interactive controls have focus-visible ring styling in browser acceptance (0 missing).
- Filter controls are in a named group; all six level buttons expose `aria-pressed`; element buttons expose count/relationship context in their accessible names.
- The keyword input has a real associated `<label>` (`Search kanji or meaning`), not merely a placeholder.
- Reset appears after filters activate.
- M9B found that `/kanji` had `h1` then `h3` for Elements. It was safely corrected to `h1` then `h2` in `c15ead0...`; final Chromium verification confirms sequential `/kanji` headings.
- Responsive no-overflow checks passed at 375, 390, 768, 1280, and 1440 CSS-pixel viewports for `/kanji`, `/mindtree`, and `/mindtree/明` as applicable. The earlier mobile Navbar and catalog-grid defects did not recur.

### Limitations deliberately retained

- Automated browser checks are not manual screen-reader acceptance.
- A valid manual 200% browser-zoom test was not substituted with CSS `zoom`; it remains a required live/manual accessibility step.
- No deployed accessibility scan was run, because M9A is not deployed.

---

## 15. Security and editorial gate verification

### Locally verified production-mode restrictions

| Gate | Result |
|---|---|
| `/mindtree/studio` | 404 in production mode |
| `/mindtree/studio/preview/明` | 404 in production mode |
| AI candidate mnemonic overlay | Known candidate string absent from learner HTML for 一 |
| Legacy AI-revised stories | Known candidate string absent from `/kanji/男` and `/kanji/箸` HTML |
| Acceptance script writes | GET-only; no DB write attempted |
| Published canonical content | No M9A changes to canonical mnemonic records or publication logic |
| Sensitive values | No secrets printed, requested, or altered |

A local no-database `/api/kanji` error response exposed a failed SQL query string but no credentials. Source comparison proves this catch-and-return behavior was present in baseline `23546cf...` and was not introduced by M9A. It is recorded as a whole-site hardening condition, not silently ignored and not altered out of M9B scope.

Because deployed HTML, runtime headers, browser output, and Vercel environment configuration could not be inspected, security/editorial verification is **PASS WITH CONDITIONS**, not an unconditional deployed-production security sign-off.

---

## 16. Database / Supabase Preview status

### Local runtime characterization

| Local production server condition | Observed result |
|---|---|
| Valid disposable `DATABASE_URL` | `/`, `/kana`, `/kanji`, `/kanji/灯`, `/mindtree`, encoded `/mindtree/明`, and `/api/kanji` route checks passed; Studio remains 404. |
| No `DATABASE_URL` | Server boots; source-backed `/mindtree` and `/mindtree/明` return 200; `/kanji` shell returns 200 but its `/api/kanji` data endpoint returns 500; root `/` and `/api/health` return 500 (`{"ok":false}` for health). |

Thus, source-backed MindTree pages can render without a database, but the `/kanji` M9A element-filter feature needs a configured database at runtime. Whole-site readiness cannot be inferred from static build success.

### Hosted configuration boundary

- The GitHub check-run list shows **Supabase Preview: success** for baseline `23546cf...`.
- This M9B session did not create a database, run a hosted migration, modify Supabase Preview, inspect a Supabase secret, or query a Supabase database.
- GitHub Actions secret metadata access was denied (HTTP 403), and Vercel environment metadata is unavailable through the permitted access path. Therefore required Vercel runtime variable presence, database reachability, schema compatibility, and actual Supabase Preview behavior for M9A are **unverified**.

---

## 17. Remaining blockers

1. **Delivery authorization:** explicit owner approval is required to push `arena/b8d97f5b-nihingobridgeupgrade` and create a PR.
2. **M9A deployment:** no remote branch/PR/deployment contains M9A/M9B commits.
3. **Live Vercel acceptance:** blocked until an authorized Preview deployment source SHA equals the pushed delivery head, then the 49 checks plus live-only viewport/security/accessibility checks are run.
4. **Production acceptance:** blocked until the merged main deployment source SHA equals the merge commit and a separate production browser run succeeds.
5. **Database configuration:** hosted `DATABASE_URL`/runtime prerequisites must be confirmed by an authorized deploy owner; whole-site behavior cannot be signed off from MindTree-only local routes.
6. **Full suite:** 80 corpus/environment failures remain unresolved. They require the pinned gitignored corpus/derived artifacts and a correct full canonical test environment, not fabricated data or a scope-expanding workaround.
7. **Potential sequencing issue:** if PR #22 merges before M9A, resolve the one `knowledgeService.ts` import-block conflict deliberately and rerun both affected validation sets.
8. **Manual accessibility:** screen-reader and real browser zoom acceptance remain unexecuted, particularly on the authorized deployment.

---

## 18. Exact GitHub delivery recommendation

**Recommended PR title**

```text
fix(kanji): align MindTree element badge with visible results
```

**Recommended branch / feature commits**

```text
arena/b8d97f5b-nihingobridgeupgrade
9b934ffecba574479b183e8ee3434fe71cbdb374  # recovered/audited M9A implementation
c15ead0ac1ded0e25261ed6d0650a1095e73276b  # M9B semantic heading correction
```

**Target:** `main` at `23546cf4966fbc6321c72af2ee1313c7c3af0b3a` at assessment time.

**Recommended owner-authorized sequence**

1. Confirm no new `main` commit and decide whether open PR #22 must land first.
2. If #22 lands first, perform the documented one-file import reconciliation locally, review it, and rerun typecheck, M9A tests, relevant Phase 26F tests, build, and browser acceptance.
3. Authorize and run exactly:
   ```bash
   git push origin arena/b8d97f5b-nihingobridgeupgrade
   ```
4. Create a reviewed PR from that branch to `main` using the title above. Do not merge directly.
5. Wait for GitHub CI and Vercel Preview. Verify the GitHub Deployment record has `environment=Preview` and `sha` equal to the pushed delivery head—not merely a green Vercel status.
6. Run the real Chromium harness against the Preview URL, plus the live-only 390px/1440px, manual zoom, screen-reader, runtime console/network, Studio/editorial, and whole-site database checks.
7. Obtain separate owner authorization to merge the reviewed PR.
8. After the Production deployment, verify its deployment SHA equals the merge commit and repeat the deployed-browser acceptance against the Production URL.

This report deliberately does **not** push, create a PR, merge, deploy, promote a deployment, modify environment variables, or modify a hosted database.

---

## 19. Owner acceptance checklist

- [ ] Accept the recovery provenance condition: original alleged `28bd280` is unavailable; reviewed equivalent persisted workspace content is `9b934ff...`.
- [ ] Confirm whether PR #22 should merge before this delivery.
- [ ] Authorize pushing `arena/b8d97f5b-nihingobridgeupgrade`.
- [ ] Authorize creating a PR targeting `main` with the recommended title.
- [ ] Review the 13-file M9A diff and the one-line M9B semantic heading correction.
- [ ] Require CI to pass on the pushed PR.
- [ ] Confirm Preview deployment source SHA exactly matches the delivery head.
- [ ] Authorize/enable the live Preview browser run, including access to the Vercel URL and intended Preview database configuration.
- [ ] Review live checks for 丁, 木, 日, 月, 川; all levels; resets; rapid switching; six learning stages; encoded routes; history; 375/390/768/1440 responsiveness; keyboard; manual zoom; and screen reader.
- [ ] Confirm Studio remains inaccessible; drafts/candidates remain hidden; no secrets appear in live browser output.
- [ ] Obtain a separate owner decision on the 80 full-suite corpus/environment failures; do not mask them.
- [ ] Authorize merge only after Preview acceptance passes.
- [ ] After production source-SHA verification and Production live acceptance, explicitly authorize whether M10 planning may proceed. Do not begin ingestion merely from this local gate.

---

## 20. Final working-tree status

At report preparation, the feature source history is clean and contains:

```text
c15ead0ac1ded0e25261ed6d0650a1095e73276b fix(a11y): use sequential heading level for kanji elements
9b934ffecba574479b183e8ee3434fe71cbdb374 Re-establish M9A element-filter fixes (original commit 28bd280 unavailable)
23546cf4966fbc6321c72af2ee1313c7c3af0b3a Merge pull request #23 ...
```

The only intended remaining worktree additions before committing this report are:

```text
reports/kanji-mindtree/M9B-GITHUB-INTEGRATION-VERCEL-AND-LIVE-BROWSER-GATE.md
reports/kanji-mindtree/M9B-BROWSER-ACCEPTANCE-LOG.json
```

After those evidence files are committed, the working tree should be clean. Nothing has been pushed, merged, deployed, promoted, or applied to a remote database during M9B.
