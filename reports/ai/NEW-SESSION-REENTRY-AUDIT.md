# NEW-SESSION RE-ENTRY AUDIT — NihongoBridge

**Canonical production repository:** `https://github.com/ranimony-afk/nihingobridgeupgrade`
**Audited branch:** `arena/01a0a337-nihingobridgeupgrade`
**Audited revision:** `8cd2bd724346e29c9cc887dd2ece3545f212c6d2` (`audit b 13.2`) — **this is also `origin/main` HEAD**, i.e. the audited tree *is* canonical production state.
**Audit date:** 2026-09-15
**Audit mode:** read-only with respect to source. No application code, schema, dependency manifest, or configuration was modified. Verification toolchain was executed live (install, lint, typecheck, build, production-server runtime). No migrations were run, no deployment was performed, nothing was pushed.

---

## 0. Executive verdict

The repository is a **real, coherent, compiling Next.js 16 application** with a genuine Phase 13.2 retrieval layer. It is **not** yet a reproducible build, and the stored gate reports are **materially stale in the unsafe direction**: they certify gates (`npm ci` PASS, `lint` PASS) that fail on the canonical tree today.

| Gate | Report claim | **Verified at HEAD in this session** |
|---|---|---|
| `npm ci` (documented Vercel install command) | PASS (`VERCEL-BUILD-RECOVERY-GATE` §5) | **FAIL** — `EUSAGE`, no lockfile is tracked |
| `npm run lint` | PASS — 0 errors, 3 warnings | **FAIL** — **15 errors**, 3 warnings |
| `npm run typecheck` | PASS | **PASS** (exit 0, strict mode) |
| `npm run build` | PASS | **PASS** — including with `DATABASE_URL` deliberately unset |
| `npx vitest run` (14 tests) | PASS 14/14 | **NOT VERIFIABLE HERE** — 14 skipped, suite fails without live PostgreSQL; sandbox has no DB and no root to install one |
| Runtime `/api/health` | `{ "ok": true }` | **`500 {"ok":false}`** — correct graceful degradation, but no database exists in this environment |

Two of the three "PASS" claims could not be reproduced, and one is structurally impossible to reproduce from a clean clone. **Both failures are one root cause plus one toolchain-drift cause — neither indicates broken application logic.** Details in §6 and §8.

---

## 1. Repository state

### 1.1 Tree inventory

- **111 tracked files.** Source layout: `src/app` (pages + `src/app/api/**/route.ts`), `src/components`, `src/data`, `src/db`, `src/services`, `src/types`, plus `tests/`, `reports/`.
- **39 API route handlers**, **15 page routes**, **26 Drizzle tables** (`src/db/schema.ts`, 729 lines).
- The prompt's assumed paths `src/api/` and `src/lib/` (incl. `src/lib/queries.ts`) **do not exist and never have** — routes live under `src/app/api/`. Confirmed again here; do not chase them.
- `etl/` and `nihongobridge-integration-masterplan/` are **absent**. No ETL pipeline exists in this repository.
- `README`, `LICENSE`, `vercel.json`, `.nvmrc`, and **any CI workflow are all absent**. There is no automated gate runner; every "gate" so far was an agent's local execution.
- **No lockfile of any kind is tracked** (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`).
- `.gitignore` **now exists** (added at HEAD) and covers `node_modules`, `.next`, and all `.env*` variants.

### 1.2 Git history shape (a governance problem, not a code problem)

History is a sequence of whole-tree delete/re-add snapshots with opaque subjects:

```text
8cd2bd7 audit b 13.2          <- HEAD == origin/main
cf179f0 del A 13.1.1A
c1be76c A 13.1.1A
08abae1 DEL a13.3a
7c66bec a13.3a
7c00365 del 13.2
5c1cb62 13.2
6878d26 del
e4fd323 b 12.1
```

The sandbox clone arrived shallow/grafted at one commit; after `git fetch --deepen=20` the history above was recovered and used for the diffs below. Consequences: no reviewable per-change diffs, and **documentation and code can silently diverge — which is exactly what has happened (§3)**. Recommended: stop whole-tree delete/re-add commits; use focused commits so `git diff` remains a real audit instrument.

**Net diff `7c66bec` (13.3A-audited) → HEAD:**

```text
A  .gitignore                         A  reports/ai/REENTRY-AUDIT.md
M  package.json                       A  reports/gates/VERCEL-BUILD-RECOVERY-GATE.md
M  reports/ai/PHASE-13.3A-...md       M  src/db/index.ts
A  tests/mocks/server-only.ts         M  vitest.config.ts
```

No Phase 13.2 retrieval source, no schema, and no route was touched since `5c1cb62`. Verified: `git diff 5c1cb62 HEAD -- src/services tests/knowledge-retrieval.test.ts src/db/schema.ts` is empty.

### 1.3 Toolchain facts

| Item | State |
|---|---|
| Next.js | `16.2.6` (exact) |
| React / ReactDOM | `19.2.6` (exact) |
| TypeScript | `5.9.3`, `"strict": true`, `@/* → ./src/*`, `moduleResolution: bundler`, `next` plugin |
| `next.config.ts` | `{}` — **verified: no `ignoreBuildErrors`, no `eslint.ignoreDuringBuilds`, no weakening anywhere** |
| ESLint | `9.39.4` + `eslint-config-next/core-web-vitals` flat config; `globalIgnores` limited to build output. No rule disables, no `eslint-disable` comments in `src` |
| Drizzle | `drizzle-orm 0.45.2` + `pg 8.20.0`; `drizzle-kit 0.31.10` (dev) |
| `server-only` | `^0.0.1` **present and used** (`src/db/index.ts:1`) |
| Vitest | `^5.0.0` — **misplaced in `dependencies`, not `devDependencies`**; no `test` script in `package.json` |
| `drizzle.config.json` | **Active and broken.** `npx drizzle-kit check` loads it as the default config and dies: `Please provide required params for AWS Data API driver: [x] database: undefined`. It also hardcodes a local DSN. Prior reports claimed drizzle-kit "does not load JSON configs" — the reality is worse: it loads it and misinterprets `dialect` as a driver hint |
| `npm audit` | 7 vulnerabilities (4 moderate, 2 high, 1 critical), incl. `sharp` path. Unpatched; recorded, not silenced |

Node in the verification sandbox: `v22.22.3` / `npm 10.9.8`. **No Node version is pinned in the repository** (`.nvmrc` absent, no `engines`).

---

## 2. Actual architecture (verified from source, not from reports)

```text
Client page/component ("use client" × 22)
  └─ browser fetch() → /api/** route handlers  (39)
       └─ src/services/** (domain services: srs, quiz, jlpt, gamification, knowledge, ai)
            └─ src/db/index.ts  ← `import "server-only"` + lazy pg.Pool + drizzle
                 └─ PostgreSQL (26 tables, schema-only, push-managed)
```

**Verified boundary hygiene (this is a genuine strength):**

- **Zero** client-marked components import `@/db`, `@/services`, `server-only`, or any provider SDK. All 22 `"use client"` files scanned.
- `@/db` has 33 import sites; all are route handlers, `force-dynamic` server pages, or server services.
- `NEXT_PUBLIC_*` appears **nowhere** in `src`, `package.json`, or `.env.example`. The only `process.env` reads in the entire source tree are the three `DATABASE_URL`/`NODE_ENV` lines in `src/db/index.ts`. **No secret is reachable from a client bundle.**
- Data-bearing routes/pages consistently carry `export const dynamic = "force-dynamic"`; dynamic segments use Next 15/16 `params: Promise<…>` typing.

**Canonical domain systems (all present, all must be preserved):** SRS (`srsService`, `sessionService`, `syncService`, `dailyQueueService`, `personalizationService`, and four strategies: SM-2, Leitner box, FSRS-lite, fixed ladder), JLPT test service + question bank + quiz engine, XP/gamification registry + rules, kana/kanji knowledge services, analytics surfaces, and the Phase 13.2 knowledge corpus + retriever.

---

## 3. Documentation vs. reality — divergences found

Source code wins. Every row below is a claim in a committed report that is **false for the current canonical tree**.

| # | Claim (report) | Reality at HEAD | Severity |
|---|---|---|---|
| D1 | `package-lock.json` **added** — "makes `npm ci` deterministic and passing" (`VERCEL-BUILD-RECOVERY-GATE` §3 row 1, §5) | **Not tracked.** `npm ci` fails `EUSAGE`. The report file was committed; the artifact it certifies was not | **High** |
| D2 | `npm ci — PASS`, `npx vitest run 14/14 PASS`, lint 0 errors (both 13.3A §8 and recovery gate §5) | All three were run in an ephemeral agent workspace whose generated lockfile was never committed. Not reproducible from a clean clone | **High** |
| D3 | `npm run lint` PASS — 0 errors, 3 warnings | **15 errors** from floated `eslint-plugin-react-hooks@7.1.1` (`^7.0.0` range). See §6.2 — the *same files* pass at 0 errors/3 warnings under 7.0.0 | **High** |
| D4 | `server-only` is "absent from `package.json`" (13.3A §3.5) | Present since HEAD (`^0.0.1`), imported by `src/db/index.ts`, with a vitest alias shim | Low (stale, now superseded) |
| D5 | `src/db/index.ts` "throws at module scope when `DATABASE_URL` is unset" → build fails without env (REENTRY §3, §9.1) | **Already fixed** at HEAD: lazy proxy pool. Build verified green with `DATABASE_URL` unset | Low (report predates fix) |
| D6 | `.gitignore` absent; secret-hygiene risk (REENTRY §9.4, §10 R8) | Present at HEAD | Low (resolved) |
| D7 | "`npx drizzle-kit push`" is the schema workflow; JSON config "inert" | Config is loaded and **errors out**; only explicit CLI flags work; no migration history exists | **Medium** — see §7 |
| D8 | Gate "PASS" statuses generally | **No CI exists.** Every gate is an unverifiable local assertion. There is no artifact (log, hash, commit link) to re-validate | **Medium** |

**Interpretation:** the application is in better shape than D1–D3 suggest (the code compiles, types cleanly, and builds), but the *evidence chain* is not trustworthy. Restoring trust in gates is therefore a first-class deliverable, not bookkeeping.

---

## 4. AI provider status

Searched across `src`, `tests`, `package.json`, `next.config.ts`, `.env.example`:

| Term | Production-source hits |
|---|---|
| `getProvider`, `LLMProvider`, `AnthropicClient`, `generateText`, `generateStructured`, `streamText`, `streamTutorCompletion`, `openai` | **0** |
| `AIProvider` | 1 — a **comment** in `knowledgeRetriever.ts:8` describing the future port |
| `anthropic`, `ANTHROPIC_API_KEY`, `AI_PROVIDER`, `AI_PROMPT_VERSION`, `AI_REQUEST_TIMEOUT_MS` | **0 in source** — only in `.env.example` |
| `server-only` | 4 in `src/db/index.ts` (+ `package.json`, test shim) |

**Conclusions:**

1. **No provider contract exists.** `src/services/ai/provider.ts`, `providerFactory.ts`, and `src/services/ai/providers/` are **absent**. Phase 13.3B is confirmed **NOT STARTED** — correctly so; this audit implemented none of it.
2. **No vendor SDK is installed** (`ai`, `@anthropic-ai/sdk`, `openai` all absent). No route imports a transport. The vendor-neutrality target is currently satisfied *vacuously* — there is nothing to violate it — which means 13.3B starts on a clean slate with **no duplicate abstraction to remove**.
3. **`AI_PROVIDER` is read by no code.** The env keys are documentation of an unimplemented contract.
4. **`.env.example` sets `AI_PROVIDER=mock` as the shown default.** Local-dev-appropriate, but it is now a live design constraint for 13.3B: the factory **must not** derive mock from absence/defaults — a missing or unrecognized `AI_PROVIDER` must fail closed, and `AI_PROVIDER=mock` must be rejected outright when `NODE_ENV === "production"`, or rule 12/13 is violated the moment the first adapter lands.
5. **Retrieval is the grounding substrate and it is real.** Verified exports of `src/services/ai/knowledgeRetriever.ts` (653 lines): `KNOWLEDGE_DOMAINS` = `dictionary|kanji|grammar|sentence`, `KnowledgeRetriever.retrieve` (script classification → per-domain parallel search → deterministic dedupe/rank → JLPT filter), `retrieveEntity` (linked-record traversal), `formatContext` (citation-tagged `[domain:id | source=ref]` blocks + `estimatedTokens`).
6. **The grounding contract already matches the mandated shape.** `KnowledgeChunk` carries exactly: `domain`, `id`, `title`, `content`, `relevance`, `matchedOn`, `record` (untouched source row), `sourceRef`, `jlptLevel`; `RetrievalResult` adds `sources: ProvenanceRecord[]`, `contextText`, `domainCounts`, `queryType`. **13.3B/13.4 must consume this type and must not define a parallel context shape.**
7. **`GET /api/ai/retrieve`** exposes search mode (`q`, `domains`, `level`, `limit` clamped 1–50) and entity mode (`domain`+`id`); it seeds first, returns structured `{success,error:{code,message}}`, and calls no model. It stays retrieval-only and must not be converted into a generation route.

**Gap:** retrieval results are consumed by **nothing** — no client component and no server caller uses `KnowledgeRetriever` except its own route and tests. The grounding path is therefore unexercised end-to-end until 13.4.

---

## 5. Authentication status

- **No authentication of any kind.** No `middleware.ts`; no next-auth/Clerk/Lucia/JWT/bcrypt/argon dependency; no session cookie handling; zero login/logout surfaces.
- Identity is **client-supplied and unvalidated**: 54 `userId` references across `src/app/api`, defaulting to `"anonymous-user"` (`?userId=` or request-body field), e.g. `src/app/api/srs/decks/route.ts:8`, `src/app/api/quiz/analytics/route.ts:15`, `src/app/api/knowledge/srs/route.ts:50`.
- Every read **and write** surface — SRS mutations, XP grants, `POST /api/quiz/seed`, sync push — is unauthenticated. A public deployment today exposes writable data APIs to anyone (§9 B4).
- Per instruction, **no authentication was invented in this prompt**. Recorded as a hard prerequisite for public AI use: any AI generation/quota route added in 13.4/13.5 must sit behind the canonical auth layer once it exists, and **must never** trust a client-supplied `userId` as identity.

---

## 6. Build status

### 6.1 Results (executed live in this session)

| Command | Result | Evidence |
|---|---|---|
| `npm ci` | **FAIL** | `npm error code EUSAGE … can only install with an existing package-lock.json`. Reproduced at HEAD before any local mutation |
| `npm install --no-audit --no-fund` | **PASS** | 424 packages, exit 0 (deprecations: `eslint@9.39.4` EOL, two `@esbuild-kit/*`) |
| `npm ci` *after generating a lockfile locally* | **PASS** | 432 packages, exit 0 → **D1's fix is confirmed to be a single committed file** |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** | exit 0, strict mode, zero errors |
| `npm run lint` (`eslint .`) | **FAIL** | 15 errors / 3 warnings (§6.2) |
| `npm run build` (`next build`) | **PASS** | exit 0 **with `DATABASE_URL` unset** — 39 API handlers + 15 pages compile; lazy-pool fix verified working |
| `npx vitest run` | **FAIL (environment)** | `1 failed / 14 skipped`, `DATABASE_URL is required` at `src/db/index.ts:55`. Not a code defect: no PostgreSQL and no root in this sandbox (§8.3) |

### 6.2 Lint failure root cause — toolchain drift, not code decay

`eslint-config-next@16.2.6` declares `"eslint-plugin-react-hooks": "^7.0.0"`. With no committed lockfile, that caret floats to **7.1.1**, which promotes React-Compiler correctness rules to **error**. Reproduced both states in this session:

| Installed `eslint-plugin-react-hooks` | `npm run lint` |
|---|---|
| `7.1.1` (fresh float) | **FAIL — 15 errors, 3 warnings** |
| `7.0.0` (`npm i --no-save`) | **PASS — 0 errors, 3 warnings**, identical to the gate's historical evidence |

Breakdown of the 15: `set-state-in-effect` ×11, `immutability` ×2, `purity` ×1, `preserve-manual-memoization` ×1 — all in **pre-existing client pages/components** (`kana`, `kanji`, `kanji/[character]`, `progress`, `question-bank`, `review`, `review/personal`, `review/session/[id]`, `review/sync`, `components/quiz/ExamTimer`). **None is Phase 13.x code, and none is a functional defect.** The 3 warnings are the long-standing `exhaustive-deps` ×2 and `@next/next/no-page-custom-font` ×1.

**Why this matters beyond cosmetics:** the lint gate's pass/fail is currently decided by *the date you run it*. A gate that changes state without a code change is not a gate. **Fix by determinism (pin the validated baseline via a committed lockfile), not by disabling rules** — rules 16/17 forbid muting `react-hooks/*` or touching ESLint config to force green.

### 6.3 Reproducibility of dependency ranges

`package.json` mixes exact pins (`next`, `react`, `drizzle-orm`, `pg`, most dev deps) with carets (`lucide-react ^1.45.0`, `vitest ^5.0.0`, `eslint-config-next` is pinned but its *plugins* float). Without a lockfile, `lucide-react` alone drifted 1.45→1.46 in this session. `package-lock.json` is the one mechanism that freezes all of it.

---

## 7. Database status

- **26 tables** in `src/db/schema.ts`: `users`, `questions`, `jlpt_tests`, `jlpt_test_questions`, `test_sessions`, `test_answers`, `srs_schedulers`, `srs_decks`, `srs_cards`, `srs_reviews`, `srs_sync_devices`, `srs_sync_log`, `srs_review_sessions`, `srs_user_settings`, `srs_personalization`, `kana_entries`, `kanji_radicals`, `kanji_entries`, `kanji_composition`, `xp_events`, `xp_rules`, `user_analytics`, + the four additive Phase 13.2 tables `knowledge_sources`, `dictionary_entries`, `grammar_patterns`, `example_sentences`.
- **Schema integrity findings that directly constrain Phase 13.5 (measured, not assumed):**
  - **`relations()` count = 0. `.references(` (FK) count = 0.** There is **no database-enforced referential integrity anywhere** in the canonical schema. All joins are application-level on `text` ids. Consequences: no `ON DELETE CASCADE` semantics to inherit, no DB-level orphan protection for future `ai_conversations`/`ai_messages`, and "reuse the existing `users` table" (DATABASE RULE step 2, "inspect all foreign keys") resolves to *"there are none — the FK discipline must be established deliberately, additively, in one approved prompt."*
  - Conventions to follow if AI tables are later approved: `text` primary keys (app-generated, e.g. `gp-te-kara`, `first-party:dictionary-core:v1`), snake_case columns with explicit camelCase mapping, `timestamp("created_at").defaultNow().notNull()` (+ `updated_at` where mutable), `jsonb` with `.default([]).notNull().$type<T[]>()`, `sourceRef`/`jlptLevel` denormalized onto rows.
  - `users.id` is a plain `text` PK with `name notNull` and nullable `email` — **no password/credential/identity-provider columns exist**, so it is an identity *registry*, not an auth table. Phase 13.5 may reference it; it must not be repurposed or extended casually.
- **No migrations. No `drizzle/` directory. Schema is applied by out-of-band `drizzle-kit push`.** Environments converge only by manual ritual (drift risk R2).
- **NEW HAZARD — ignored migration path:** `.gitignore` contains **`/drizzle`**. If anyone later runs `drizzle-kit generate` (the correct, reviewable, additive workflow rule 18/21 implies), the generated SQL migration folder is **gitignored by default and will not be committed** — silently defeating "every migration must be inspected before execution". Must be resolved in the same bounded prompt that first introduces migrations.
- **`drizzle.config.json` is actively misleading** (§1.3): it fails `drizzle-kit check`, and its hardcoded `postgresql://postgres:postgres@127.0.0.1:5432/app_db` is a local DSN committed to a production repo. Recommend replacing with a `drizzle.config.ts` reading `process.env.DATABASE_URL` (no secret value in-repo) in the repository-repair prompt.
- Seeding is **write-on-first-request** (`ensureSeeded()` inside `GET /api/ai/retrieve` and other routes). Runtime DB identity therefore needs DDL/insert privileges — a real deployment consideration, and an unauthenticated write trigger (R6).
- **Zero kanji duplication confirmed:** retrieval reads the pre-existing canonical `kanji_entries`; no second kanji store exists.

---

## 8. Test status

| Fact | Evidence |
|---|---|
| Exactly **one** test file: `tests/knowledge-retrieval.test.ts`, **14 `it()` blocks** | grep-verified; matches the 13.2 gate claim |
| Coverage is retrieval/provenance/entity/JLPT-filter/blank-query only | test names enumerated at HEAD |
| **No unit tests exist for SRS strategies, quiz engine, JLPT scoring, XP, or sync** despite ~4,000 lines of service logic | test inventory |
| Tests require **live PostgreSQL** — they seed and assert real rows | `tests/setup.ts` (`dotenv/config`), `vitest.config.ts` 60s timeouts, `fileParallelism: false` |
| **`package.json` has no `test` script** | scripts = `dev, build, start, lint, typecheck` |
| No CI to run any of it | no workflow files |
| Executed here: `Test Files 1 failed / Tests 14 skipped`, cause `DATABASE_URL is required` | live run; environment limitation |
| `server-only` boundary handled correctly for tests via `resolve.alias` → `tests/mocks/server-only.ts` no-op; the guard stays fully active in Next build/runtime | `vitest.config.ts` + shim file |

**Honest status: Phase 13.2's 14 tests are *plausibly* green against a real database — but they were NOT executed in this session, and they cannot be, so this audit does not certify them.** Any future claim of "14/14 PASS" must come with a reproducible path (CI, or a documented DB bootstrap). `vitest` sitting in `dependencies` also means the test framework installs into the production artifact.

---

## 9. Runtime verification (production server, executed here)

`npm run build` → `npm run start` (`next start`, Next 16.2.6, ready in 133 ms, bound `0.0.0.0:3000`). No PostgreSQL and no root in this sandbox, so all data surfaces are expected to fail; what was verified is the **failure contract**.

| Surface | Result | Assessment |
|---|---|---|
| `GET /api/health` | `500 {"ok":false}` | **Correct** — try/catch around `select 1`, no stack leak |
| `GET /kanji` (static client page shell) | `200` | OK — prerendered shell |
| `GET /` (server page, queries DB) | `500` Next error page | Expected without DB |
| `GET /api/ai/retrieve?q=mizu&domains=dictionary` | `500 {"success":false,"error":{"code":"INTERNAL_ERROR","message":"Failed query: select cast(count(*) as int) from \"kana_entries\"…"}}` | **Contract OK, content NOT OK — see B3** |
| `GET /api/ai/retrieve` (no params) | `500` with same raw SQL leak | Same |
| `GET /api/srs/decks` | `500` leaking full `insert … on conflict do update` statement **and bound parameter values** | Same |
| `GET /api/jlpt/tests` | `500` leaking the `select` column list | Same |

### FINDING B3 — internal SQL disclosure on the AI surface

`src/app/api/ai/retrieve/route.ts` catch block returns `message: error instanceof Error ? error.message : …`. Drizzle's `DrizzleQueryError.message` **embeds the complete SQL text and, in some paths, bound parameter values**. The route is unauthenticated. So today: an unauthenticated caller can make `GET /api/ai/retrieve` echo schema/table/column internals. The same pass-through pattern recurs across the other API routes (e.g. `/api/srs/decks` leaked seed parameters, including config JSON).

This is pre-existing, **not a Phase 13.2 logic bug**, and deliberately left unfixed by this audit. It is a **blocking design requirement for 13.3B/13.4**: the provider layer must normalize errors into stable public codes (`PROVIDER_UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED`, `CONFIGURATION_ERROR`) with opaque public messages and server-side-only detail logging. If 13.3B copies the existing route error idiom, it will institutionalize the leak into the AI generation path — where it would also risk echoing provider request internals.

---

## 10. Deployment status

**Nothing is deployed and no deployment is claimed.** No `vercel.json`, no CI, no release artifacts.

Verified deployment requirements for Vercel:

1. **BLOCKER — install command.** `npm ci` (this prompt's stated install step) fails on a clean clone until `package-lock.json` is committed. Vercel's silent fallback to `npm install` would "succeed" while floating transitive deps — reproducing exactly the §6.2 lint-drift failure inside the build pipeline.
2. **`DATABASE_URL` at build time: NO LONGER REQUIRED** (verified: build green with it unset). Still **required at runtime** for every data surface, failing loudly at first query — correct fail-closed behavior, unchanged.
3. **BLOCKER — database.** No hosted Postgres is provisioned or referenced; the 26-table schema must be applied out-of-band, and because seeding happens on first request, the runtime role needs INSERT/DDL privileges.
4. **Secrets: verified clean.** No `NEXT_PUBLIC_*` anywhere, no `.env` tracked (only `.env.example`), no key material in git history for the audited range, and only `DATABASE_URL`/`NODE_ENV` read in source. No credential exposure exists in the client bundle path, and `server-only` now makes a future client import a build error.
5. **MEDIUM — no authentication** on a public URL (§5, B4).
6. **LOW — hygiene:** `vitest` in `dependencies` inflates the production install; no `engines`/`.nvmrc`; `next.config.ts` has no `serverExternalPackages` pin for `pg` (fine on the Node runtime today); `layout.tsx` keeps a runtime `fonts.googleapis.com` `<link>` (external dependency + the existing lint warning).

---

## 11. Blockers (each needs its own bounded prompt)

| # | Blocker | Why it blocks | Minimal resolution |
|---|---|---|---|
| **B1** | No committed `package-lock.json` | `npm ci` fails; every gate (install→lint→typecheck→build→test→deploy) is non-deterministic; this is the *sole root cause* of B2 | Commit a lockfile generated from the existing `package.json` **with no dependency changes**. Verified here: `npm ci` → PASS. Rollback: `git rm package-lock.json` |
| **B2** | `npm run lint` fails with 15 errors | Gate rule "lint passes" cannot be honestly satisfied; drift makes the gate date-dependent | Resolve **by determinism, never by rule-disabling**: after B1, either the pinned baseline reproduces 0 errors/3 warnings (confirmed here at 7.0.0), or the 11 `set-state-in-effect` + 2 `immutability` + 1 `purity` + 1 memo findings are fixed as real code changes in a separate bounded prompt |
| **B3** | Unauthenticated routes echo raw SQL/params | Information disclosure on the AI surface; will be inherited by 13.4 generation routes if not answered now | Provider layer must define normalized error mapping; route handlers must emit stable codes + opaque messages. Additive; no schema change |
| **B4** | No authentication at all | Public writable APIs; 13.5 quotas/retention and 13.7 tutor UI have no secure subject | Explicitly deferred (per instructions). **Mandatory before public AI production use**; must be the canonical auth architecture, never a second one |
| **B5** | No test script, no CI, tests need live PostgreSQL | "Tests pass" is unverifiable and unenforceable | Add `"test": "vitest run"`, separate the vitest dependency to devDependencies, add a CI workflow (typecheck+lint+build+tests with a Postgres service) |
| **B6** | `drizzle.config.json` errors out; `/drizzle` gitignored; zero migrations, zero FKs | Blocks safe Phase 13.5 persistence; a future `drizzle-kit generate` would silently drop migrations from version control | Replace with `drizzle.config.ts` reading `process.env.DATABASE_URL`; remove the `/drizzle` ignore entry **before** any migration is introduced; decide FK policy additively |

---

## 12. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Agents keep trusting "gate PASS" text in `reports/` instead of re-running gates. D1–D3 prove reports drift from the tree | **High** | This audit re-executes gates live. Keep doing so; every future gate report must embed commit hash + exact commands + output |
| R2 | No committed lockfile ⇒ transitive floats silently re-gate the build (proven in §6.2) | **High** | B1 |
| R3 | No migrations + inert/misleading drizzle config + `/drizzle` ignored ⇒ environments converge only by manual `push` ritual; AI tables added ad hoc | **High** | B6 before 13.5 |
| R4 | Public deployment without auth exposes writable SRS/XP/seed and the retrieval endpoint | **High** | B4; keep AI routes non-public until auth lands |
| R5 | Zero FKs/`relations()` means future `ai_conversations`/`ai_messages` inherit no integrity or deletion semantics; naive `userId` FKs would be cosmetic | **Med-High** | Design in 13.5 with an explicit, additive FK/cascade decision; do not assume DB enforcement exists |
| R6 | Whole-tree delete/re-add commits destroy review signal; code and docs can diverge again undetected | **Medium** | Focused commits; regenerate gate evidence per commit |
| R7 | 13.3B implemented against a shape only described in prose (13.3A §6) — the only existing contract | **Medium** | 13.3B must consume `KnowledgeChunk`/`RetrievalResult` verbatim (§4.6) and add no parallel context type |
| R8 | `AI_PROVIDER=mock` default in `.env.example` tempts implicit mock selection | **Medium** | Factory must fail closed on missing/unknown values and reject `mock` in production (§4.4) |
| R9 | Retrieval is exercised by no consumer; grounding quality unmeasured end-to-end | **Medium** | Add an evaluation harness in 13.6 before any UI |
| R10 | Test suite is DB-coupled and unrunnable offline; pure-logic SRS/quiz/XP code has no unit coverage despite being deterministic | **Medium** | B5; add pure unit tests for strategies/engine — no DB needed |
| R11 | Unbounded `ilike` scans on an unauthenticated retrieval route | **Low-Med** | Clamp limits (already 1–50), add auth + rate limiting in 13.6 |
| R12 | `npm audit` 7 findings (1 critical, incl. `sharp`); `eslint@9.39.4` EOL | **Low-Med** | Separate bounded dependency-refresh prompt; never `--force` blind |

---

## 13. Phase ledger (verified against HEAD `8cd2bd7`)

| Phase | Status | Basis |
|---|---|---|
| ≤ 12.1 platform baseline (quiz, JLPT simulator, SRS + sync + personalization + 4 strategies, XP/gamification, kana/kanji knowledge, analytics) | **COMPLETE** | Full service/route/page tree present and compiling |
| 13.1 AI architecture audit | **COMPLETE (docs-only, by design)** | Report present; decisions: Repository A is sole AI owner; one provider port; Anthropic first adapter; retrieval stays model-free |
| 13.2 Knowledge retrieval | **COMPLETE — genuinely implemented** | `KnowledgeRetriever` (653 L), `corpusService` (190 L), `knowledgeService` (838 L), `lexicon.ts` (366 L), 4 additive tables, `GET /api/ai/retrieve`, 14 tests. Byte-identical to impl commit `5c1cb62`; **must be preserved** |
| 13.3A Provider boundary audit | **COMPLETE (audit-only)** — but **parts now stale** (D3, D4) | 341-line report; approved creation set remains valid |
| Repository repair (`package-lock.json`, `.gitignore`, `server-only`, lazy DB pool) | **PARTIAL — REPORTED AS DONE, NOT ACTUALLY LANDED** | `.gitignore`, `server-only`, lazy pool **are** at HEAD; **`package-lock.json` is not** (B1) |
| **13.3B** provider contract + factory + Anthropic + mock | **NOT STARTED** — *correct; not implemented by this audit* | No `provider.ts`, `providerFactory.ts`, `providers/`; no provider SDK; `AI_PROVIDER` unread |
| 13.4–13.8 (grounded app service, persistence, rate limiting/eval, UI, Vercel hardening) | **NOT STARTED** | No AI routes/tables/UI; nothing deployed |
| 14–22 (admin/CMS, multilingual, dashboard, Flutter, analytics, monetization, security, perf, release) | **NOT STARTED** | No `etl/`, no admin surface, no i18n layer, no mobile app |

**Stale branding (cosmetic):** the home page still advertises "Phase 10 — JLPT & Question Engine Ready" / "Phase 10 Production Target", and `reports/gates/PHASE-13-CHECKLIST.md` still reads `Current prompt: 13.2 … Last updated: 2026-02-24`. Actual position: **13.3A complete, 13.3B pending, blocked behind gate-zero repair.**

---

## 14. Recommended next bounded prompt

**Do NOT implement Phase 13.3B next.** Its own acceptance criteria (`npm ci`, lint, vitest, deployability) are currently unsatisfiable or non-reproducible, so 13.3B would land on a failing gate — violating rules 24/25 ("stop immediately if a gate fails").

> ### Phase 13.3B-G0 — Repository Reproducibility Repair (gate zero; documentation, dependencies-of-record and scripts only)
>
> Make the canonical tree deterministically verifiable. **Allowed changes, and nothing else:**
> 1. Generate `package-lock.json` **from the current `package.json` only** (`npm install --package-lock-only`), with **zero** dependency additions, removals, or version-range edits — then prove the §6.2 baseline (0 errors / 3 warnings) is reproduced; if `7.1.1` is what the pinned manifest yields instead, do **not** pin around it — report that lint legitimately fails and stop for a separate bounded lint-repair prompt. **Never** disable a rule, edit `eslint.config.mjs`, add `eslint-disable` comments, or touch `next.config.ts` to force green.
> 2. Add `"test": "vitest run"` to `package.json`; move `vitest` from `dependencies` to `devDependencies`. No other manifest edits.
> 3. Replace the broken `drizzle.config.json` with a `drizzle.config.ts` reading `process.env.DATABASE_URL` (hardcode **no** DSN/credential), and remove the `/drizzle` entry from `.gitignore`. **Create no tables, run no push/generate/migration — configuration and ignore rules only.**
> 4. Add a CI workflow (`.github/workflows/ci.yml`) running install → lint → typecheck → build → vitest against a PostgreSQL service container, so gates become machine-enforced instead of prose.
> 5. Record evidence in `reports/gates/PHASE-13.3B-G0-REPRODUCIBILITY-GATE.md`: commit hash, every command, every exit code, the before/after lint table, and the explicit statement of which gates remain unverifiable without a hosted database.
>
> **Forbidden in this prompt:** any AI code (`provider.ts`, `providerFactory.ts`, adapters), any route change, any schema change, any authentication, any migration, any dependency introduction, and any edit to `knowledgeRetriever.ts` / `corpusService.ts` / `knowledgeService.ts` / `/api/ai/retrieve` / `tests/knowledge-retrieval.test.ts`.
>
> **Gate:** `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build` all green from a clean clone, and `npm test` runnable (green where a database is reachable; explicitly reported as environment-blocked where it is not). Only after this gate PASSES may Phase 13.3B (contract + factory + Anthropic + deterministic mock, per 13.3A §6, consuming `KnowledgeChunk`/`RetrievalResult` verbatim and implementing fail-closed provider selection with normalized errors per §4.4 and B3) begin.

---

*Audit ends here. No application source, configuration, schema, dependency manifest, or database was modified. `npm install`, `npm ci`, lint, typecheck, build, vitest and a `next start` production server were executed locally for evidence only; nothing was committed beyond this report and nothing was pushed to `main`.*
