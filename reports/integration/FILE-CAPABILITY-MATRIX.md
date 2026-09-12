# FILE–CAPABILITY MATRIX

**Prompt:** 00.1  
Every row is backed by an inspected path. Classes: KEEP | INTEGRATE | ADAPT | REWRITE | DEPRECATE | IGNORE | UNVERIFIED

---

## Repository A — local working copy

| Path | Capability | Class | Evidence |
|---|---|---|---|
| `src/app/api/health/route.ts` | Infra health | KEEP | `sql\`select 1\``; SHA identical to GitHub A |
| `src/db/index.ts` | Postgres pool | KEEP | `drizzle-orm/node-postgres` + `pg.Pool` |
| `src/db/schema.ts` | Schema entry | ADAPT | file is `export {}` only |
| `src/app/page.tsx` | Homepage | ADAPT | “Arena Next.js PostgreSQL Starter” |
| `src/app/layout.tsx` | Root layout | ADAPT | starter metadata |
| `package.json` | Stack | KEEP | next 16.2.6, drizzle 0.45.2, pg 8.20.0 |
| `drizzle.config.json` | Drizzle kit | KEEP | schema path + local DSN |

---

## Repository A — GitHub tree (not in local `src/` except health)

| Path | Capability | Class | Evidence |
|---|---|---|---|
| `src/db/schema.ts` | Canonical data model | KEEP | 39 `pgTable`, text PKs |
| `src/services/knowledge/dictionary.ts` | Dictionary + fuzzy search | KEEP | Drizzle + `similarity()` |
| `src/services/knowledge/kanji.ts` | Kanji | KEEP | DB import |
| `src/services/knowledge/grammar.ts` | Grammar | KEEP | DB import |
| `src/services/learning/course-engine.ts` | Courses | KEEP | `import { db }` |
| `src/services/learning/lesson-player.ts` | Lessons | KEEP | `import { db }` |
| `src/services/learning/quiz-engine.ts` | Question types/grading | KEEP | no db; pure engine |
| `src/services/learning/jlpt-engine.ts` | JLPT | KEEP | `import { db }` |
| `src/services/learning/test-engine.ts` | Timed tests | KEEP | `import { db }` |
| `src/services/learning/listening.ts` | Listening | KEEP | `import { db }` |
| `src/services/learning/progress-engine.ts` | Progress | KEEP | `import { db }` |
| `src/services/learning/vocabulary-learning.ts` | Vocab learning | KEEP | `import { db }` |
| `src/services/srs/algorithm.ts` | FSRS-5 / SM-2 math | KEEP | documented weights array |
| `src/services/srs/service.ts` | SRS persistence | KEEP | uses schema tables |
| `src/services/srs/review-session.ts` | Live review session | ADAPT | in-memory `Map` |
| `src/services/srs/sync.ts` | Mobile sync contract | KEEP | server-authoritative comment |
| `src/services/gamification/*` | XP/streaks/achievements | KEEP | service modules present |
| `src/services/ai/llm-provider.ts` | LLM gateway | KEEP | fetch OpenAI/Anthropic; mock fallback |
| `src/services/ai/knowledge-retrieval.ts` | RAG from platform | KEEP | module present |
| `src/app/api/v2/dictionary/search/route.ts` | HTTP dictionary | KEEP | calls DictionaryService |
| `src/app/api/v2/srs/review/route.ts` | HTTP SRS review | KEEP | unauthenticated (risk) |
| `src/app/api/ai/*` | HTTP tutor | KEEP | routes exist |
| `etl/sources/registry.ts` | License-aware sources | KEEP | CC-BY-SA JMdict entry |
| `etl/pipelines/jmdict.ts` | JMdict import | REWRITE | yields 0 records |
| `etl/parsers/base.ts` | Parser interface | KEEP | interface only |
| `etl/tests/pipeline.test.ts` | Validator unit tests | KEEP | `node:test`; not in npm scripts |
| `nihongobridge-integration-masterplan/reports/audits/*` | Old Phase 00 | DEPRECATE | claims empty A / missing B |
| `src/app/page.tsx` (GitHub) | Control tower UI | ADAPT | phase board, not learner app |

---

## Repository B

| Path | Capability | Class | Evidence |
|---|---|---|---|
| `nihongobridge-knowledge/schema/dictionary.ts` | Dict table | ADAPT | uuid PK, `word` not `headword` |
| `nihongobridge-knowledge/schema/kanji.ts` | Kanji table | ADAPT | uuid, JSON meanings |
| `nihongobridge-knowledge/schema/grammar.ts` | Grammar table | ADAPT | JSON examples |
| `nihongobridge-knowledge/schema/sentences.ts` | Sentences | ADAPT | JSON translations |
| `nihongobridge-knowledge/schema/srs.ts` | SRS SM-2 tables | ADAPT | FK to `users` |
| `nihongobridge-knowledge/schema/users.ts` | Profile + xp | ADAPT | no password columns |
| `nihongobridge-knowledge/schema/media.ts` | Media assets | INTEGRATE | missing on A |
| `nihongobridge-knowledge/schema/relations.ts` | Graph links | ADAPT | uuid bridges |
| `nihongobridge-knowledge/drizzle/*.sql` | Migrations | DEPRECATE | would collide on table names |
| `nihongobridge-knowledge/seeds/n5.ts` | N5 fixture | IGNORE | 5 words (README) |
| `nihongobridge-api/app/api/dictionary/search/route.ts` | Dict HTTP | ADAPT | zod + cache + Meili/SQL |
| `nihongobridge-api/lib/dictionary.ts` | Dict queries | ADAPT | real Drizzle joins |
| `nihongobridge-api/lib/search.ts` | Search backend | DEPRECATE Meili / INTEGRATE SQL fallback | Meili first then Postgres |
| `nihongobridge-api/lib/srs.ts` | SM-2 schedule | ADAPT | `calculateSm2Schedule` |
| `nihongobridge-api/lib/auth.ts` | JWT | DEPRECATE | Supabase HS256/JWKS |
| `nihongobridge-api/lib/testEngine.ts` | Test sessions | ADAPT | used by session routes |
| `nihongobridge-api/tests/*.ts` | API tests | INTEGRATE | Vitest |
| `nihongobridge-web/app/dictionary/page.tsx` | Learner dict UI | ADAPT | later |
| `nihongobridge-web/lib/demo-session.ts` | Demo test | IGNORE | `tags: ["demo"]` |
| `nihongobridge-admin/schema/admin.ts` | RBAC/ETL runs | INTEGRATE | later admin phase |
| `nihongobridge-admin/middleware.ts` | Admin gate | DEPRECATE | demo super_admin |
| `nihongobridge-ai/lib/dictionary-tool.ts` | Tool-calling dict | INTEGRATE | GET `/api/dictionary/search` |
| `nihongobridge-ai/lib/auth.ts` | JWT copy 3 | DEPRECATE | same pattern |
| `nihongobridge-etl/etl/parsers/jmdict_parser.py` | JMdict XML | INTEGRATE | lxml streaming |
| `nihongobridge-etl/etl/parsers/tatoeba_stager.py` | Tatoeba | INTEGRATE | present + tests |
| `nihongobridge-etl/etl/enrichers/*.py` | JLPT/freq/furigana | INTEGRATE | tested |
| `nihongobridge-etl/etl/generators/*.py` | Question gen | INTEGRATE | tested |
| `nihongobridge-etl/etl/storage/minio_client.py` | Object storage | DEPRECATE | MinIO |
| `nihongobridge-search/search/http/server.ts` | Autocomplete HTTP | DEPRECATE | Fastify+Meili |
| `nihongobridge-search/search/lib/japanese.ts` | Query normalize | INTEGRATE | unit tests |
| `nihongobridge-mobile/lib/core/api/api_endpoints.dart` | Client routes | ADAPT | includes missing `/api/mobile/*` |
| `nihongobridge-mobile/lib/core/db/local_db.dart` | Offline SQLite | INTEGRATE | later |
| `nihongobridge-mobile/lib/features/auth/auth_repository.dart` | Mobile auth | ADAPT | Bearer store |
| `nihongobridge-platform/docker-compose.yml` | Dev data plane | DEPRECATE | redis/meili/minio/mailhog |
| `.dart-tool`, `.config` | Tool cache | IGNORE | not source |
