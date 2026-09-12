# REPOSITORY B — Forensic Audit

**Prompt:** 00.1  
**Date:** 2026-03-25  
**GitHub:** https://github.com/ranimony-afk/Knowledge-base-NihongoBridge  
**HEAD:** `0fa43c07d8ddb69e5d377f233f7e7fbb2790bfbc` (2026-08-19 09:39:00 +0530)  
**Role:** source / feature / data — **not** production target  
**File count:** 594 (excluding `.git`, `node_modules`, `.dart_tool`)

Inspection used file **contents** (parsers, SQL, JWT verify, demo fallbacks), not directory names.

---

## 1. Directory structure (packages)

| Package | Type | Manifest evidence |
|---|---|---|
| `nihongobridge-knowledge` | Drizzle schema library | `package.json` name `@nihongobridge/knowledge`, exports `./lib/index.js` |
| `nihongobridge-api` | Next.js 14 API app | `"next": "14.2.35"`, `"jose"`, `"meilisearch"`, `"ioredis"` |
| `nihongobridge-web` | Next.js 14 learner UI | no drizzle; `zustand`, `@tanstack/react-query` |
| `nihongobridge-admin` | Next.js 14 CMS | `@nihongobridge/knowledge`, `jose`, tiptap, dnd-kit |
| `nihongobridge-ai` | Next.js 14 AI app | `jose`, `ioredis`, markdown |
| `nihongobridge-etl` | Python | `pyproject.toml` + `requirements.txt` (lxml, sqlalchemy, fugashi, edge-tts, minio) |
| `nihongobridge-search` | Fastify + Meilisearch | `search/http/server.ts` |
| `nihongobridge-mobile` | Flutter | `pubspec.yaml` sdk `>=3.6.0 <4.0.0` |
| `nihongobridge-platform` | Docker / CI | `docker-compose.yml`, `.github/workflows/ci.yml` |

Also present: `.config/flutter`, `.dart-tool`, `.dartServer` (tooling debris — IGNORE).

There is **no root package.json** workspace. Packages are siblings, not a compiled monorepo.

CI (`.github/workflows/ci.yml`) checks out **separate GitHub repos** named `nihongobridge-${component}` — this combined repo may be a snapshot, not how CI originally ran. Treat CI as **UNVERIFIED** for this tree.

---

## 2. Knowledge schema (content)

`nihongobridge-knowledge/schema/*.ts` + compiled `lib/*.js`.

PK: `uuid("id").primaryKey().defaultRandom()` — **verified** in `schema/users.ts`, `schema/dictionary.ts`.

Tables (from `pgTable("` strings):

- `dictionary_entries` — denormalized `word`/`kana`/`romaji`, JSON `meanings`/`furigana`, GIN `pg_trgm` + FTS indexes **declared in schema**
- `kanji_entries`, `grammar_patterns`, `sentences`, `media_assets`
- 9 link tables in `schema/relations.ts`
- `srs_decks`, `srs_cards`, `srs_review_logs` — SM-2 fields; composite FK card→deck+user
- `practice_tests`, `questions`, `test_sessions`
- `users`, `user_progress`, `user_bookmarks`

Migrations: `drizzle/0000_remarkable_frightful_four.sql`, `drizzle/0001_narrow_apocalypse.sql` (`drizzle/meta/_journal.json`).

README (`nihongobridge-knowledge/README.md`) documents N5 seed: 5 words, 5 kanji, 3 grammar, 2 questions — **fixture**, not full JMdict.

`users` has email/username/xp/streak — **no password hash**. Identity is external.

Admin extra (`nihongobridge-admin/schema/admin.ts`): `admin_user_roles`, `admin_audit_logs`, `content_reviews`, `etl_pipeline_runs`, `etl_schedules`, `blog_posts`.

AI extra (`nihongobridge-ai/schema/ai.ts`): `ai_explanations`.

---

## 3. API (content)

`nihongobridge-api/app/api/**/route.ts` — unversioned `/api/...`.

Dictionary search (`app/api/dictionary/search/route.ts`):

- Zod validation
- `rateLimit` + Redis cache (`withCache`)
- Calls `searchDictionary` from `lib/search.ts`
- Sets header `X-Search-Engine`

`lib/search.ts` **content:** tries Meilisearch first; on failure logs `using PostgreSQL fallback`; returns `engine: "meilisearch" | "postgresql"`.

`lib/dictionary.ts` **content:** Drizzle queries against `@nihongobridge/knowledge` tables, hydrates sentences/kanji/grammar via link tables. **Real DB access, not a stub.**

`lib/srs.ts` **content:** `calculateSm2Schedule` mutates ease 1.3–2.5; `getDueCards` queries `srs_cards`.

Auth (`lib/auth.ts` **content**): `jose` `jwtVerify` with `SUPABASE_JWT_SECRET` HS256 or JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Dev bypass: `x-user-id` when `ALLOW_INSECURE_USER_HEADER=true` (listed in `.env.example`).

**No `/api/mobile/*` routes** exist under `app/api` (find returned none). Flutter still references them — see mobile.

Tests: `tests/routes.test.ts`, `srs.test.ts`, `session.test.ts`, `scoring.test.ts`, `validation.test.ts`, `cache.test.ts`, `rate-limit.test.ts`, `test-routes.test.ts` (Vitest).

---

## 4. Web (content)

Pages: `app/dictionary/page.tsx`, `app/kanji/[character]/page.tsx`, `app/dashboard/page.tsx`, `app/srs/demo/page.tsx`, `app/test/[sessionId]/{page,results,review}/page.tsx`.

`lib/api-client.ts` **content:** `if (isDemo(sessionId))` loads `demo-session.ts` fixtures (hardcoded N3 passage and questions tagged `"demo"`). Production path hits API; demo path is **fixture UI**.

No auth library in `nihongobridge-web/package.json`.

---

## 5. Admin (content)

`middleware.ts` **content:**

- If `ADMIN_DEMO_MODE === "true"` OR (non-production and not `"false"`), injects hardcoded UUID `00000000-0000-4000-8000-000000009001` as `super_admin`.
- Else verifies Supabase JWT, maps `app_metadata.role`.
- Sets `x-admin-user-id` / `x-admin-role` headers.

`lib/auth.ts` reads those headers (`adminContext()`). **Not a password login implementation** — JWT or demo.

Pages: dictionary/kanji/questions/tests/etl/blog/media managers.

---

## 6. AI (content)

Routes: `POST /api/ai/tutor/chat`, `grammar-explain`, `translate`, `generate-questions`.  
`app/api/ai/tutor/route.ts` exports **no HTTP method** (186 bytes) — placeholder.

`lib/dictionary-tool.ts` **content:** tool `lookup_dictionary` HTTP GETs `/api/dictionary/search` on a base URL — RAG-style **platform dictionary**, not a raw LLM hallucination path. KEEP pattern.

`lib/auth.ts` is a third copy of Supabase JWT + insecure header.

Tests: grounding, prompts, anthropic-tools, rate-limit, tutor-client, validation, cache-key.

---

## 7. ETL Python (content)

`etl/parsers/jmdict_parser.py` **content:** `lxml.etree` streaming parse, dataclasses `JMdictEntry`, gzip open, entity handling. **This is a real parser**, unlike A-github’s stub.

Also present: `jmdict_transformer.py`, `jmdict_pipeline.py`, `tatoeba_stager.py`, `tatoeba_pipeline.py`, enrichers (jlpt, frequency, furigana, content_matcher), question generators, TTS pipeline, MinIO client.

Tests: `tests/test_jmdict_parser_transformer.py`, tatoeba, enrichers, generators, minio, downloader, checkpoint.

`requirements.txt`: SQLAlchemy, asyncpg, lxml, fugashi+unidic-lite, edge-tts, minio, httpx.

---

## 8. Search service (content)

`search/http/server.ts`: Fastify, CORS, `GET /health` (Meilisearch health), `GET /autocomplete`, `GET /search`. Timeout 5s. Depends on Meilisearch client.

`docker-compose.yml` in search package + platform compose runs `getmeili/meilisearch`.

Japanese helpers: `search/lib/japanese.ts` (tested in `tests/japanese.test.ts`).

---

## 9. Mobile Flutter (content)

`pubspec.yaml`: `nihongobridge_mobile` 0.1.0+1, Flutter ≥3.27.

`lib/core/api/api_endpoints.dart` **content:**

```
/api/dictionary/search
/api/mobile/bootstrap/dictionary   ← NOT in B API tree
/api/kanji/search
/api/srs/due
/api/srs/review
/api/tests/start
/api/mobile/sync                   ← NOT in B API tree
/api/ai/tutor/chat
/api/tests/session/:id
```

Features: dictionary, kanji, grammar, SRS flip card, tests, dashboard, AI tutor screens; SQLite local DB + DAOs; sync service; `auth_token_store.dart`.

Tests: widget/unit for flip card, ruby text, local db, models, theme, api_exception — **not** full API contract tests.

Missing mobile endpoints = **UNVERIFIED / gap**.

---

## 10. Platform / deployment (content)

`nihongobridge-platform/docker-compose.yml` services: postgres 15, redis 7, meilisearch, minio + mc init, mailhog, adminer. **Not** Vercel. Multi-service local platform.

Postgres init script path: `docker/postgres/init`.

`.env.example` files in api/admin/ai/etl/knowledge/platform/search/web.

A’s deploy model (single Next + Postgres) **conflicts** with this compose.

---

## 11. Classification summary (B)

| Component | Class | Evidence |
|---|---|---|
| knowledge schema | ADAPT | UUID vs A text PK; do not apply SQL |
| knowledge drizzle SQL | DEPRECATE | competing migrations |
| knowledge N5 seed | IGNORE | tiny fixture (`README.md`) |
| API dictionary/kanji/grammar handlers | ADAPT | real Drizzle; remap to `/api/v2` |
| API `lib/search.ts` Meili path | DEPRECATE | A uses SQL |
| API PostgreSQL fallback in search | INTEGRATE | idea already in A |
| API `lib/srs.ts` SM-2 | ADAPT | A already has FSRS-5 primary |
| API auth.ts | DEPRECATE | Supabase JWT + header bypass |
| API tests | INTEGRATE | contract tests after API freeze |
| web pages | ADAPT | later UI against A APIs |
| web `demo-*.ts` | IGNORE | fixtures tagged `"demo"` |
| admin CMS UI | ADAPT | later admin phase |
| admin demo middleware | DEPRECATE | auto super_admin in non-prod |
| admin schema | INTEGRATE | additive tables later |
| AI dictionary-tool | INTEGRATE | platform lookup pattern |
| AI auth copies | DEPRECATE | same JWT |
| AI empty tutor route | IGNORE | no HTTP export |
| Python JMdict parser | INTEGRATE | real lxml parser |
| Python Tatoeba / enrichers / generators | INTEGRATE | tested |
| MinIO client | DEPRECATE | not A deploy |
| Fastify search server | DEPRECATE | extra runtime |
| `search/lib/japanese.ts` | INTEGRATE | tested helpers |
| Flutter app | ADAPT | Phase 08; retarget `/api/v2` |
| Flutter `/api/mobile/*` | UNVERIFIED | endpoints missing in API |
| platform compose | DEPRECATE | Redis/Meili/MinIO/Mailhog |
| `.dart-tool` / `.config` | IGNORE | tooling |
| CI workflows | UNVERIFIED | expect split repos |
