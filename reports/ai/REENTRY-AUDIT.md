# RE-ENTRY AUDIT — NihongoBridge

**Repository audited:** `https://github.com/ranimony-afk/nihingobridgeupgrade`
**Audited revision:** `c1be76c` (`main` HEAD, commit subject `A 13.1.1A`)
**Audit mode:** read-only audit. No repository files modified, no dependencies installed, no migrations created, no deployment performed.
**Audit date:** 2026-09-14
**Constraint note:** Per the audit constraints ("Do NOT install dependencies"), the build state below is a *determination* (static + git-history evidence + one non-mutating `npm ci --dry-run` probe), not a full dynamic re-execution of the toolchain.

---

## 1. Repository state

### 1.1 What exists

| Area | State |
|---|---|
| `package.json` | Present. Still named `nextjs-postgresql-template`. Scripts: `dev`, `build`, `start`, `lint` (`eslint .`), `typecheck` (`tsc --noEmit`). **No `test` script.** `vitest ^5.0.0` incorrectly sits in `dependencies`, not `devDependencies`. |
| Lockfile | **ABSENT.** No `package-lock.json` / `npm-shrinkwrap.json` / `pnpm-lock.yaml` / `yarn.lock`. |
| `.gitignore` | **ABSENT.** Only `.env.example` is tracked; no `.env` is tracked (good). |
| `next.config.ts` | Empty config (`const nextConfig: NextConfig = {}`). |
| `tsconfig.json` | Strict mode, `@/* → ./src/*`, bundler resolution, Next plugin. Healthy. |
| `drizzle.config.json` | **Present but inert.** drizzle-kit does not load `.json` configs; it also hardcodes `postgresql://postgres:postgres@127.0.0.1:5432/app_db`. Prior phase evidence confirms schema was pushed via explicit CLI flags instead. |
| `.env.example` | Documents `DATABASE_URL` plus the Phase 13 AI contract (`AI_PROVIDER=mock`, `AI_PROMPT_VERSION`, `AI_REQUEST_TIMEOUT_MS`, blank `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_API_URL`). No secrets. |
| `etl/` | **ABSENT.** No ETL pipeline exists in the canonical repository. |
| `nihongobridge-integration-masterplan/` | **ABSENT.** |
| `reports/` | Present: `reports/ai/PHASE-13.1-AI-ARCHITECTURE-AUDIT.md`, `reports/ai/PHASE-13.2-KNOWLEDGE-RETRIEVAL.md`, `reports/ai/PHASE-13.3A-PROVIDER-AUDIT.md`, `reports/gates/PHASE-13-CHECKLIST.md`. |
| `tests/` | `tests/knowledge-retrieval.test.ts` (exactly **14** `it()` blocks — matches the 13.2 gate claim "14 passed"), `tests/setup.ts` (loads `.env`; tests run against **live PostgreSQL**, 60s timeouts, serial files). `vitest.config.ts` present. |
| `README`, `LICENSE`, `vercel.json`, `.nvmrc`, CI config | All **ABSENT**. |
| `middleware.ts`, auth libs (next-auth/Clerk/Lucia/JWT/bcrypt), Supabase | **None.** No authentication of any kind exists in source. |

### 1.2 Application surface (all present and coherent)

- **Pages:** home (server-rendered, `force-dynamic`), JLPT test + results, kana, kanji (list + detail), question bank, quiz drill, analytics, progress, and 6 review/SRS pages.
- **API routes (37 route files):** health, `ai/retrieve`, jlpt (tests, sessions, answers, submit, results), kana, kanji, knowledge/srs, questions, quiz (analytics, seed), srs (cards, daily, decks, personal lifecycle, preview, queue, review, schedulers, sessions, settings, stats, sync push/pull), xp (ledger).
- **Services:** `services/ai/knowledgeRetriever.ts` (653 lines), `services/knowledge/` (corpus + knowledge service), `services/srs/` (scheduler, session, sync, daily queue, personalization, 4 strategy engines: SM-2, Leitner, FSRS-lite, fixed ladder), `services/jlpt/`, `services/quiz/`, `services/gamification/` (XP registry/service/rules).
- **DB schema (`src/db/schema.ts`, 729 lines):** 26 tables — users, questions, jlpt_tests, jlpt_test_questions, test_sessions, test_answers, srs_schedulers, srs_decks, srs_cards, srs_reviews, srs_sync_devices, srs_sync_log, srs_review_sessions, srs_user_settings, srs_personalization, kana_entries, kanji_radicals, kanji_entries, kanji_composition, xp_events, xp_rules, user_analytics, **knowledge_sources, dictionary_entries, grammar_patterns, example_sentences** (the four additive Phase 13.2 tables).
- **Client/server hygiene:** every DB-touching page/route carries `export const dynamic = "force-dynamic"`; the two pages using `useSearchParams` (`jlpt/test/[id]`, `quiz/drill`) correctly wrap in `<Suspense>`; **zero** client-marked components import `@/db`, `@/services`, `server-only`, or any provider SDK. Dynamic routes use the modern `params: Promise<...>` typing (Next 15/16 compatible).

### 1.3 Git history state

History is churn-heavy: repeated whole-tree delete/re-add snapshots (`del`, `A`, `B`, `DEL` subjects). Critically:

- `git diff 5c1cb62..HEAD -- src tests .env.example package.json` → **0 lines**. The 13.2 implementation at HEAD is byte-identical to the `13.2` implementation commit.
- `git diff 7c66bec..HEAD` → only `reports/ai/PHASE-13.3A-PROVIDER-AUDIT.md` changed (341-line expanded version replaced the 186-line original). Nothing else.
- The last three commits (`7c66bec a13.3a` → `08abae1 DEL a13.3a` → `c1be76c A 13.1.1A`) are delete/re-add snapshots whose only net effect was updating that one report.

## 2. Completed phases (determination A)

| Phase | Status | Evidence |
|---|---|---|
| ≤ Phase 12.1 platform baseline (quiz engine, JLPT simulator, SRS w/ sync, XP/gamification, kana/kanji knowledge, analytics) | **COMPLETE** | Full service/route/page tree present at HEAD; matches baseline commit `e4fd323 b 12.1` lineage. |
| Phase 13.1 — AI architecture audit | **COMPLETE** (docs-only, by design) | Report present; decision: single provider port in canonical repo, Anthropic first adapter, retrieval model-free. |
| Phase 13.2 — Knowledge retrieval | **COMPLETE — genuinely implemented** (see §4) | Source, tables, API, tests all present and byte-identical to impl commit `5c1cb62`. |
| Phase 13.3A — Provider boundary audit | **COMPLETE** (audit-only) | Expanded 341-line audit at HEAD defines the exact 13.3B creation set and protected files. |
| Phase 13.3B — Provider port + Anthropic adapter | **NOT STARTED** | No `provider.ts`, `providerFactory.ts`, or `providers/` directory; no provider SDK dependency; `AI_PROVIDER` is read nowhere in code. |
| ETL pipeline | **NEVER EXISTED in this repo** | Directory absent at every revision. |
| Authentication | **NEVER IMPLEMENTED** | All routes open; identity is client-supplied (`?userId=` / body, default `"anonymous-user"`). The `users` table exists but is not wired to any auth. |

Note on stale markers: the home page still announces "Phase 10 — JLPT & Question Engine Ready" and the footer "Phase 10 Production Target"; the checklist header still says `Current prompt: 13.2 / IN PROGRESS`. Phase branding lags reality (actual baseline: **13.3A complete, 13.3B pending**).

## 3. Current build state (determination B)

| Command | Verdict from a fresh clone | Basis |
|---|---|---|
| `npm ci` | **FAILS** — `EUSAGE: can only install with an existing package-lock.json` | Proven non-destructively with `npm ci --dry-run` (fails before touching anything). The 13.3A report's `npm ci — PASS` was true **only in that agent's workspace**, where a lockfile was generated with `npm install --package-lock-only` — **the lockfile was never committed**, so the claim is stale for the canonical tree. |
| `npm install` | Expected PASS (works without lockfile) | Standard behavior; 13 known audit vulnerabilities (1 low / 6 moderate / 5 high / 1 critical) per 13.3A evidence. |
| `npm run lint` | Expected PASS with 3 pre-existing warnings | Flat-config ESLint 9 + `eslint-config-next/core-web-vitals` is valid; warnings documented (Google-font `<link>` in `layout.tsx`, two hook-deps in `question-bank` and `review/session/[id]`). Not errors. |
| `npm run typecheck` | Expected PASS | Strict TS; prior gate evidence; no detectable type hazards found statically (Suspense boundaries, Promise-typed params, no server/client import violations). Not re-executed per constraints. |
| `npm run build` | Expected PASS **only if `DATABASE_URL` is set in the build environment** | `src/db/index.ts` **throws at module scope** when `DATABASE_URL` is unset; Next evaluates route/page modules during build, so an unset env var crashes the build even though every route is `force-dynamic`. With the var set, `pg.Pool` connects lazily, so the DB need not be reachable during build. Prior gate evidence: PASS (all routes compiled). |
| `npx vitest run` | PASS conditionally | Requires live PostgreSQL reachable from the test environment (tests seed idempotently via `ensureSeeded`); 14 tests match the gate report. Not re-executed per constraints. |

## 4. Phase 13.2 verification (determination D)

**Verdict: GENUINELY IMPLEMENTED.** Every claim in `reports/ai/PHASE-13.2-KNOWLEDGE-RETRIEVAL.md` was verified against source:

- `src/services/ai/knowledgeRetriever.ts` — exports `KNOWLEDGE_DOMAINS` (`dictionary|kanji|grammar|sentence`), `KnowledgeRetriever.retrieve` (query classification: japanese/romaji/english; per-domain parallel search; deterministic rank; JLPT filter), `retrieveEntity` (linked-record traversal), and `formatContext` (citation-tagged `contextText` + token estimation) — all verified at lines 296/341/637.
- `src/services/knowledge/corpusService.ts` — idempotent `ensureSources` / `ensureSeeded` / `getProvenance` / `getStats`; provenance registration decoupled from record seeding (the fix the 13.2 gate claims).
- Schema — the four additive tables exist; kanji reuses the pre-existing canonical `kanji_entries`; **no second kanji store**.
- `src/data/lexicon.ts` (366 lines) — first-party corpus present.
- `GET /api/ai/retrieve` — search mode (`q`, `domains`, `level`, `limit` clamped 1–50) + entity mode (`domain`+`id`); seeds before retrieval; structured 400/500 errors; `force-dynamic`.
- `tests/knowledge-retrieval.test.ts` — exactly 14 `it()` blocks asserting real source records + provenance, matching the "14 passed" gate claim.
- `git diff 5c1cb62..HEAD` over `src tests .env.example package.json` = **zero** — nothing was degraded or stubbed after the fact.

Only caveat: the 13.1 report originally scoped 13.2 as the *provider port*; 13.2 actually shipped *knowledge retrieval* and the provider was re-scoped to 13.3. The reports document this drift consistently, so it is intentional, not accidental.

## 5. Current AI architecture (determination E)

```text
retrieval            implemented — KnowledgeRetriever (model-free, deterministic, SQL ILIKE ranking,
                     raw record + provenance on every chunk, citation-tagged contextText)
provider             NOT IMPLEMENTED — no AIProvider contract, no factory, no adapter, no SDK dependency;
                     AI_PROVIDER / ANTHROPIC_* exist only in .env.example and docs
application service  NOT IMPLEMENTED — no tutor / correction / generation / RAG orchestration service
API                  PARTIAL — GET /api/ai/retrieve only (search + entity); no generation/chat/streaming route
UI                   NONE — zero browser callers of /api/ai/retrieve; no AI UI components
persistence          PARTIAL — knowledge corpus + provenance tables only (knowledge_sources,
                     dictionary_entries, grammar_patterns, example_sentences, reused kanji_entries);
                     no AI conversation / completion / cache / quota / retention tables
```

All provider-family terms (`AIProvider`, `LLMProvider`, `getProvider`, `AnthropicClient`, `generateStructured`, `streamTutorCompletion`) occur **only** in report markdown and in a single forward-looking comment inside `knowledgeRetriever.ts`. `server-only` is not installed and not imported. The checklist's "no duplicate AI provider" grep gate currently returns **zero** matches in `src`.

## 6. `src/lib/queries.ts` (determination F)

**The file does not exist.** There is no `src/lib/` directory at all. Grep for `lib/queries` across the entire tree returns exactly one hit — line 62 of the 13.3A audit, which itself documents its absence.

| Question | Answer |
|---|---|
| Consumers | **None.** Zero imports of `@/lib/queries` or any relative `lib/queries` path anywhere in `src`, `tests`, or configs. |
| SERVER / CLIENT / SHARED classification | **N/A — absent.** (For reference, actual data-access lives in server-only modules: `src/db/*` and `src/services/*`, consumed exclusively by `force-dynamic` server pages and route handlers; no client component imports them.) |
| Can it cause a Next.js/Vercel build failure? | **No.** A non-existent file with zero consumers cannot break the build. If a consumer is ever reintroduced, the boundary risk would be real only if it imported `@/db` (whose module-scope throw then propagates) into a client bundle — currently not the case anywhere in the tree. |

## 7. Incomplete / duplicate / legacy architecture (determination G)

1. **Committed-tree ≠ verified-workspace tree.** The 13.3A "all gates pass" evidence depended on an uncommitted `package-lock.json`. From a clean clone, `npm ci` fails today — the single largest audit discrepancy.
2. **Dead Drizzle config.** `drizzle.config.json` is never loaded by drizzle-kit (JSON unsupported) and hardcodes localhost; schema application relies on memory of the CLI-flag invocation. No migrations directory exists; the DB schema is reproduced only via `drizzle-kit push --schema ... --url ...`.
3. **Missing hygiene files:** `.gitignore`, `package-lock.json`, `README`, `LICENSE`, `vercel.json`, `.nvmrc`, CI — all absent.
4. **No auth / open writes.** XP, SRS sync/personal lifecycle, and quiz seed routes accept client-supplied `userId` (`"anonymous-user"` default) with no verification. Fine for the current single-tenant preview phase; a hard stop before any public deployment and before Phase 13.3B+'s authenticated-tutor gates can be satisfied.
5. **Starter-template residue:** package name `nextjs-postgresql-template`, `__arenaNextJsPostgresqlPool` global key in `src/db/index.ts`, `vitest` misfiled under `dependencies`, stale "Phase 10" branding in home/footer, checklist header still reads "Current prompt 13.2 / IN PROGRESS".
6. **No duplicates found:** one retrieval engine, one db client, one schema, zero provider abstractions, zero competing AI code paths. The legacy external prototypes (`Arena-test`, `nihongobridge-ai`) exist only as references inside reports — they were never merged in.
7. **ETL and masterplan directories** were requested in this audit but have never existed in this canonical repository — any prompt step referencing them is operating on a false premise.

## 8. Database state

- Engine: PostgreSQL via `pg` Pool + `drizzle-orm/node-postgres` (singleton pool, dev-global cached). `DATABASE_URL` required; module-scope throw otherwise.
- Schema source of truth: `src/db/schema.ts` only (26 tables). Push-based, additive-only discipline per reports; no migrations, no destructive history.
- Seeding: request-time, idempotent (`onConflictDoNothing`) — home page seeds JLPT/question data; `/api/ai/retrieve` seeds knowledge corpus + kanji. First cold request performs writes.
- Content provenance: every knowledge row carries `sourceRef` resolving to `knowledge_sources` (name, version, licence, URL); corpus is first-party/licence-safe.
- Auth/adjacency: `users` table is a passive profile stub; all SRS/XP rows key off unverified client userIds.

## 9. Vercel readiness (determination C)

Blockers/risks, ordered by severity:

1. **HARD (build): `DATABASE_URL` must exist in Vercel env vars before `next build`.** Unset → module-scope throw in `src/db/index.ts` fails the build during route/page module evaluation, despite every route being `force-dynamic`.
2. **HARD (install command):** if the Vercel project's install command is `npm ci` (or Vercel is configured to require a lockfile), install fails immediately — **no lockfile is committed**. Default Vercel behavior falls back to `npm install`, which works but floats versions.
3. **HARD (data):** no hosted PostgreSQL is provisioned and the schema must be pushed out-of-band (`drizzle-kit push` with CLI flags; the committed JSON config is inert). First request also needs write access for idempotent seeding.
4. **MEDIUM:** missing `.gitignore` — any future push from a local working copy can commit `node_modules/`, `.next/`, or a real `.env` (which would also leak the localhost or a production DSN).
5. **MEDIUM:** no authentication — a public Vercel URL exposes writable SRS/XP/seed endpoints to anyone.
6. **LOW:** `vitest` (+transitively its tree) installs in production builds; `next.config.ts` has no `serverExternalPackages` pinning for `pg` (Node runtime default is fine); Google Fonts `<link>` keeps a runtime dependency on fonts.googleapis.com; no Node version pinned.
7. **NON-ISSUES verified:** Suspense/`useSearchParams` boundaries correct; no client imports of server modules; Node runtime (pg-safe); `/api/health` dynamic and returns DB liveness; Tailwind 4/PostCSS wiring valid.

## 10. Risks register

| # | Risk | Severity |
|---|---|---|
| R1 | Future agents trust "npm ci PASS" from 13.3A and skip the lockfile; CI/CD breaks on clean checkout | High |
| R2 | Schema drift: no migrations + inert drizzle config means environments converge only by manual `push` ritual | High |
| R3 | Public deployment without auth exposes all write APIs | High |
| R4 | Phase 13.3B implemented against a different shape than the 13.3A-approved creation set (docs are the only contract) | Medium |
| R5 | Whole-tree delete/re-add git churn destroys review signal; reports and code can silently diverge again | Medium |
| R6 | Retrieval endpoint unauthenticated + unbounded LIKE scans; corpus is tiny today but it is an unguarded compute surface | Low-Medium |
| R7 | Test suite requires a live DB; no test script in package.json; no CI to run it | Low |
| R8 | Secret hygiene until `.gitignore` exists | Medium |

## 11. Exact next action (determination H — exactly one)

**Execute Phase 13.3B, beginning with repository repair as gate zero:** implement — and only implement — the single server-side AI provider foundation approved in `reports/ai/PHASE-13.3A-PROVIDER-AUDIT.md` §6: `src/services/ai/provider.ts` (provider-neutral contract), `src/services/ai/providerFactory.ts` (sole explicit `AI_PROVIDER` selection point, fail-closed in production, no key-presence auto-selection, no silent mock fallback), `src/services/ai/providers/anthropicProvider.ts` (timeout, abort, normalized errors, usage metadata), `src/services/ai/providers/mockProvider.ts` (deterministic, test/dev only), plus `tests/ai/provider.test.ts` and `tests/ai/anthropicTransport.test.ts`; consume `KnowledgeRetriever.formatContext()` output as the grounding contract; do **not** touch the Phase 13.2 retrieval service/route, schema, auth, client components, or add tutor/streaming/persistence layers — and, as the first commit of that prompt, commit the generated `package-lock.json` (and a `.gitignore`) so that `npm ci` finally passes from a clean clone, since every subsequent 13.3B validation gate (`npm ci`, lint, typecheck, build, vitest, deployment) depends on it.

---

*Audit ends here. No code was modified in the canonical repository; nothing was installed, migrated, or deployed.*
