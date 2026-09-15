# PHASE 13.3A — NEW SESSION RE-ENTRY AUDIT

**Repository:** `https://github.com/ranimony-afk/nihingobridgeupgrade`
**Audit date:** 2026-09-15
**Audit mode:** READ-ONLY. No production source, configuration, schema, database, or dependency manifest was modified. No migration created. No deployment performed. No new dependency installed.
**Method note:** every command in §J/§K was **actually executed** in this session against the checked-out tree. Where a command could not reach a pass/fail verdict on the code, the environmental reason is stated explicitly rather than reported as passing.
**Governing rule applied:** source code wins over `reports/`. Where a committed report contradicts the tree, the tree is authoritative and the contradiction is recorded in §N.

---

## A. Repository identity

| Item | Value |
|---|---|
| Canonical remote | `https://github.com/ranimony-afk/nihingobridgeupgrade` (fetch + push configured) |
| Working branch | `arena/01a0a337-nihingobridgeupgrade` |
| Branch base | `8cd2bd724346e29c9cc887dd2ece3545f212c6d2` — **currently `origin/main`** |
| Package name | `nextjs-postgresql-template` (starter identity never renamed; cosmetic) |
| Framework | Next.js `16.2.6` (App Router), React `19.2.6`, TypeScript `5.9.3` strict |
| Data layer | PostgreSQL via `pg 8.20.0` + `drizzle-orm 0.45.2`; `drizzle-kit 0.31.10` (dev) |
| Styling | Tailwind CSS `4.1.17` via `@tailwindcss/postcss` |
| Tests | `vitest ^5.0.0` (declared in **`dependencies`**, not `devDependencies`) |
| Tracked files | 111 (+1 report added by this audit) |
| Source files | 92 under `src/` — 39 API route handlers, 15 pages, 26 tables, 22 client components |
| Deploy target | Vercel (documented in prompts; **no `vercel.json`, no CI, no `.nvmrc`, no README, no LICENSE** in repo) |

Layout — note the paths assumed by the task brief that **do not exist**:

```text
src/app/**            pages + src/app/api/**/route.ts   (API routes live HERE)
src/components/**     client UI
src/data/**           kana.ts, kanji.ts, lexicon.ts (first-party corpus)
src/db/**             index.ts (server-only client), schema.ts (26 tables)
src/services/**       ai/, knowledge/, srs/, quiz/, jlpt/, gamification/
src/types/**          srs.ts, quiz.ts, jlpt.ts, gamification.ts
tests/                knowledge-retrieval.test.ts, setup.ts, mocks/server-only.ts
reports/ai/, reports/gates/

src/lib/        ABSENT (never existed at any revision — incl. src/lib/queries.ts)
src/api/        ABSENT (routes are under src/app/api)
etl/            ABSENT (no ETL pipeline exists in this repository)
```

---

## B. Current commit

```text
9f10e5f1d066aa7dcb0c50285a36a5bad58218f2  (this audit's report, on arena/... branch only)
8cd2bd724346e29c9cc887dd2ece3545f212c6d2  "audit b 13.2"   <- origin/main, canonical HEAD
cf179f0 del A 13.1.1A
c1be76c A 13.1.1A
08abae1 DEL a13.3a
7c66bec a13.3a
7c00365 del 13.2
5c1cb62 13.2
6878d26 del
e4fd323 b 12.1
```

**Uncommitted changes:** none — `git status --porcelain` empty before and after all verification runs (build artifacts and the temporary lockfile were removed; `git ls-files` confirms no `.next/` or `node_modules/` tracked).

**Production-source delta of the audit branch vs canonical `main`:**

```text
reports/ai/NEW-SESSION-REENTRY-AUDIT.md | 332 +++  → 1 file changed, documentation only
```

**History-shape finding (governance, not code):** history is a chain of whole-tree delete/re-add snapshots (`del`, `DEL`, `A`, `B` subjects). There are no per-change diffs, so `git log -p` cannot be used as an audit instrument, and documentation can drift from code without detection — which has happened (§N). The sandbox clone arrived grafted/shallow at one commit; full history above was recovered with `git fetch --deepen=20`.

---

## C. Architecture map

```text
Browser
  └─ 22 "use client" components/pages  ──browser fetch()──►  /api/**  (39 route handlers)
                                                               │
                                                               ├─ src/services/** (domain logic)
                                                               │    srs/     srsService, sessionService, syncService,
                                                               │             dailyQueueService, personalizationService,
                                                               │             scheduler + strategies/{sm2, leitnerBox,
                                                               │             fsrsLite, fixedLadder, shared}
                                                               │    quiz/     engine, seedData
                                                               │    jlpt/     testService
                                                               │    gamification/  xpService, xpRegistry, rules
                                                               │    knowledge/ knowledgeService (kana/kanji), corpusService
                                                               │    ai/       knowledgeRetriever  ← Phase 13.2
                                                               │
                                                               └─ src/db/index.ts   `import "server-only"`
                                                                    lazy pg.Pool (Proxy) + drizzle client
                                                                    errors only on FIRST query, never at import
                                                                        │
                                                                    PostgreSQL — 26 tables
```

Server-rendered pages (`src/app/**/page.tsx`) import `@/db`/`@/services` directly; 15 pages total, data-bearing ones carry `export const dynamic = "force-dynamic"`.

**Intended AI architecture vs reality:**

```text
Application → AI Application Service → Canonical Provider Interface → Factory → Adapter
   [pages]      [NOT IMPLEMENTED]          [NOT IMPLEMENTED]         [NOT IMPL]  [NOT IMPL]
                                  ↘ KnowledgeRetriever → Postgres   [IMPLEMENTED, Phase 13.2]
```

No layer below `KnowledgeRetriever` exists yet. Nothing in the tree violates the vendor-neutrality rule, because no vendor coupling exists to violate — 13.3B starts on a clean slate with **no duplicate abstraction to remove**.

---

## D. Completed phases (verified against code, not against reports)

| Phase | Verdict | Evidence |
|---|---|---|
| ≤ 12.1 platform baseline — quiz engine, JLPT simulator, SRS (+sync, personalization, 4 strategies), XP/gamification, kana/kanji knowledge, analytics | **COMPLETE** | Full service + route + page tree present; compiles and typechecks clean |
| 13.1 AI architecture audit | **COMPLETE** (documentation-only by design) | `PHASE-13.1-AI-ARCHITECTURE-AUDIT.md`; decisions: Repository A is sole AI owner; exactly one provider port with adapters behind it; Anthropic first adapter; retrieval stays model-free |
| **13.2 Knowledge retrieval** | **COMPLETE — genuinely implemented** | `knowledgeRetriever.ts` (653 L), `corpusService.ts` (190 L), `knowledgeService.ts` (838 L), `lexicon.ts` (366 L), 4 additive tables, `GET /api/ai/retrieve`, 14 tests. Verified byte-identical to implementation commit `5c1cb62` (`git diff 5c1cb62 HEAD -- src/services tests/knowledge-retrieval.test.ts src/db/schema.ts` = empty). **Must be preserved** |
| 13.3A provider boundary audit | **COMPLETE as an audit**, but **partially stale** | 341-line report; its §3.5 and §8 claims no longer match the tree (§N D3/D4) |
| "Repository repair" (lockfile, `.gitignore`, `server-only`, lazy DB pool) | **PARTIAL — reported as done, not all landed** | `.gitignore` ✔ present · `server-only` ✔ installed+used ✔ · lazy DB pool ✔ implemented ✔ · **`package-lock.json` ✘ never committed** |

---

## E. Pending phases

| Phase | Status | Note |
|---|---|---|
| **13.3B** canonical provider contract + explicit factory + server-only boundary | **NOT STARTED — and BLOCKED behind §P gate zero** | No `provider.ts`, `providerFactory.ts`, `providers/`; `AI_PROVIDER` read by no code |
| 13.3C deterministic mock provider | NOT STARTED | — |
| 13.3D Anthropic adapter | NOT STARTED | No SDK, no HTTP transport, no vendor import anywhere |
| 13.4 grounded AI service (tutor, correction, vocab/kanji/grammar explanation) | NOT STARTED | No generation route exists |
| 13.5 AI persistence (conversations, messages, usage, quotas, retention) | NOT STARTED | Blocked by §I findings (no FKs, no indexes, no migration path) |
| 13.6 rate limiting, prompt-injection defense, evaluation, failure testing | NOT STARTED | No eval harness; retrieval is consumed by nothing |
| 13.7 AI tutor UI / Hana-sensei modes | NOT STARTED | No AI UI; no consumer of `/api/ai/retrieve` |
| 13.8 Vercel production hardening + deployment | NOT STARTED | Nothing deployed; install command currently broken |
| 14–22 (Admin/CMS, multilingual, learner dashboard, Flutter, analytics, monetization, security, performance, release) | NOT STARTED | No admin surface, no i18n layer, no mobile app, no ETL |
| **Authentication** | **NOT STARTED** — cross-cutting prerequisite | See §H |

Stale phase branding: home page still advertises "Phase 10 — JLPT & Question Engine Ready"; `reports/gates/PHASE-13-CHECKLIST.md` header still reads `Current prompt: 13.2 … Last updated: 2026-02-24`. Actual position: **13.3A complete / 13.3B pending behind gate zero.**

---

## F. AI architecture status

All mandated search terms, run over the **tracked** tree (`git grep -i`, paths: `src tests package.json next.config.ts eslint.config.mjs tsconfig.json drizzle.config.json .env.example`):

| Term | Hits | Nature of hits |
|---|---|---|
| `AIProvider` | 1 | **Comment** — `knowledgeRetriever.ts:8`, "→ (later) single AIProvider port" |
| `provider` | 7 | **All comments**: `api/ai/retrieve/route.ts:31` "No AI provider", `schema.ts:651` "No AI provider logic lives in these tables", `knowledgeRetriever.ts:11` "NO AI provider is called", `corpusService.ts:8` "no AI provider is called from here" |
| `anthropic` | 4 | `.env.example` only (`ANTHROPIC_API_KEY=`, `ANTHROPIC_MODEL`, `ANTHROPIC_API_URL`) |
| `server-only` | 7 | Real usage: `src/db/index.ts:1` import + docs; `package.json` dep; `tests/mocks/server-only.ts`; `vitest.config.ts` alias |
| `LLMProvider`, `getProvider`, **`providerFactory`**, `openai`, `generateText`, `generateStructured`, `streamText`, `streamTutorCompletion` | **0** | Absent |

**Determinations:**

1. **No provider contract, no factory, no adapter, no mock provider exists.** Phase 13.3B/13.3C/13.3D are all genuinely unstarted.
2. **No AI/vendor dependency installed**: `ai`, `@ai-sdk/anthropic`, `@anthropic-ai/sdk`, `openai` all absent from the full dependency set (verified against installed `node_modules`, not just `package.json`).
3. **No route imports a transport.** The only AI-adjacent endpoint is deterministic retrieval.
4. `AI_PROVIDER`, `AI_PROMPT_VERSION`, `AI_REQUEST_TIMEOUT_MS` are **declared in `.env.example` but read nowhere in code** — a documented, unimplemented contract.
5. **Constraint for 13.3B (new hazard):** `.env.example` shows `AI_PROVIDER=mock` as the illustrated default. Acceptable locally, but the factory must **not** infer mock from an absent value: missing/unknown values must fail closed, and `mock` must be rejected outright when `NODE_ENV === "production"`, or rules 11–13 are violated the moment the first adapter lands.
6. **The grounding contract already exists and must be consumed verbatim** (rule: no duplicate architecture). `KnowledgeChunk` = `domain, id, title, content, relevance, matchedOn, record` (untouched DB row), `sourceRef`, `jlptLevel`; `RetrievalResult` adds `sources: ProvenanceRecord[]`, `contextText`, `domainCounts`, `queryType`, `estimatedTokens`. This satisfies the mandated field list (domain / entity ID / title / content / source reference / provenance / JLPT level / relevance / matched fields) **already**. 13.3B/13.4 must not define a parallel context type.
7. `formatContext()` emits `[domain:id | source=ref]` citation-tagged blocks headed `KNOWLEDGE CONTEXT (cite these records; do not invent facts)` — the anti-hallucination instruction seam is already in place.

---

## G. Knowledge retrieval status — COMPLETE (Phase 13.2), unmodified, must be preserved

**`src/services/ai/knowledgeRetriever.ts`** (653 lines, class with static API):
- `KNOWLEDGE_DOMAINS = ["dictionary","kanji","grammar","sentence"]`.
- `KnowledgeRetriever.retrieve(query, {domains, maxPerDomain=5, maxTotal=12, jlptLevel})` → query-script classification (`japanese | romaji | english | empty`) → four parallel per-domain searches → deterministic dedupe/rank → JLPT filter.
- `KnowledgeRetriever.retrieveEntity(domain, id)` → entity plus linked records (grammar→sentences, dictionary→sentences+kanji).
- `formatContext(chunks)` → citation-tagged prompt text + `estimateTokens`.
- 13 `ilike(...)` predicates across headword/reading/romaji/character/meaning/title — **model-free, credential-free, deterministic** by design.

**`src/services/knowledge/corpusService.ts`** (190 lines) — `ProvenanceRecord {version, license, …}`; `ensureSources()`, `ensureSeeded()`, `getProvenance(sourceRefs[])`, `getDictionaryEntry()`, `getGrammarPattern(idOrSlug)`, `getSentence()`, `getStats()`. Provenance registration is decoupled from record seeding (idempotent).

**Knowledge tables** — `knowledge_sources` (`id, name, version, license, url, description, domain, recordCount, importedAt`) + `dictionary_entries`, `grammar_patterns`, `example_sentences`. Kanji reuses the pre-existing canonical `kanji_entries` — **no second kanji store** (confirmed).

**Provenance is broader than the four tables:** `source_ref` exists on **7 tables** — `srs_cards` (nullable), `kana_entries`, `kanji_radicals`, `kanji_entries`, and the three content tables (`notNull`). Every knowledge row points at `knowledge_sources.id` — **as a soft convention with no database-enforced FK** (see §I).

**Retrieval API:** `GET /api/ai/retrieve` — search mode (`q`, `domains`, `level`, `limit` clamped to 1–50) and entity mode (`domain`+`id`); seeds first (`KnowledgeCorpusService.ensureSeeded()` + `KnowledgeService.ensureSeeded()`); `force-dynamic`; structured `{success, error:{code,message}}`.

**Gap:** retrieval has **no consumer**. No client component and no server service calls `KnowledgeRetriever` except its own route and the tests — the grounding path is unexercised end-to-end until 13.4.

**Runtime reachability could not be confirmed in this environment** (no PostgreSQL): `GET /api/ai/retrieve?q=mizu` returns `500` — expected fail-closed behavior, but note §M/S1 for what the message contains.

---

## H. Authentication status — NONE

- No `middleware.ts` (neither root nor `src/`). No auth library of any kind in the dependency set (no next-auth, Clerk, Lucia, jose/jsonwebtoken, bcrypt, argon2). No session/cookie handling. No login/logout/signup route or page.
- Identity is **client-supplied and unvalidated**: 34 `eq(<table>.userId)` filter sites plus 54 `userId` references across `src/app/api`; handlers default to `"anonymous-user"` from `?userId=` or the request body (e.g. `api/srs/decks/route.ts:8`, `api/quiz/analytics/route.ts:15`, `api/knowledge/srs/route.ts:50,78,105`).
- **All 39 routes — reads and writes — are unauthenticated**, including mutating surfaces (`POST /api/quiz/seed`, SRS review/undo, sync push, XP grant).
- `users` table exists but is an identity **registry**, not an auth table: `id text PK, name notNull, email nullable, avatarUrl, targetJlptLevel default 'N5', targetDate, createdAt, updatedAt` — **no credential, provider-id, or hash columns**. It is wired to no login flow.
- Per instruction, **no authentication was designed or invented in this audit.** Recorded as a hard prerequisite: public AI production use requires canonical auth first, and 13.4/13.5 AI routes must resolve identity server-side — never from a client `userId`.

---

## I. Database status

`src/db/schema.ts` — 729 lines, **26 tables**, single source of truth, `pgTable` only.

`users`, `questions`, `jlpt_tests`, `jlpt_test_questions`, `test_sessions`, `test_answers`, `srs_schedulers`, `srs_decks`, `srs_cards`, `srs_reviews`, `srs_sync_devices`, `srs_sync_log`, `srs_review_sessions`, `srs_user_settings`, `srs_personalization`, `kana_entries`, `kanji_radicals`, `kanji_entries`, `kanji_composition`, `xp_events`, `xp_rules`, `user_analytics`, `knowledge_sources`, `dictionary_entries`, `grammar_patterns`, `example_sentences`.

**Measured integrity/persistence characteristics (all four matter to 13.5):**

| Property | Measured | Consequence |
|---|---|---|
| `relations()` declarations | **0** | No Drizzle relation metadata; every join hand-written |
| `.references(` / FK constraints | **0** | **No database-enforced referential integrity anywhere.** The DATABASE RULE step "inspect all foreign keys" resolves to: *there are none* — FK discipline must be established deliberately and additively, not assumed |
| `index()` / `uniqueIndex()` declarations | **0** | **No secondary indexes at all.** Only 26 primary keys + 5 `.unique()` (`srs_sync_devices.client_id`, `kanji_radicals.character`, `kanji_entries.character`, `xp_events.dedupe_key`, `grammar_patterns.slug`) |
| Hot-path filters under those missing indexes | 34 `eq(t.userId)` + 12 `lte/gte(cardsTable.dueAt)` across the 8 SRS/gamification/jlpt services | Every per-learner queue, review, analytics and XP query is an **unindexed sequential scan**. Correct today at tiny scale; the first thing that breaks at real data volume |
| Retrieval predicates | 13 `ilike(...)` with no trigram/GIN support available | `LIKE '%…%'` full scans on an unauthenticated route (bounded by corpus size, not by query cost) |
| Timestamps | `timestamp(…).defaultNow().notNull()`, snake_case columns, `updatedAt` on mutable tables | Consistent conventions worth following for any future AI table |
| Keys | app-generated `text` PKs (`gp-te-kara`, `first-party:dictionary-core:v1`) | No sequences/UUIDs; AI tables would follow the same convention |
| Migrations | **None.** No `drizzle/` directory, no migration history; schema applied out-of-band by `drizzle-kit push` | Environments converge only by manual ritual |
| `drizzle.config.json` | **Loads and errors.** `npx drizzle-kit check` → `Reading config file '…/drizzle.config.json'` then `Please provide required params for AWS Data API driver: [x] database: undefined` | The committed config is unusable; only explicit CLI flags work. It also hardcodes a local DSN (`postgres:postgres@127.0.0.1:5432/app_db`) into a production repo. Prior report's claim that drizzle-kit "does not load JSON configs" is wrong — it loads and misinterprets it |
| **`.gitignore` contains `/drizzle`** | verified at HEAD | **If anyone later runs `drizzle-kit generate`, the generated SQL migrations are gitignored by default and silently never committed** — defeating "every migration must be inspected before execution" by construction. Must be fixed before 13.5 |
| Data access mode | `ensureSeeded()` on first request inside GET handlers | Runtime DB role needs INSERT/DDL privileges; an unauthenticated GET triggers writes |

`src/db/index.ts` verified as sound: `import "server-only"` first line; `DATABASE_URL` read lazily; pool created on first query; `DATABASE_URL is required` thrown at first real access (not at import); dev-global caching + production singleton retained; **no behavior weakened, no silent default DSN**.

---

## J. Build status — executed live in this session

| Command | Result | Exact evidence |
|---|---|---|
| `npm ci` *(the documented Vercel install command)* | **FAIL** | `npm error code EUSAGE` / `` The `npm ci` command can only install with an existing package-lock.json `` — no lockfile is tracked |
| Dependency-set check (`npm install --package-lock-only`) | **"up to date" in 572 ms** | Proves the declared set already satisfies itself: **no new dependency is needed**; the `npm ci` failure is packaging-only |
| `npm run lint` (`eslint .`) | **FAIL** | **18 problems (15 errors, 3 warnings)**, exit 1 |
| `npm run typecheck` (`tsc --noEmit`, strict) | **PASS** | exit 0, zero errors |
| `npm run build` (`next build`) — **`DATABASE_URL` unset** | **PASS** | `✓ Compiled successfully in 7.8s`, `✓ Generating static pages (12/12)`, exit 0 |
| `npm run build` — with env | **PASS** (same outcome; env no longer required at build time) | lazy-pool fix confirmed effective |

**Lint root cause — toolchain drift, not code decay.** `eslint-config-next@16.2.6` declares `"eslint-plugin-react-hooks": "^7.0.0"`; with no lockfile the caret floats to the installed **7.1.1**, which promotes React-Compiler rules to error. Error breakdown: `set-state-in-effect` ×11, `immutability` ×2, `purity` ×1, `preserve-manual-memoization` ×1 — all in **pre-existing client pages/components** (`kana`, `kanji`, `kanji/[character]`, `progress`, `question-bank`, `review`, `review/personal`, `review/session/[id]`, `review/sync`, `components/quiz/ExamTimer`). **None is Phase 13.x code; none is a functional defect.** The 3 warnings are the long-standing `exhaustive-deps` ×2 and `@next/next/no-page-custom-font` ×1 (`layout.tsx` `fonts.googleapis.com` `<link>`). Reproduced previously: under `react-hooks@7.0.0` the identical files yield exactly **0 errors / 3 warnings** — matching the historical gate claim.

**Consequence:** the lint gate currently changes state with the calendar, not with the code. A gate that behaves that way is not a gate. It must be resolved **by determinism (committed lockfile) or by real code fixes** — never by disabling `react-hooks/*`, editing `eslint.config.mjs`, or adding suppressions (rules 16/17). Verified clean on that point: **`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` appear nowhere in `src` or `tests`; `next.config.ts` is `{}` with no `ignoreBuildErrors`/`ignoreDuringBuilds`; `tsconfig.json` strict is on.**

---

## K. Test status — 14 tests exist; **could not be executed in this environment**

| Fact | Evidence |
|---|---|
| Exactly one test file, `tests/knowledge-retrieval.test.ts`, **14 `it()` blocks** | grep-verified; names cover seeding all four domains, dictionary/kanji/grammar/sentence record retrieval, romaji+English matching, multi-domain results, JLPT filter, blank query, provenance resolution, citation-tagged context, entity + linked-sentence traversal, grammar-by-slug, dictionary→sentences+kanji |
| Tests require **live PostgreSQL** | they query real rows and seed idempotently; `tests/setup.ts` = `import "dotenv/config"`; `vitest.config.ts` = node env, 60 s timeouts, `fileParallelism: false` |
| Executed: `npx vitest run` | **exit 1** — `Test Files 1 failed`, `Tests 14 skipped`, `Caused by: Error: DATABASE_URL is required` at `src/db/index.ts:55` |
| **Why it cannot be made to pass here** | The sandbox has **no PostgreSQL** (`/usr/lib/postgresql` absent; no `docker`, `pg_ctl`, `initdb`, or `postgres` binary) and is **not root** (`uid 1001`, `apt-get update` → permission denied), so a database cannot be provisioned. Per audit constraint, no dependency was installed to work around it |
| `package.json` has **no `test` script** | scripts = `dev, build, start, lint, typecheck`; vitest is only reachable via `npx` |
| No CI anywhere | no workflow file → nothing runs lint/typecheck/build/tests automatically |
| Coverage gaps | **Zero unit tests** for SRS strategies (SM-2/Leitner/FSRS-lite/fixed-ladder), quiz engine, JLPT scoring, XP rules, or sync — despite all being pure/deterministic and needing no DB |

**Verdict: Phase 13.2's 14 tests are *plausibly* green against a real database but are NOT certified by this audit.** The historical "14/14 PASS" claims were produced in ephemeral agent workspaces and are not reproducible from a clean clone.

---

## L. Deployment status — NOTHING DEPLOYED, nothing claimed

| Requirement | State |
|---|---|
| Framework / Root / Build | Next.js · `.` · `npm run build` — **PASS** |
| Install `npm ci` | **FAIL** (no lockfile). Vercel silently falling back to `npm install` would "succeed" while floating transitive deps — reproducing the §J lint failure inside the build pipeline |
| `DATABASE_URL` at build time | **NOT required** (verified). Required at **runtime**; missing → loud first-query failure (fail-closed, correct) |
| Database | **No hosted PostgreSQL provisioned or referenced anywhere.** The 26-table schema must be applied out-of-band (`npx drizzle-kit push --dialect postgresql --schema ./src/db/schema.ts --url "$DATABASE_URL"`), and because seeding runs on first request the runtime role needs write/DDL privileges |
| AI secrets | `ANTHROPIC_API_KEY` etc. are `.env.example` placeholders only; **nothing to configure yet** because no adapter exists |
| Secret exposure | **None** — `NEXT_PUBLIC_*` appears in **zero** files; `git grep` for `sk-ant-…`/long api-key literals/password literals over tracked content → no hits; only `.env.example` is tracked, no `.env`; `src/db/index.ts` hardcodes no DSN |
| Node version | Not pinned (no `.nvmrc`, no `engines`). Verified toolchain: Node `v22.22.3`, `npm 10.9.8` |
| Health endpoint | `/api/health` verified: `500 {"ok":false}` here (no DB) — degrades gracefully, catches, no stack trace. `{ok:true}` **not verifiable without a database** |
| `npm audit` | 7 vulnerabilities (4 moderate, 2 high, 1 critical, incl. `sharp`); `eslint@9.39.4` EOL + 2 `@esbuild-kit/*` deprecation warnings. Unpatched and un-suppressed |

**No deployment is claimed by this audit.**

---

## M. Security risks

| # | Risk | Severity | Evidence |
|---|---|---|---|
| **S1** | **Internal SQL disclosure on the AI surface.** `api/ai/retrieve/route.ts` catch block returns `message: error instanceof Error ? error.message : …`; Drizzle's `DrizzleQueryError.message` embeds the **full SQL and, on write paths, bound parameter values**. Live-observed at HEAD: retrieval 500 leaked `select cast(count(*) as int) from "kana_entries"`; `/api/srs/decks` leaked an entire `insert … on conflict do update` with all seed values | **High** | The route is unauthenticated, so any caller can elicit schema/table/column internals. **13.3B must not inherit this idiom** into the generation path, where it could also echo provider request internals |
| **S2** | No authentication on any route, including writes (`/api/quiz/seed`, SRS review/undo, sync push, XP) | **High** | §H |
| **S3** | Unauthenticated, unbounded retrieval + 13 `ilike` full scans = unguarded compute surface (DoS amplification as corpus grows) | **Medium** | §G, §I |
| **S4** | Client-supplied `userId` (default `"anonymous-user"`) is treated as identity → trivial cross-user data access/spoofing once any per-user data matters | **Medium-High** | 34 `eq(t.userId)` sites |
| **S5** | Local DSN `postgres:postgres@127.0.0.1:5432/app_db` committed in `drizzle.config.json` (and `.env.example`) | **Low-Medium** | Not a live secret, but a bad template; encourage env-only config |
| **S6** | Migration path gitignored (`/drizzle`) → future schema changes could ship unreviewed | **Medium** | §I |
| **S7** | `.gitignore` correctly protects `.env*`, `node_modules`, `.next` — the historic secret-leak risk is **closed** | Mitigated | present at HEAD |
| **S8** | Client/server boundary — **verified clean** | None | §M-below |
| **S9** | Prompt-injection surface (future): no separation yet between retrieved context / learner input / system instructions / model output | **Medium, planned** | 13.6 |

**Boundary scan (mandated item 7), executed as a resolver rather than a grep:** all 92 `src/**/*.{ts,tsx}` files parsed, 22 `"use client"` files identified, then each searched for **direct and depth-2 transitive** imports reaching `@/db`, `@/db/schema`, `@/services/**`, `@/data/**`, `server-only`, `pg`, or `drizzle`:

```text
DIRECT client→server imports:        0
TRANSITIVE (depth ≤ 2) client leaks: 0
```

`server-only` on `src/db/index.ts` makes any future leak a **build error**, and a vitest alias (`tests/mocks/server-only.ts`) keeps the guard fully active in Next build/runtime while remaining testable. **No client component imports DB or service code.**

---

## N. Duplicate-architecture risks

| Candidate duplicate | Exists? | Determination |
|---|---|---|
| Second AI provider abstraction (`LLMProvider`, `getProvider`, `lib/anthropic.ts`) | **No** | 0 source hits. Rejected prototypes live only in external repos described by 13.1; they were never imported |
| Second kanji database | **No** | Retrieval reads canonical `kanji_entries`; `kanji_radicals`/`kanji_composition` are the existing system |
| Second dictionary/grammar/sentence store | **No** | Single `dictionary_entries` / `grammar_patterns` / `example_sentences` set |
| Second search/retrieval engine | **No** | One `KnowledgeRetriever`; corpus/knowledge services feed the same tables |
| Second SRS engine | **No** | Four strategies sit behind one `scheduler` abstraction — intended design, not duplication |
| Second auth system | **N/A** | No auth exists at all |
| Second DB connection/pool | **No** | Single `@/db` client; **17 importing files** (6 API routes + 1 server page + 10 services), 33 import lines counting `@/db/schema` — all server-side |
| Second AI persistence layer | **No** | No AI tables beyond 13.2 knowledge corpus |
| **Documentation duplicating/conflicting with code** | **YES — active risk** | See table below |

**Report-vs-code divergences (source wins; each marked incomplete):**

| # | Documentation claim | Reality at canonical HEAD | Effect |
|---|---|---|---|
| D1 | `VERCEL-BUILD-RECOVERY-GATE` §3: "`package-lock.json` **Added** — makes `npm ci` deterministic and passing"; §5 "`npm ci` PASS" | **Not tracked.** `npm ci` fails `EUSAGE` | **Gate claim false for the canonical tree.** Report was committed; the artifact it certifies was not |
| D2 | 13.3A §8 and recovery gate §5: `npm ci` PASS · `npx vitest run` 14/14 PASS · lint 0 errors | None reproducible from a clean clone; vitest not executable without a DB | Evidence chain untrustworthy; produced in ephemeral workspaces |
| D3 | 13.3A §8: "lint PASS — 0 errors, 3 warnings" | **15 errors** under floated `react-hooks@7.1.1` | Lint status is date-dependent (§J) |
| D4 | 13.3A §3.5: "`server-only` … absent from `package.json`" | Present (`^0.0.1`) and imported by `src/db/index.ts` | Stale; 13.3B must build on the existing guard, **not re-add it** |
| D5 | `REENTRY-AUDIT` §3/§9: "`src/db/index.ts` throws at module scope; build fails unless `DATABASE_URL` is set at build time" | **Fixed at HEAD** — lazy proxy pool; build verified green with env unset | Resolved; do not re-fix |
| D6 | `REENTRY-AUDIT`: "`.gitignore` ABSENT, secret-hygiene risk" | Present at HEAD | Resolved |
| D7 | 13.3A §4: drizzle JSON config "inert" | Loaded **and** errors out | Misleading tooling guidance |
| D8 | Every "gate PASS" in `reports/` | **No CI exists** — gates are prose assertions with no log/artifact to re-validate | Highest-leverage fix in §P |

**Net:** no duplicate production architecture exists. The genuine duplication risk is **forward-looking** — 13.3B adding a second provider/context/error abstraction alongside the already-canonical `KnowledgeChunk`/`RetrievalResult` types (§F.6) and `src/db/index.ts` guard (§N, D4), or re-implementing retrieval inside the AI layer instead of consuming it.

---

## O. Exact Phase 13.3B prerequisites

**Blocking (must be green before 13.3B starts):**

1. **P1 — Commit `package-lock.json` generated from the current `package.json` with zero dependency changes.** Sole root cause of the `npm ci` failure and of P2. Confirmed here: dependency resolution reports "up to date", and `npm ci` passes once a lockfile exists.
2. **P2 — Make `npm run lint` deterministically green.** After P1, either the pinned baseline reproduces 0 errors/3 warnings, or the 15 React-Compiler findings are fixed as real code changes in their own bounded prompt. **Forbidden:** disabling rules, editing `eslint.config.mjs` to mute `react-hooks/*`, adding `eslint-disable`, or touching `next.config.ts`.
3. **P3 — Add `"test": "vitest run"`** and move `vitest` to `devDependencies`.
4. **P4 — Provide a reproducible database path**: CI with a Postgres service container, so the 14 tests can actually be run by someone other than the agent asserting them. Without this, no gate in 13.3B+ is verifiable.
5. **P5 — Replace `drizzle.config.json` with a `drizzle.config.ts` reading `process.env.DATABASE_URL`** (no hardcoded DSN), and **remove `/drizzle` from `.gitignore`** so future migrations are reviewable. Configuration only — **create no tables, run no push/generate**.

**Design constraints carried into 13.3B (non-blocking, binding):**

6. **P6 —** Exactly one contract (`src/services/ai/provider.ts`) + one selection point (`providerFactory.ts`); adapters under `src/services/ai/providers/`. Routes must not import vendor SDKs.
7. **P7 —** Fail-closed selection: no key-presence inference; missing/unknown `AI_PROVIDER` throws; `mock` rejected when `NODE_ENV === "production"`; no silent production fallback (rules 10–13).
8. **P8 —** `import "server-only"` at the top of the provider boundary (matching the existing `src/db/index.ts` precedent) and server-only throughout; no `NEXT_PUBLIC_*` for any AI secret.
9. **P9 —** Consume `KnowledgeChunk`/`RetrievalResult`/`formatContext()` verbatim as the grounding contract; no parallel context type; no retrieval re-implementation.
10. **P10 —** Normalize errors into stable public codes with opaque client messages and server-side detail only — explicitly **not** the current `error.message` pass-through (S1).
11. **P11 —** Preserve unchanged: `knowledgeRetriever.ts`, `corpusService.ts`, `knowledgeService.ts`, `api/ai/retrieve/route.ts`, `tests/knowledge-retrieval.test.ts`, `src/db/schema.ts`, `src/db/index.ts`, and every SRS/quiz/JLPT/XP/kana/kanji/analytics surface. No tutor route, no streaming, no persistence table, no migration, no auth change in 13.3B.
12. **P12 —** Timeout/abort/usage metadata in the contract (`.env.example` already names `AI_REQUEST_TIMEOUT_MS=45000`), so 13.5 usage accounting and 13.6 rate limiting extend rather than re-cut the interface.

---

## P. Recommended next prompt

> ### Phase 13.3B-G0 — Repository Reproducibility Repair (gate zero)
>
> Read-only audit findings established the repository cannot verify its own gates. Make it able to. **No feature work.**
>
> **Allowed changes, nothing else:** (1) generate and commit `package-lock.json` from the current `package.json` with **zero** dependency additions/removals/range edits; (2) add `"test": "vitest run"` and move `vitest` to `devDependencies`; (3) replace `drizzle.config.json` with `drizzle.config.ts` reading `process.env.DATABASE_URL` (no hardcoded credential) and delete the `/drizzle` line from `.gitignore`; (4) add `.github/workflows/ci.yml` running install → lint → typecheck → build → `vitest` against a PostgreSQL service container; (5) write `reports/gates/PHASE-13.3B-G0-REPRODUCIBILITY-GATE.md` with the commit hash, every command, every exit code, and an explicit list of what remains unverifiable without a hosted database.
>
> **If committing the lockfile leaves `eslint-plugin-react-hooks@7.1.1` as the pinned resolution, do not pin around it and do not disable rules** — report that lint legitimately fails with 15 errors and stop for a separate bounded lint-repair prompt (fix `set-state-in-effect` ×11, `immutability` ×2, `purity` ×1, `preserve-manual-memoization` ×1 in the client pages).
>
> **Forbidden:** any AI/provider code, `provider.ts`, `providerFactory.ts`, adapters, route changes, schema changes, migrations, `drizzle-kit push/generate`, auth changes, any edit to `knowledgeRetriever.ts` / `corpusService.ts` / `knowledgeService.ts` / `/api/ai/retrieve` / `tests/knowledge-retrieval.test.ts`, any ESLint/TS/build-config weakening, any new dependency.
>
> **Gate:** `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build` all green from a clean clone, CI running, `npm test` executable (green where a DB is reachable; otherwise reported as environment-blocked). **Only after this gate PASSES may Phase 13.3B begin.**

Rationale for ordering: rules 24/25 forbid building downstream phases on a failing gate. 13.3B's own acceptance criteria (`npm ci`, lint, vitest, deployability) are precisely the ones failing now, so gate zero is a prerequisite, not optional cleanup.

---

## Audit summary

| Area | Verdict |
|---|---|
| Repository inspected at current GitHub HEAD (`8cd2bd7` = `origin/main`) | **DONE** |
| Source code left unmodified; no deps installed; no DB/migration/deploy | **DONE** — `git status` clean, delta vs `main` is one report file |
| Architecture, phases, AI status, retrieval, auth, DB, boundaries, env, build, tests, deployment, security, duplication | **ESTABLISHED** |
| Application code quality | **Sound** — strict TS clean, build green, retrieval real and preserved, client/server boundary verified clean (0 direct, 0 transitive leaks), no secret exposure, no rule suppressions |
| Reproducibility / verification infrastructure | **BROKEN** — `npm ci` fails, `lint` fails, tests unrunnable without a DB, no CI |
| Trust in `reports/` gate claims | **FAILING** — 8 documented divergences (D1–D8), including a committed "package-lock.json Added" claim for a file that was never committed |
| Phase 13.3B readiness | **NOT READY** — prerequisites P1–P5 unmet |

Two of these are materially different from the picture painted by the stored reports, and both point the wrong way: an incoming session reading `reports/` alone would believe the lockfile exists and that lint is green. The code is in better shape than the evidence chain suggests; the evidence chain is what must be repaired first.

RE-ENTRY AUDIT GATE: **FAIL**

*The audit deliverable itself is complete and every finding above is backed by a command executed in this session. The gate is recorded FAIL because the repository at canonical HEAD cannot satisfy the mandated gate criteria — `npm ci` fails, `npm run lint` fails with 15 errors, and `npx vitest run` fails for lack of a provisioned database — and the governing rule forbids proceeding to Phase 13.3B on a failing gate or reporting a pass that was not observed. Nothing was fabricated. Resolve §P (gate zero), then re-run this audit's gate table.*
