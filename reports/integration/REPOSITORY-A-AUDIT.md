# REPOSITORY A — Forensic Audit

**Prompt:** 00.1  
**Date:** 2026-03-25  
**Method:** `git clone --depth 1` + file content inspection (not filename inference).  
**GitHub:** https://github.com/ranimony-afk/nihingobridgeupgrade  
**HEAD:** `4a7edcc2dfcdf6681c8111f566f5094848967723` (2026-09-12 08:33:55 +0530)  
**Working copy:** this sandbox (also named `nextjs-postgresql-template`)  
**Production code modified this prompt:** none

---

## 0. Two trees that both claim to be A

SHA-256 comparison of matching paths:

| Path | Local sandbox | GitHub A `main` |
|---|---|---|
| `src/app/api/health/route.ts` | `85ecde9d…` | **identical** |
| `package.json` | `97d92519…` | **identical** |
| `src/db/schema.ts` | `e93d93c0…` (4 lines, `export {}`) | `75dea382…` (2081 lines, 39 tables) |
| `src/db/index.ts` | `drizzle(pool)` no schema | `drizzle(pool, { schema })` |
| `src/app/page.tsx` | Arena starter | Integration control tower |
| `src/app/layout.tsx` | “Arena Next.js PostgreSQL Starter” | “NihongoBridge — Integration Control Tower” |

**Evidence:** `sha256sum` of both trees; `diff -u` on health route → IDENTICAL.

This audit therefore describes:

1. **A-local** — currently buildable production working copy  
2. **A-github** — canonical GitHub tree

They share stack and healthcheck. They do **not** share schema, APIs, or UI.

---

## 1. Directory structure (A-github, 143 files)

```
package.json, tsconfig.json, next.config.ts, drizzle.config.json,
eslint.config.mjs, postcss.config.mjs
src/app/{page,layout,globals,docs,api}
src/db/{index,schema}
src/services/{knowledge,learning,srs,ai,gamification}
etl/{adapters,sources,parsers,transforms,validators,matching,
     enrichment,exports,provenance,pipelines,tests}
nihongobridge-integration-masterplan/
```

**Absent on both trees:** `.gitignore`, `README.md`, `LICENSE`, `.env.example`, `middleware.ts`, `src/repositories/`, `mobile/`.

**A-local extra:** `.env` (platform), `package-lock.json`, prior `reports/` and `docs/` from Phase 00.

---

## 2. Package manifest (content)

`package.json` name: `nextjs-postgresql-template` (not `nihongobridge`).

| Field | Value | Evidence |
|---|---|---|
| next | 16.2.6 | `package.json` dependencies |
| react / react-dom | 19.2.6 | same |
| drizzle-orm | 0.45.2 | same |
| pg | 8.20.0 | same |
| Scripts | `dev build start lint typecheck` | no `test` script |
| Auth libs | none | no jose, next-auth, lucia, supabase |
| Search libs | none | no meilisearch |
| LLM SDKs | none | OpenAI/Anthropic called via `fetch` in llm-provider |

`next.config.ts` is empty config object — identical local and GitHub A.

`drizzle.config.json` points at `./src/db/schema.ts` and hardcoded `postgresql://postgres:postgres@127.0.0.1:5432/app_db`.

---

## 3. TypeScript project

- App Router under `src/app`
- `@/*` → `src/*` (`tsconfig.json`)
- ETL is TypeScript next to the app (`etl/`), imported from dictionary service:

```
from "../../../etl/enrichment/conjugations"
```

in `src/services/knowledge/dictionary.ts` (content-verified import).

No Python, no Dart in Repository A.

---

## 4. Database schema (content-verified)

### A-local

`src/db/schema.ts`:

```
export {};
```

Zero `pgTable` calls.

### A-github — 39 tables, 15 enums

Parsed from `src/db/schema.ts` via `export const X = pgTable("y"`:

**Knowledge:** `source_provenance`, `dictionary_entries`, `dictionary_senses`, `dictionary_readings`, `kanji_entries`, `kanji_readings`, `kanji_components`, `kanji_component_links`, `grammar_patterns`, `grammar_examples`, `sentences`, `sentence_translations`

**Learning:** `courses`, `course_modules`, `lessons`, `lesson_items`, `learning_content`

**Assessment:** `practice_tests`, `test_sections`, `questions`, `question_options`, `test_sessions`, `test_answers`, `test_results`

**SRS:** `srs_decks`, `srs_cards`, `srs_reviews`, `srs_algorithm_state`

**Progress / game:** `user_progress`, `lesson_progress`, `vocabulary_progress`, `kanji_progress`, `grammar_progress`, `xp_events`, `achievements`, `user_achievements`, `streaks`, `daily_goals`, `user_bookmarks`

**PK convention (content):** `id: text("id").primaryKey()` — application-generated text, not uuid.

**JLPT (content):** `jlptLevel: smallint("jlpt_level")` on dictionary/kanji. Validator `validateJlptLevel` in `etl/validators/common.ts` accepts integers 1–5 (`etl/tests/pipeline.test.ts` asserts 0 and 6 rejected).

**Identity:** no `users` / `sessions` / `accounts` table. Comments say `learnerId` “may point to identity_users” — those tables are **not defined**. Classification: identity is **UNVERIFIED / missing**.

**pg_trgm:** `DictionaryService` calls SQL `similarity(...)` (`src/services/knowledge/dictionary.ts` ~line 343). `schema.ts` contains **no** `gin_trgm_ops` index and **no** `CREATE EXTENSION`. Extension enablement is **UNVERIFIED**.

**kg_* tables:** schema header says “DO NOT remove kg_* tables if they exist”. No `kg_` `pgTable` exists in this file. Treat as historical comment, not evidence of tables.

`src/db/index.ts` on GitHub A: `drizzle(pool, { schema })`. Local omits schema.

---

## 5. API routes (content-verified HTTP methods)

### A-local (buildable now)

| Method | Path | Body evidence |
|---|---|---|
| GET | `/api/health` | `db.execute(sql\`select 1\`)` then `{ ok: true }` |

### A-github — 31 `route.ts` files

Inspected `export async function GET|POST|PUT|DELETE`.

Public infra: `GET /api/health` (identical to local), `GET /api/masterplan`.

v1: `GET /api/v1/tutor/grammar-explain`.

v2 domain (no auth checks in route files): dictionary search/detail, kanji, grammar, knowledge, courses CRUD, lessons play/submit, quiz generate, jlpt, tests, listening, vocabulary, progress, srs + review + sync, xp, streaks, achievements, audio/tts.

AI: `POST /api/ai/chat`, `GET|POST /api/ai/tutor`, `GET /api/ai/explain/grammar/[id]`.

**Dictionary search is real, not a filename stub:** `src/app/api/v2/dictionary/search/route.ts` imports `DictionaryService.search` and returns `{ success, data, meta }`.

**Auth on routes:** none. No `authenticateRequest`, no Bearer parse. Mutating POSTs are open.

---

## 6. Services (content, not names)

| Module | Path | Verified behaviour | Class |
|---|---|---|---|
| Dictionary | `src/services/knowledge/dictionary.ts` | Drizzle select + `similarity()` SQL | KEEP |
| Kanji / grammar | `src/services/knowledge/*.ts` | DB-backed | KEEP |
| Course/lesson/progress/jlpt/test/listening/vocab | `src/services/learning/*.ts` | Import `db` from `@/db` (except quiz-engine) | KEEP |
| QuizEngine | `src/services/learning/quiz-engine.ts` | **No `db` import.** Pure generate/grade types | KEEP (engine only) |
| SRSAlgorithm | `src/services/srs/algorithm.ts` | Pure FSRS-5 + SM-2 math, documented weights | KEEP |
| ReviewSession | `src/services/srs/review-session.ts` | In-process `Map` store (comment says Redis later) | ADAPT |
| XP/streaks/achievements | `src/services/gamification/*` | Present | KEEP |
| LLM | `src/services/ai/llm-provider.ts` | `fetch` to OpenAI/Anthropic; if no key, **mock provider** logs `No API key configured` | KEEP + mock fallback |
| RAG | `src/services/ai/knowledge-retrieval.ts` | Intended to read platform knowledge | KEEP |

---

## 7. ETL (content)

`etl/README.md` states adaptation from Repo B Python.

`etl/sources/registry.ts` registers licensed sources with SPDX, URLs, target tables:

| Source id | Status in registry (content) |
|---|---|
| jmdict | `draft` — note: “XML SAX parser pending” |
| jmnedict, kanjidic2, radkfile, tatoeba_*, jlpt_*, frequency_corpus, grammar_manual, kanjivg, kradfile, jmdict_multilingual | `planned` |

`etl/pipelines/jmdict.ts` `stageParse` **content**:

```
console.log("XML parser not yet implemented — yielding 0 records")
```

`etl/parsers/` contains only `base.ts` (interface). No SAX implementation.

`etl/tests/pipeline.test.ts` uses `node:test` and tests validators only — **not wired** in `package.json` scripts.

Classification: ETL **framework KEEP**, parsers **REWRITE** (implement) using B Python as source.

---

## 8. Search

No Meilisearch dependency. Search is SQL in `DictionaryService` (exact / prefix / fuzzy via `similarity`). Requires `pg_trgm` at runtime — **UNVERIFIED** that extension is installed in the sandbox DB.

---

## 9. AI

`llm-provider.ts` uses raw `fetch`, not SDKs. Mock tutor if keys missing. Knowledge retrieval module exists. No production key in repo (none found in source).

---

## 10. Mobile / web / admin (A)

- **Mobile:** no Flutter tree. `GET|POST /api/v2/srs/sync` exists as a sync contract sketch.
- **Web:** control-tower `src/app/page.tsx` (624 lines on GitHub) + `src/app/docs/*`. Not a learner dictionary UI.
- **Admin:** no `/api/admin`, no CMS pages.

---

## 11. Tests

Only `etl/tests/pipeline.test.ts`. No Vitest. `package.json` has no `test` script. App routes untested in-repo.

---

## 12. Configuration / deployment

- No `.gitignore` on GitHub A root (`ls /tmp/repo-a` — not present).
- No Vercel/GitHub Actions in A tree.
- Deploy model implied by Next.js App Router + `DATABASE_URL`.
- `drizzle.config.json` embeds local postgres URL (not a secret, default sandbox DSN).

---

## 13. Documentation

`nihongobridge-integration-masterplan/` is extensive. `reports/audits/*` inside it assumed empty A and missing B — **stale vs current GitHub A content**. TARGET_ARCHITECTURE.md says “0 tables” which contradicts `schema.ts` (2081 lines).

---

## 14. Classification summary (A)

| Component | Class | Why (evidence) |
|---|---|---|
| `GET /api/health` | KEEP | Identical SHA local/GitHub; `select 1` |
| Stack (Next 16, Drizzle, pg) | KEEP | `package.json` |
| A-local empty schema | ADAPT | Must receive GitHub A tables additively |
| A-github `schema.ts` | KEEP | Canonical 39-table model |
| Domain services + `/api/v2` | KEEP | Real Drizzle usage |
| QuizEngine | KEEP | Pure engine, no DB |
| SRS FSRS math | KEEP | `algorithm.ts` |
| SRS in-memory Map | ADAPT | `review-session.ts` |
| ETL registry / pipeline base | KEEP | `etl/sources/registry.ts` |
| JMdict parser | REWRITE | stub yields 0 records |
| Auth | REWRITE | absent |
| `.gitignore` | REWRITE | absent |
| Stale masterplan audits | DEPRECATE | contradict current tree |
| kg_* comment | IGNORE | no tables in file |
| pg_trgm extension | UNVERIFIED | used in SQL, not in schema |
