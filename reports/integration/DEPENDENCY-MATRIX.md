# DEPENDENCY MATRIX

**Prompt:** 00.1  
Evidence from `package.json`, `requirements.txt`, `pubspec.yaml`, `docker-compose.yml`, and source imports.

---

## Runtime stacks

| System | Language | Web framework | ORM / DB driver | Evidence |
|---|---|---|---|---|
| A-local / A-github | TS 5.9 | Next **16.2.6** / React **19.2.6** | drizzle-orm 0.45.2 + **pg** 8.20.0 | `package.json` (SHA identical) |
| B knowledge | TS 5.8 | none (library) | drizzle-orm ^0.45.2 + **postgres** ^3.4.7 | `nihongobridge-knowledge/package.json` |
| B api/web/admin/ai | TS | Next **14.2.35** / React **18.3** | postgres.js (api/admin/ai) | each package.json |
| B etl | Python 3.11 (CI) | none | SQLAlchemy + asyncpg | `requirements.txt`, platform CI |
| B search | TS | **Fastify 5** | postgres.js + Meilisearch client | `nihongobridge-search/package.json` |
| B mobile | Dart 3.6 / Flutter 3.27 | Flutter | local SQLite (app code) | `pubspec.yaml` |

**Conflict:** Next 16 vs Next 14; `pg` vs `postgres`; React 19 vs 18. Direct B app copy **will not** typecheck on A without ADAPT/REWRITE.

---

## A dependencies (complete)

**prod:** dotenv 17.3.1, drizzle-orm 0.45.2, next 16.2.6, pg 8.20.0, react 19.2.6, react-dom 19.2.6  
**dev:** tailwind 4.1.17, drizzle-kit 0.31.10, eslint 9, typescript 5.9.3, types for node/pg/react

A GitHub AI provider uses **no npm LLM SDK** — `fetch` to OpenAI/Anthropic (`src/services/ai/llm-provider.ts`).

A has **no** jose, meilisearch, ioredis, next-auth.

---

## B extra runtimes A does not have

| Dependency | Used by | A equivalent | Class |
|---|---|---|---|
| `jose` | api/ai/admin auth | none | DEPRECATE as B auth; may ADAPT later for Bearer |
| `meilisearch` | api + search | SQL `similarity()` | DEPRECATE v1 |
| `ioredis` | api/ai cache & rate limit | none | UNVERIFIED need |
| `@aws-sdk/client-s3` | api storage | none | DEPRECATE unless audio phase |
| `@andresaya/edge-tts` | api TTS | A `/api/v2/audio/tts` unverified provider | UNVERIFIED |
| `postgres` (postgres.js) | B node packages | A uses `pg` | DEPRECATE for A |
| lxml, fugashi, unidic-lite | Python ETL | A TS stub parser | INTEGRATE algorithms, not Python runtime |
| minio SDK | ETL storage | none | DEPRECATE |
| Fastify | search service | Next route | DEPRECATE |
| Flutter | mobile | none in A | ADAPT later |
| Redis container | platform compose | none | DEPRECATE v1 |
| Meilisearch container | platform compose | none | DEPRECATE v1 |
| MinIO container | platform compose | none | DEPRECATE v1 |
| Mailhog | platform compose | none | IGNORE |
| Adminer | platform compose | none | IGNORE |
| Supabase JWT env | B auth | none | DEPRECATE |

---

## Import graph (verified)

```
A-github DictionaryService
  → @/db (pg Pool + schema)
  → etl/enrichment/conjugations.ts

B api lib/dictionary.ts
  → @nihongobridge/knowledge (file:../nihongobridge-knowledge)
  → @/lib/db (postgres.js)

B admin / B ai
  → @nihongobridge/knowledge (file:../)

B web
  → HTTP api-client (no knowledge package)

B mobile
  → HTTP api_endpoints.dart (unversioned /api)
```

B packages **file:../nihongobridge-knowledge** — they are not independently publishable without that sibling.

---

## Environment variables (names only)

| Var | A | B |
|---|---|---|
| `DATABASE_URL` | required (`src/db/index.ts` throws) | knowledge/api/admin/ai `.env.example` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | read in `llm-provider.ts` | AI package (tutor) |
| `SUPABASE_*` | unused | api/ai/admin |
| `ALLOW_INSECURE_USER_HEADER` | unused | api/ai `.env.example` |
| `ADMIN_DEMO_MODE` | unused | admin middleware |
| `REDIS_URL` | unused | api/ai |
| `MEILISEARCH_*` | unused | api/search |
| `MINIO_*` | unused | api/etl/platform |

A-local `.env` contains `DATABASE_URL` only (not logged).

---

## Deployment assumptions

| | A | B platform |
|---|---|---|
| App host | Next.js (Vercel-shaped, empty `next.config.ts`) | multiple Node services + Flutter |
| Data | one Postgres | Postgres + Redis + Meili + MinIO |
| CI | none in A tree | matrix checkout of **separate** GitHub repos (`ci.yml`) |

Class for B platform compose: **DEPRECATE** as A production topology. Postgres-only is KEEP for A.
