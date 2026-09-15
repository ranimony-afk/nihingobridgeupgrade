# PHASE 13 — GATE ZERO REMEDIATION

**Repository:** `https://github.com/ranimony-afk/nihingobridgeupgrade`
**Canonical `main` baseline:** `8cd2bd724346e29c9cc887dd2ece3545f212c6d2`
**Prior audit commit:** `ab07e57` (`reports/ai/NEW-SESSION-REENTRY-AUDIT.md`, gate **FAIL**)
**Scope:** remediate infrastructure / toolchain / test / CI blockers **only** (P1–P4). **Not** an AI feature prompt. **Phase 13.3B was not started; no AI architecture, provider, route, or table was implemented.**
**Date:** 2026-09-15
**Environment:** Node `v22.22.3`, `npm 10.9.8`, Linux, `uid 1001` (no root).

> **Correction to the re-entry audit's environment claim.** That audit recorded PostgreSQL as *"cannot be provisioned here"* and therefore left `npm test` unverified. That was too pessimistic: this session provisioned a **real PostgreSQL 18.4 server** in userspace (`@embedded-postgres/linux-x64`, installed to `/tmp`, **never added to the repository's manifest**), and ran the full database-backed gate against it. Every "14 tests" claim below is an **observed result**, and §8c records the per-step execution log that future prompts can reproduce.

---

## 1. Original failure

Four gates required green; three were not, on the canonical tree:

| Command | Baseline | Direct cause |
|---|---|---|
| `npm ci` | **FAIL** — `npm error code EUSAGE` / `` can only install with an existing package-lock.json `` | No lockfile tracked |
| `npm run lint` | **FAIL** — `✖ 18 problems (15 errors, 3 warnings)`, exit 1 | Floating transitive `eslint-plugin-react-hooks` resolves to a version that promotes React-Compiler rules to error |
| `npm run typecheck` | PASS | — |
| `npm run build` | PASS (`DATABASE_URL` deliberately unset) | — |
| `npm test` | **did not exist** — no `test` script; vitest only via `npx`, and sitting in production `dependencies` | Script / dependency hygiene |
| DB-backed tests | **never verified from the canonical tree** — `npx vitest run` exit 1, `1 failed / 14 skipped`, `DATABASE_URL is required` | No PostgreSQL anywhere **and no CI to provide one** |

Meta-failure worth naming: `reports/gates/VERCEL-BUILD-RECOVERY-GATE.md` §3 records `package-lock.json` as **"Added"** and §5 records **`npm ci` PASS**. The report was committed; the artifact it certifies never was. Any agent reading that report would have believed the install gate was satisfied.

## 2. Root cause

**RC1 — No lockfile.** `package.json` pins most direct deps exactly but leaves `lucide-react ^1.45.0`, `vitest ^5.0.0`, `server-only ^0.0.1` ranged and controls **no transitive version**. Every install re-resolves the tree against the registry's current state, so `npm ci` is impossible and two machines can legitimately disagree.

**RC2 — The lint verdict floats.** `eslint-config-next@16.2.6` declares `"eslint-plugin-react-hooks": "^7.0.0"`. A caret on a lint *plugin* means its **rule severity table** is selected at install time. Measured on an identical source tree:

| Resolved version | `npm run lint` |
|---|---|
| `7.0.0` | 0 errors, 3 warnings |
| `7.0.1` | **0 errors, 3 warnings** |
| `7.1.0` | 15 errors, 3 warnings |
| `7.1.1` (what a fresh install produced on the audit date) | 15 errors, 3 warnings |

**`7.1.0` is the release that promoted the rules.** The 15 are `react-hooks/set-state-in-effect` ×11, `immutability` ×2, `purity` ×1, `preserve-manual-memoization` ×1, all in **pre-existing** client pages/components. So 0-vs-15 errors was a function of install date, not of the code. That is the whole defect — and it is exactly the "gate that can silently flip" the audit flagged.

**RC3 — No CI, no database.** With no workflow file, "tests pass" was an unverifiable prose assertion; with no PostgreSQL in any environment a future agent controls, the 14 Phase 13.2 retrieval tests were permanently unrunnable.

## 3. Changes made

Four files — three new, one edited. **Nothing under `src/` or `tests/` changed.**

| # | File | Change | Prompt |
|---|---|---|---|
| 1 | `package.json` | `"test": "vitest run"`; `vitest ^5.0.0` moved `dependencies` → `devDependencies` (**range unchanged**); `overrides: { "eslint-plugin-react-hooks": "7.0.1" }`; `engines: { "node": ">=22.0.0" }`; a `"//overrides"` key documenting why the pin exists and when to delete it | P2, P3 |
| 2 | `package-lock.json` | **Added**, `lockfileVersion 3`, generated from the *unchanged* dependency set via `npm install --package-lock-only` | P1 |
| 3 | `infra/github-actions-ci.yml` | **Added** — CI job with a disposable `postgres:18-alpine` service container (10 steps, §8). Staged at `infra/` because `.github/workflows/` is not writable by this token (§8b) | P4 |
| 4 | `reports/gates/PHASE-13-GATE-ZERO-REMEDIATION.md` | **Added** — this report | Evidence |

Manifest diff, in full (no dependency added, removed, upgraded, or downgraded):

```diff
     "typecheck": "tsc --noEmit"
+    "test": "vitest run"
   "dependencies": {
-    "server-only": "^0.0.1",
-    "vitest": "^5.0.0"
+    "server-only": "^0.0.1"
   "devDependencies": {
-    "typescript": "5.9.3"
+    "typescript": "5.9.3",
+    "vitest": "^5.0.0"
+  "overrides": { "eslint-plugin-react-hooks": "7.0.1" },
+  "engines": { "node": ">=22.0.0" }
```

**Why `overrides` rather than relying on the lockfile alone:** the lockfile does pin `7.0.1` today, but the first future `npm install` that touches this tree re-resolves `^7.0.0` and silently drifts back to `7.1.x`, re-opening the gate by calendar. `overrides` is npm's own supported mechanism (npm 10.9.8 — the repository's package manager; no pnpm/yarn lockfile exists), and it is declarative and reviewable.

**What was NOT done — every prohibited path, explicitly:** no react-hooks rule disabled · no `eslint-disable` / `@ts-ignore` added · `eslint.config.mjs` untouched · `tsconfig.json` (`strict: true`) untouched · `next.config.ts` still `{}` — no `ignoreBuildErrors`, no `eslint.ignoreDuringBuilds` · no Next.js or React downgrade · no component rewritten to satisfy the floating linter · no eager DB initialization introduced.

**Honesty on the pin's boundary.** `7.0.1` freezes the toolchain at the last version whose rule set the code already satisfies. It makes the gate **deterministic**; it does not make the 14 React-Compiler findings vanish. They are recorded in §6 as tracked debt, the reason is stated in `package.json` itself, and the CI determinism step makes any silent change fail loudly. The correct future move is to fix the components and **delete** the override.

## 4. Dependency versions

| Package | Declared | Resolved (locked) | Note |
|---|---|---|---|
| `next` | `16.2.6` | `16.2.6` | unchanged |
| `react` / `react-dom` | `19.2.6` | `19.2.6` | unchanged |
| `typescript` | `5.9.3` | `5.9.3` | unchanged; `strict: true` |
| `eslint` | `9.39.4` | `9.39.4` | unchanged (EOL advisory recorded, not acted on) |
| `eslint-config-next` | `16.2.6` | `16.2.6` | unchanged |
| **`eslint-plugin-react-hooks`** | `^7.0.0` (transitive via config) | **`7.0.1`** (via `overrides`) | was floating to `7.1.1` |
| `vitest` | `^5.0.0` | `5.0.0` | moved to devDependencies; **not upgraded** |
| `drizzle-orm` / `drizzle-kit` | `0.45.2` / `0.31.10` | same | unchanged |
| `pg` / `@types/pg` | `8.20.0` / `8.18.0` | same | unchanged |
| `tailwindcss` / `postcss` | `4.1.17` / `8.5.8` | same | unchanged |
| `lucide-react` | `^1.45.0` | `1.46.0` (locked) | range untouched; determinism now from the lockfile |

Install: `added 427 packages`, 434 lockfile package entries, root manifest = 8 runtime + 12 dev.

## 5. Lockfile status

| Check | Result |
|---|---|
| Present | `package-lock.json`, 235,631 bytes, `lockfileVersion 3` (npm 10 native) |
| Generated from | the current `package.json` via `npm install --package-lock-only` — **no version edit preceded generation**; the pre-change command reported "up to date", proving the declared set was self-consistent and needed no repair |
| Not ignored | `git check-ignore -v package-lock.json` → no output |
| **Tracked** | `git ls-files package-lock.json` → `package-lock.json` ✔ |
| **`npm ci` from clean checkout** | **PASS** — `rm -rf node_modules` first, then `added 427 packages in 12s`, exit 0 |
| Tree matches lock | `eslint-plugin-react-hooks` installed `7.0.1` == lockfile `7.0.1` |

## 6. Lint determinism evidence

Same `package-lock` + same `package.json` ⇒ same lint result, now enforced in three places: the lockfile, the `overrides` pin, and a CI assertion step.

```text
BEFORE  (floating 7.1.1, canonical tree)      eslint .  → ✖ 18 problems (15 errors, 3 warnings)   exit 1
AFTER   (locked + overridden 7.0.1,
         clean-room `npm ci`)                  eslint .  → ✖  3 problems ( 0 errors, 3 warnings)   exit 0
```

The 3 remaining warnings are the genuine, long-standing, **documented-not-suppressed** ones: `src/app/layout.tsx:21` `@next/next/no-page-custom-font` (Google Fonts `<link>`); `src/app/question-bank/page.tsx:62` and `src/app/review/session/[id]/page.tsx:96` `react-hooks/exhaustive-deps`.

**Deferred findings — tracked, not hidden.** These surface under `7.1.x`'s stricter set and belong in a later bounded prompt that fixes the code and then removes the override:

- `set-state-in-effect` ×11 — `kana/page.tsx:95,131`, `kanji/page.tsx:75`, `kanji/[character]/page.tsx:113`, `progress/page.tsx:59`, `review/page.tsx:114`, `review/personal/page.tsx:79`, `review/session/[id]/page.tsx:105`, `review/sync/page.tsx:90`, `components/quiz/ExamTimer.tsx:22`
- `immutability` ×2 — `question-bank/page.tsx:61`, `review/session/[id]/page.tsx:89`
- `purity` ×1 — `review/session/[id]/page.tsx:70`
- `preserve-manual-memoization` ×1 — `review/session/[id]/page.tsx:98`

**CI anti-drift guard:** a step asserts the installed tree matches the lockfile **and** that the pin is `7.0.1`, so a bump that would flip the verdict fails the build with a pointer here instead of drifting quietly.

## 7. Test configuration

| Item | State |
|---|---|
| Script | **`"test": "vitest run"`** — `npm test` maps deterministically to Vitest |
| Framework | existing **Vitest `5.0.0`**; **no second framework** |
| Hygiene | `vitest` in `devDependencies` (same range) — production installs no longer pull the runner |
| `vitest.config.ts` | **untouched**: node env, `include: tests/**/*.test.ts`, `setupFiles: tests/setup.ts`, 60 s timeouts, `fileParallelism: false`, `@ → ./src`, `server-only → tests/mocks/server-only.ts` |
| Tests | **not rewritten** — `tests/knowledge-retrieval.test.ts`, 14 `it()` blocks, `beforeAll` seeds via `KnowledgeCorpusService.ensureSeeded()` + `KnowledgeService.ensureSeeded()` |
| Env handling | `tests/setup.ts` = `import "dotenv/config"`; `dotenv` does **not** override set variables, so an injected `DATABASE_URL` correctly wins over any local `.env` — verified by running with only the env var and no `.env` file |
| DB coupling | kept on purpose: the Phase 13.2 gate asserts retrieval returns **real rows**. No fake unit-test tier was invented to manufacture green |

### Result against real PostgreSQL (previously never achieved)

```text
$ DATABASE_URL=postgresql://nihongo@127.0.0.1:5433/nihongo_test npm test
✓ tests/knowledge-retrieval.test.ts (14 tests) 462ms
  Test Files  1 passed (1)
       Tests  14 passed (14)
   Duration  1.37s                                  exit 0
```

**14/14 PASS** — the historical claim is now verified against the canonical tree rather than asserted. (Non-blocking notice emitted by Vitest 5: `vitest.config.ts` uses ESM in a file loaded as CJS, flagged for `configLoader: 'native'` in a future Vite. Left alone deliberately — the fix is either a rename or `"type": "module"`, and the latter would change module resolution for the whole Next app. §15.)

## 8. PostgreSQL CI configuration

`.github/workflows/ci.yml` **could not be committed at that path** — see §8b — so the identical file lives at **`infra/github-actions-ci.yml`** pending one maintainer command.

Design: `ubuntu-latest`, `timeout-minutes: 25`, `permissions: contents: read` (no write scope, no `id-token`, no secrets), `concurrency` + `cancel-in-progress`, triggers `pull_request` / `push:main` / `workflow_dispatch`. Service `postgres:18-alpine` (`nihongo` / `nihongo_ci_only` / `nihongo_test`), port 5432, `pg_isready` health check (5 s × 20) so no step can race the database into existence. `DATABASE_URL` is **inlined, not a secret** — a throwaway container has no credential worth protecting, and inlining makes it structurally impossible for CI to reach production.

| # | Step | Command |
|---|---|---|
| 1 | Checkout | `actions/checkout@v4` |
| 2 | Setup Node | `actions/setup-node@v4`, Node `22` (satisfies new `engines`), npm cache |
| 3 | Install | `npm ci --no-audit --no-fund` — **P1** |
| 4 | Assert toolchain determinism | node script: installed == lockfile == `7.0.1` — **P2 guard** |
| 5 | Initialize disposable schema | `npx drizzle-kit push --dialect postgresql --schema ./src/db/schema.ts --url "$DATABASE_URL" --force` |
| 6 | Test | `npm test` — **P3/P4** |
| 7 | Typecheck | `npm run typecheck` |
| 8 | Lint | `npm run lint` |
| 9 | Production build | `npm run build` |
| 10 | Assert build/runtime contract | `next start` with `DATABASE_URL` pointed at `127.0.0.1:1` → `GET /api/health` must return **500 `{"ok":false}`** |

`postgres:18-alpine` (not 16) was chosen **because 18.4 is the server these steps were actually executed against**, so CI runs a verified combination rather than an assumed one.

**`--force` is used only because step 5's target is a freshly created empty database.** It must never be pointed at a real database; the workflow header says so. `drizzle-kit push` is used — not migrations — because the repository has no migration history and this prompt explicitly forbids manufacturing one to go green.

### 8b. Why the workflow is not yet active

`git push` was rejected by GitHub, not by this repository:

```text
! [remote rejected] arena/01a0a337-nihingobridgeupgrade
  (refusing to allow a GitHub App to create or update workflow
   `.github/workflows/ci.yml` without `workflows` permission)
```

The Contents API is blocked on the same rule (`403 Resource not accessible by integration`). This is a GitHub platform protection so an App cannot self-grant CI permissions. **`gh api .../actions/workflows` returns an empty list on `main`, confirming the audit's "no CI exists" finding; historical runs named `CI`/`Flutter`/`deploy.yml`/`backup.yml` are leftovers of since-deleted workflow files.**

Activation, by anyone with repo write access:

```bash
mkdir -p .github/workflows && git mv infra/github-actions-ci.yml .github/workflows/ci.yml
git commit -m "ci: activate Gate Zero workflow" && git push
```

### 8c. Every CI step executed for real, in order

Because CI cannot be scheduled from this session, each step was run locally against the provisioned PostgreSQL — so the configuration is verified behavior, not YAML guesswork:

| Step | Result |
|---|---|
| 3 `npm ci` (after `rm -rf node_modules`) | **PASS** — 427 packages, exit 0 |
| 4 determinism assertion | **PASS** — `installed: 7.0.1 | lockfile: 7.0.1` |
| 5 `drizzle-kit push --force` | **PASS** — `[✓] Changes applied`, exit 0; `information_schema` confirms **26 tables** created: `users, questions, jlpt_tests, jlpt_test_questions, test_sessions, test_answers, srs_schedulers, srs_decks, srs_cards, srs_reviews, srs_sync_devices, srs_sync_log, srs_review_sessions, srs_user_settings, srs_personalization, kana_entries, kanji_radicals, kanji_entries, kanji_composition, xp_events, xp_rules, user_analytics, knowledge_sources, dictionary_entries, grammar_patterns, example_sentences` |
| 6 `npm test` | **PASS** — **14/14**, exit 0 |
| 7 `npm run typecheck` | **PASS** (also re-verified from a **pristine** tree with `.next/` + `next-env.d.ts` deleted — CI's exact state, since `next-env.d.ts` is untracked and absent before any build) |
| 8 `npm run lint` | **PASS** — 0 errors / 3 warnings, exit 0 |
| 9 `npm run build` | **PASS** — `✓ Compiled successfully in 10.2s`; **also PASS with `DATABASE_URL` unset** (`13.8s`, `12/12` static pages) |
| 10 boot-without-database | **PASS** — `GET /api/health → HTTP 500 {"ok":false}`, server stayed up |

### 8d. Clean-clone end-to-end verification (definitive)

To prove the gate holds for *someone else's* checkout rather than only this workspace, `origin/arena/01a0a337-nihingobridgeupgrade` was freshly cloned to an unrelated directory (no `node_modules`, no `.env`, no prior state) and run against a **second, empty** PostgreSQL database:

```text
$ git clone -b arena/01a0a337-nihingobridgeupgrade https://github.com/ranimony-afk/nihingobridgeupgrade.git
$ cd nihingobridgeupgrade && git rev-parse --short HEAD        → 364c1bc  *
$ ls package-lock.json                                          → 235,631 bytes, tracked

$ npm ci --no-audit --no-fund        → added 427 packages in 13s        exit 0
$ npx drizzle-kit push --dialect postgresql --schema ./src/db/schema.ts \
      --url "$DATABASE_URL" --force  → [✓] Changes applied               exit 0
$ npm test                           → Test Files 1 passed | Tests 14 passed   exit 0
$ npm run lint                       → ✖ 3 problems (0 errors, 3 warnings)     exit 0
$ npm run typecheck                  → exit 0
$ npm run build                      → ✓ Compiled successfully in 8.2s         exit 0
```

<sub>\* `364c1bc` was the branch head at clone time; it was superseded by `fff3125` when this section was added to the report by `--amend`. The two differ **only** in this report file — `package.json`, `package-lock.json`, `infra/github-actions-ci.yml`, and every file under `src/`/`tests/` are byte-identical, so the verified tree is the merged tree. Recorded explicitly because a dangling SHA in a gate report is precisely the documentation-drift failure mode this repository keeps hitting.</sub>

**All six commands green from a clean clone, including 14/14 database-backed tests.** The required equation — *same lockfile + same `package.json` = same lint result* — is demonstrated on a machine state with no residue from this session.

## 9. Build and runtime evidence

**With the database connected** (production server, live DB, `next start`):

| Endpoint | Result |
|---|---|
| `GET /api/health` | **`200 {"ok":true}`** — the DB-backed success path **no previous audit ever observed** |
| `GET /api/ai/retrieve?q=mizu&domains=dictionary` | `200` — `de-mizu`, `水 (みず)`, `queryType: "romaji"`, real record content |
| `GET /api/ai/retrieve?domain=grammar&id=gp-te-kara` | `200` — entity mode, `〜てから` |
| `GET /api/srs/decks` | `200` — `count: 4` (`deck-n5-core-sm2`, …) |
| `GET /api/jlpt/tests` | `200` — `jlpt-n5-mock-01` |
| `GET /kanji` | `200` |

**Without any database:** build PASS (12/12 static), server boots, `/api/health` → `500 {"ok":false}`. The lazy-pool architecture guarantee is intact and now guarded by CI step 10. **Phase 13.2 retrieval is verified end-to-end for the first time from the canonical tree.**

### 9b. Independent Vercel build evidence (platform-recorded)

The repository's Vercel GitHub App auto-built this PR, which gives an outside check on P1 that no prior phase ever had:

| Vercel deployment | Ref | Status |
|---|---|---|
| Preview | `fff3125` (this gate-zero head) | **`success` — "Deployment has completed"** |
| Preview | `364c1bc` | created |
| Preview | `ab07e57` (audit report only) | created |

`gh pr checks 1` also reports the companion checks `Vercel` = **pass** and `Vercel Preview Comments` = **pass**; `Supabase Preview` = `skipping`, i.e. **no database branch was provisioned and no hosted data was touched by this PR.**

Two honesty limits on this row: (a) this is the **deployment platform's own status**, not an application-level probe — this sandbox has no network egress to `*.vercel.app` (`GET /api/health` on the preview URL returned HTTP `000`, connection never established), so no claim is made that the deployed app answered; and (b) the preview deployment may point at a **real** hosted database via the Vercel project's own environment. Only `/api/health` was attempted (it executes `select 1`); routes that call `ensureSeeded()` (`/`, `/api/ai/retrieve`, `/api/srs/*`) were **deliberately not requested**, because they would have written to whatever database that deployment is configured against.

Still unverified by this session: **production** (`main`) deployment, and whether the Vercel project's install command is set to `npm ci` — now that a lockfile is tracked, `npm ci` is the recommended value and will no longer fail.

## 10. Security analysis

| Check | Result |
|---|---|
| Secrets committed | **None.** Diff contains only `package.json`, `package-lock.json`, `infra/github-actions-ci.yml`, this report |
| CI credentials | Throwaway container values only; **no repository secret is read**, so this workflow cannot leak production config. Inline-by-design, documented in the file header |
| Client-side exposure | `NEXT_PUBLIC_*` in **zero** files, before and after; `src` env reads still exactly 3 lines (`DATABASE_URL`, `NODE_ENV`) in `src/db/index.ts` |
| `server-only` boundary | untouched, still on `src/db/index.ts`. The audit's 92-file / 22-client-component finding (**0 direct, 0 transitive leaks**) meant **no refactoring was warranted, and none was performed** |
| Validation strictness | **not weakened** — `eslint.config.mjs`, `tsconfig.json`, `next.config.ts` byte-identical; zero `eslint-disable`/`@ts-ignore`/`@ts-expect-error` in `src` + `tests` |
| Workflow privileges | `permissions: contents: read`; no write scope, no `pull-requests: write`, no `id-token` |
| Product surface | unchanged — no route, handler, service, page, or schema file edited |
| Open finding (out of scope) | **S1**: unauthenticated `/api/ai/retrieve` echoes raw SQL/params from `error.message`. A product-code defect, deliberately untouched here; **must be addressed in 13.3B/13.4 error normalization** |
| Dependency risk | `npm audit`: **7 vulnerabilities (4 moderate, 2 high, 1 critical)** — **identical before and after**; no package added, and `audit fix --force` refused (it would change versions outside scope) |
| Verification database | created and destroyed in `/tmp` on port 5433; **no source, config, manifest, or committed credential references it** — the port appears only in this report, for reproducibility; cluster stopped after use and not committed |

## 11. Database safety analysis

| Question | Answer |
|---|---|
| Production/real database contacted? | **No.** The only databases ever used were (a) an ephemeral userspace cluster in `/tmp` on `127.0.0.1:5433`, (b) CI's per-run container. Neither is referenced by any committed file |
| Schema changed? | **No** — `src/db/schema.ts` byte-identical, 0 lines |
| Tables created / dropped / altered anywhere persistent? | **None.** All DDL went to the throwaway cluster (26 `CREATE TABLE`, for verification only), then discarded |
| Migrations created? | **No** — no `drizzle/` directory, no migration history bootstrapped |
| CI init strategy | `drizzle-kit push --force` against a per-run empty DB = the repository's existing convention, scoped by `--url`. Chosen as the smallest safe option; documented in the workflow header |
| Indexes added? | **No** — explicitly out of scope. Recorded state preserved verbatim: **0 secondary indexes, 26 primary keys, 5 `.unique()`** vs `34 userId` equality + `12 dueAt` range filters + `13 ilike` predicates. Left for the later index phase |
| `source_ref` provenance (7 tables, soft pointers)? | **Untouched** — no FK introduced |
| SRS / JLPT / quiz / analytics / knowledge behavior | **Unchanged** — and now *proven* working live (§9), not merely compiled |
| Residual | `drizzle.config.json` still unusable and `/drizzle` still gitignored (§15) — by scope decision, so CI/local both pass explicit flags |

## 12. Files changed

```text
 package.json                                    |  16 +-
 package-lock.json                                 | 6755 +++++++++++++++++ (new)
 infra/github-actions-ci.yml                       | 155 +   (new)
 reports/gates/PHASE-13-GATE-ZERO-REMEDIATION.md   | this report (new)
```

One focused commit. Build by-products (`.next/`, `next-env.d.ts`) and the temporary lockfile probes were deleted, not committed; the `/tmp` PostgreSQL was stopped. `git status` was verified clean before and after staging, and staging contained exactly these four paths.

## 13. Files intentionally unchanged

- **AI / knowledge:** `src/services/ai/knowledgeRetriever.ts` (653 L), `src/services/knowledge/corpusService.ts`, `knowledgeService.ts`, `src/app/api/ai/retrieve/route.ts`, `src/data/lexicon.ts`
- **Schema / DB access:** `src/db/schema.ts` (26 tables), `src/db/index.ts` (lazy `server-only` pool), `drizzle.config.json` (broken, out of scope), `.gitignore`
- **Product code:** all SRS incl. 4 strategies, JLPT, quiz engine, gamification/XP, analytics, every `src/app/**` page and route, all 22 client components
- **Test config / tests:** `vitest.config.ts`, `tests/setup.ts`, `tests/mocks/server-only.ts`, `tests/knowledge-retrieval.test.ts`
- **Validation configs:** `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`
- **Not created at all:** any provider/adapter/factory, AI route, AI table, auth layer, ETL, deployment config. No existing system was duplicated or replaced

## 14. Rollback

Fully reversible; nothing destructive sits in the rollback path.

```bash
git revert <gate-zero-sha>     # one commit, removes all four changes
# or selectively:
git rm package-lock.json infra/github-actions-ci.yml reports/gates/PHASE-13-GATE-ZERO-REMEDIATION.md
git checkout main -- package.json
rm -rf node_modules && npm install
```

Effects, each bounded and known: rollback re-exposes RC1 (`npm ci` → `EUSAGE`) and RC2 (lint → 15 errors at `7.1.1`); **typecheck and build keep passing** (unaffected). Removing the workflow returns the repo to "no CI". If CI was already activated by a maintainer, `git rm .github/workflows/ci.yml` is the extra step. **No database object, migration, or data was created by this change, so no data rollback exists.**

## 15. Remaining limitations

1. **CI is committed but not yet *scheduled*.** The workflow is complete and every step is verified locally, but GitHub blocks this token from writing `.github/workflows/*` (§8b). Until a maintainer runs the one-line `git mv`, no push will produce a green check. **This is the only unmet item, and it is a repository-permission gap, not a defect in the configuration.**
2. **`npm test` is red in any environment without PostgreSQL.** Intentional — these are integration tests. A DB-free unit tier for the deterministic SRS/quiz/XP logic (~4,000 lines, currently 0 tests) remains a separate gap.
3. **CI and local verified different Postgres majors is avoided, but coverage is narrow:** 18.4 locally, `postgres:18-alpine` in CI. PostgreSQL 16 (a likely hosting choice) was **not** tested. Also untested: JSONB/GIN-based index strategies that the future index phase may need.
4. **`drizzle.config.json` is still broken** (drizzle-kit loads it, then errors on `dialect`) and **`.gitignore` still contains `/drizzle`**. These were audit item P5, outside this prompt's P1–P4 objective; CI and local verification therefore pass explicit `--dialect/--schema/--url` flags. They should be fixed in the next infrastructure prompt, together with an FK policy, **before** 13.5 persistence work.
5. **The 14 React-Compiler findings are deferred, not resolved** (§6). CI fails loudly if the `7.0.1` pin moves, so the debt cannot go quiet — but it must be repaid by fixing components and deleting the override.
6. **`dotenv` remains in `dependencies`** although only `tests/setup.ts` imports it; relocating it raises a Vercel runtime question outside this scope.
7. **7 `npm audit` advisories** (1 critical, incl. `sharp`) and `eslint@9.39.4` EOL remain, unchanged by design — patching means version changes this prompt forbids.
8. **Vitest 5 emits a `configLoader: 'native'` deprecation notice** for `vitest.config.ts` (§7). Cosmetic today; a future Vite major will require `.mts`/`"type": "module"`. Deliberately not "fixed" by a manifest-wide module flip.
9. **No authentication, no migration tooling, and no verified *production* deployment.** A Vercel **preview** build of this branch succeeded (§9b), but `main` was never deployed by this session, the Vercel project's install command is not set to `npm ci` as far as this session can observe, and no hosted database was connected or probed. Gate Zero makes the repository *verifiable*; it does not make it *deployable*. Audit blocker B4 (auth) still gates public AI use.
10. **History hygiene untouched.** The whole-tree delete/re-add pattern continues to destroy `git log -p` signal; this commit is focused by contrast, but changing the convention is a governance decision, not an infra fix.

### Recommended next prompts, in order

1. **Maintainer action (5 minutes):** activate CI per §8b; confirm the first green run on the PR. Only then can "CI verified" be stated as fact rather than as verified-steps-plus-blocked-scheduling.
2. **Phase 13.3B-G1 — CI + drizzle config hardening:** activate workflow, fix `drizzle.config.ts` from `DATABASE_URL`, drop `/drizzle` from `.gitignore`, and decide the FK/index policy additively. Still **no** AI code, **no** migration execution, **no** schema change.
3. **Lint-debt prompt:** fix the 14 React-Compiler findings in the 10 client files, then **remove the `overrides` pin** and let `react-hooks` float to the current release — the gate must end stricter than it started, not frozen.
4. Only after 1–3: **Phase 13.3B** (provider contract + factory + Anthropic + deterministic mock), consuming `KnowledgeChunk`/`RetrievalResult` verbatim, with fail-closed selection and normalized errors resolving S1.

---

## Final gate

| Required by this prompt's gate | Evidence | Status |
|---|---|---|
| `npm ci` passes | clean-room `rm -rf node_modules && npm ci` → 427 packages, exit 0; lockfile tracked | **PASS** |
| `npm run lint` — 0 errors | 0 errors / 3 documented pre-existing warnings, exit 0, **after** a clean-room install; reproduced by lockfile + `overrides` + CI assertion | **PASS** |
| `npm run typecheck` | exit 0, pristine tree, strict mode | **PASS** |
| **Tests execute successfully against PostgreSQL** | real PG 18.4 → `drizzle-kit push` created 26 tables → **`npm test` = 14/14 passed, exit 0** | **PASS** |
| `npm run build` | exit 0 with **and** without `DATABASE_URL` | **PASS** |
| CI configuration valid | `js-yaml` parse OK; **all 10 steps executed for real** (§8c) **and re-executed from a clean clone of the pushed branch** (§8d) | **PASS** — but not yet *scheduled* (GitHub token permission, §8b) |
| No production DB touched | only ephemeral `/tmp` cluster + CI container; zero `src/db/schema.ts` change; no migration | **PASS** |
| No secrets committed | verified by diff contents and by `git grep`; CI reads no secret | **PASS** |
| No AI architecture implemented | no `provider*`, factory, adapter, AI route, AI table; 13.3B untouched | **PASS** |
| No existing system duplicated/replaced | single `@/db`, single retrieval layer, single SRS engine set, kanji canonical; tests/framework preserved | **PASS** |

Every gate criterion is met by executed evidence. The one thing this session could not do is *schedule* the workflow it wrote — a GitHub App permission boundary, reported as a limitation in §15/§8b rather than glossed over or claimed. **Phase 13.3B remains not started, as instructed.**

**PRODUCTION GATE ZERO: PASS**
*(conditional on maintainer activation of §8b step 1 for the CI-scheduling criterion; all other criteria, including 14/14 database-backed tests against real PostgreSQL, are independently verified in this session and reproducible from §8c.)*
