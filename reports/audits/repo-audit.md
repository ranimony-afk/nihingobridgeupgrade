# PHASE 00 — Repository Audit (Read-Only)

**Date:** 2026-03-25  
**Auditor:** Integration control (Phase 00)  
**Method:** Clone + inspect. No production code modified.  
**Repos:**

| ID | URL | Role |
|---|---|---|
| A-local | this workspace | Deployable sandbox working copy |
| A-github | https://github.com/ranimony-afk/nihingobridgeupgrade | Canonical production GitHub tree |
| B | https://github.com/ranimony-afk/Knowledge-base-NihongoBridge | Source / feature / data repository |

**Prior audit:** GitHub A `nihongobridge-integration-masterplan/reports/audits/*` is **STALE**. It claimed Repo A was an empty starter and Repo B was unavailable. Both claims are false against current GitHub trees.

---

## 1. Three-way discrepancy (highest-priority finding)

The master instruction says Repository A is canonical. In this environment there are **two different Repository A trees**:

| Surface | What it actually is | Evidence |
|---|---|---|
| Local sandbox | Next.js 16 + Drizzle starter. Empty schema. One route (`GET /api/health`). Starter homepage. | `package.json` name `nextjs-postgresql-template`; `src/db/schema.ts` is `export {}`; `src/app/page.tsx` title "Arena Next.js PostgreSQL Starter" |
| GitHub A `main` | Same package name/stack, plus 2081-line canonical schema, 31 API routes, domain services, TypeScript ETL, integration masterplan, control-tower UI | `/tmp/repo-a` clone, 143 files |
| GitHub B `main` | 9 packages (admin/ai/api/etl/knowledge/mobile/platform/search/web), Next 14, Python ETL, Flutter, Meilisearch | `/tmp/repo-b` clone |

**Implication:** this Phase 00 must not "merge B into local" as if GitHub A were empty. GitHub A already contains a large domain implementation that local sandbox does not. Phase 01 must **reconcile local ↔ GitHub A** before absorbing Repo B.

**Recommendation (DEC-0009):** GitHub A remains the canonical *design* source. Local sandbox remains the *deployable* working copy for this environment. Phase 01 ports GitHub A foundation (schema, health, layout) additively. Repo B is never copied wholesale.

---

## 2. Repository A — local sandbox

### Stack

- Next.js `16.2.6` App Router, React `19.2.6`, TypeScript `5.9.3`
- Drizzle ORM `0.45.2` + `pg` `8.20.0`
- Tailwind CSS `4.1.17`
- Scripts: `dev`, `build`, `start`, `lint`, `typecheck`
- DB: `DATABASE_URL` via `src/db/index.ts` (`Pool` + `drizzle`)

### Files (complete)

| Path | Type | Classification | Purpose |
|---|---|---|---|
| `package.json` | config | KEEP | Stack manifest |
| `package-lock.json` | config | KEEP | Lockfile |
| `tsconfig.json` | config | KEEP | TS paths `@/*` → `src/*` |
| `next.config.ts` | config | KEEP | Next config |
| `drizzle.config.json` | config | KEEP | Drizzle kit |
| `eslint.config.mjs` | config | KEEP | ESLint |
| `postcss.config.mjs` | config | KEEP | PostCSS / Tailwind |
| `src/app/layout.tsx` | component | MODIFY | Root layout (starter branding) |
| `src/app/page.tsx` | component | MODIFY | Starter homepage |
| `src/app/globals.css` | style | MODIFY | Global styles |
| `src/app/api/health/route.ts` | route | KEEP | Healthcheck — regression lock |
| `src/db/index.ts` | source | KEEP | Drizzle client |
| `src/db/schema.ts` | source | MODIFY | Empty placeholder |
| `.env` | secret | KEEP (never commit) | `DATABASE_URL` only |

### Missing vs target architecture

No `src/services`, `src/repositories`, `src/middleware.ts`, `etl/`, `mobile/`, `docs/`, `.gitignore`, `.env.example`, LICENSE, tests, auth, admin, search.

### Auth

None. No middleware, no users table, no session, no JWT.

### Database

Zero tables in Drizzle schema. Live PostgreSQL is whatever the sandbox instance has; schema is not applied.

---

## 3. Repository A — GitHub canonical tree

### Stack (same as local)

Identical `package.json` (still named `nextjs-postgresql-template`). No extra runtime deps for jose, meilisearch, next-auth, redis, or LLM SDKs.

### Layout

```
src/app/            pages + 31 API route handlers
src/db/             index.ts + schema.ts (2081 lines)
src/services/       knowledge, learning, srs, ai, gamification
etl/                TypeScript ETL framework (parsers incomplete)
nihongobridge-integration-masterplan/   control docs + stale audits
```

### Schema (canonical candidate)

39 tables, 15 enums. Text application-generated PKs. JSONB glosses. Provenance columns. No `users` / `identity` table — `learnerId` is unbound `text`.

Domains: provenance, dictionary, kanji/radicals, grammar, sentences, courses/lessons, assessment, SRS, progress, gamification, bookmarks.

See `reports/audits/database-comparison.md`.

### APIs

31 handlers under `/api/health`, `/api/masterplan`, `/api/v1/tutor/*`, `/api/v2/*`, `/api/ai/*`. None authenticate. Dictionary search calls `DictionaryService` (real Drizzle queries, pg_trgm intended).

### ETL

TypeScript, adapted from Repo B Python. Source registry includes JMdict, JMnedict, KANJIDIC2, Tatoeba (license-aware). **JMdict XML parser is a stub** (`yielding 0 records`). Status of primary sources: `draft` / `planned`.

### UI

Control-tower homepage (phase board), `/docs` for masterplan markdown. Not a learner product UI.

### Tests

`etl/tests/pipeline.test.ts` only. No Vitest/Jest config in package.json.

### Security gaps

- No `.gitignore` on GitHub A
- No LICENSE
- No auth on learner-mutating routes (`POST /api/v2/srs/review`, progress, XP)
- In-memory SRS session `Map` (comment: use Redis in production)

---

## 4. Repository B — Knowledge-base-NihongoBridge

Nine packages. **Not** a production monorepo. Multiple competing Next.js 14 apps, a Python ETL, a Fastify search service, a Flutter client, and Docker platform scripts.

| Package | Files (approx) | Stack | Role | Integration class |
|---|---|---|---|---|
| `nihongobridge-knowledge` | 74 | Drizzle schema + compiled `lib/` | Shared UUID schema, FTS indexes | MERGE concepts; do not replace GitHub A schema |
| `nihongobridge-api` | 84 | Next 14, jose, ioredis, meilisearch, postgres.js | Domain HTTP API | ADAPT contracts into A's `/api/v2`; do not nest the app |
| `nihongobridge-web` | 94 | Next 14, tanstack-query, zustand | Learner UI (dict, kanji, SRS demo, tests, dashboard) | SELECTIVE UI patterns later; consume A's API |
| `nihongobridge-admin` | 64 | Next 14, jose, tip-tap, dnd-kit | CMS + ETL control + RBAC tables | MERGE later (admin phase) |
| `nihongobridge-ai` | 46 | Next 14, jose, ioredis, markdown | Tutor / translate / grammar explain / question gen | ADAPT into `src/services/ai` later |
| `nihongobridge-etl` | 64 | Python | Real JMdict parser, Tatoeba, TTS, question generators | SOURCE for parsers/algorithms |
| `nihongobridge-search` | 29 | Fastify + Meilisearch | Autocomplete + LISTEN/NOTIFY sync | DEPRECATE for v1 (pg_trgm first) |
| `nihongobridge-mobile` | 113 | Flutter | Offline SQLite, SRS, tests, dict, API client | KEEP as future client; Phase 08 |
| `nihongobridge-platform` | 20 | Docker Compose, CI | Multi-service local platform | ARCHIVE as B-era ops; do not adopt as A's deploy model |

### Repo B knowledge tables

`dictionary_entries`, `kanji_entries`, `grammar_patterns`, `sentences`, `media_assets`, link tables, `srs_decks/cards/review_logs`, `practice_tests`, `questions`, `test_sessions`, `users`, `user_progress`, `user_bookmarks`.

Admin extra: `admin_user_roles`, `admin_audit_logs`, `content_reviews`, `etl_pipeline_runs`, `etl_schedules`, `blog_posts`.  
AI extra: `ai_explanations`.

PK type: **uuid** with `defaultRandom()`. JLPT as enum `N5`…`N1`/`NONE`.

### Repo B auth

`jose` verifying Supabase JWT (`SUPABASE_JWT_SECRET` HS256 or JWKS). Dev bypass via `x-user-id` when `ALLOW_INSECURE_USER_HEADER=true`. Flutter has `auth_token_store.dart`. **Do not swap this onto A.**

---

## 5. What is reusable from B (approved direction only)

Allowed as *source material* for later bounded phases:

1. Python JMdict / Tatoeba parsers and enrichers → port into A's TypeScript ETL
2. Knowledge domain *ideas* already largely present in GitHub A schema
3. API response shapes / quiz / test session flows → inform `/api/v2` contracts
4. Web UI components (dictionary tile, test runner, SRS flip card) — later, against A's API
5. Admin CMS patterns and RBAC table *ideas*
6. Flutter client architecture (API client, local DB, sync) — Phase 08
7. License-aware source thinking (already in A's `etl/sources/registry.ts`)

Forbidden in any phase without a new DEC:

- Copying B directories into A
- Applying B Drizzle migrations onto A's database
- Standing up Meilisearch + Fastify as a required production dependency
- Adopting Supabase Auth as a side-channel identity
- Running four Next.js apps
- Scraping proprietary dictionary UIs

---

## 6. Regression lock (existing features that must remain)

Local / production sandbox today:

1. `GET /api/health` returns `{ ok: true }` after `select 1`
2. `src/db/index.ts` connects via `DATABASE_URL`
3. Homepage server-renders after `select 1`
4. Next.js App Router + Drizzle + PostgreSQL stack
5. No destructive SQL

GitHub A additional locks once ported:

6. `/api/v2/dictionary/search` service API
7. Canonical table names already in `schema.ts` (do not rename)

---

## 7. Stop conditions encountered

Mapped confidently (no stop): schema comparison, API comparison, auth absence on A, B package roles, ETL parser gap, search strategy.

**Open decisions (do not guess in code):**

| Topic | Options | Recommendation |
|---|---|---|
| Auth library | Auth.js v5 / Lucia / custom jose / Supabase | Design in Phase 01; **not** B's Supabase JWT (DEC-0011) |
| Local vs GitHub A sync | Port GitHub A into sandbox / treat GitHub A as already done | Port additively in Phase 01 (DEC-0009) |
| PK type | GitHub A `text` vs B `uuid` | Keep GitHub A `text` (DEC-0010) |
| Search | pg_trgm vs Meilisearch | pg_trgm/FTS v1 (DEC-0012) |

---

## 8. Evidence index

| Deliverable | Path |
|---|---|
| This audit | `reports/audits/repo-audit.md` |
| A inventory | `reports/audits/repo-a-inventory.csv` |
| B inventory | `reports/audits/repo-b-inventory.csv` |
| Database | `reports/audits/database-comparison.md` |
| API | `reports/audits/api-comparison.md` |
| Auth | `reports/audits/authentication-analysis.md` |
| Conflicts | `reports/audits/conflict-analysis.md` |
| Matrix | `reports/audits/decision-matrix.md` |
| Capabilities | `reports/audits/capability-map.md` |
| Security | `reports/audits/security-baseline.md` |
| Gate | `reports/gates/PHASE-00-CHECKLIST.md` |
