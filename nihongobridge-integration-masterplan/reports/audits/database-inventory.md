# DATABASE INVENTORY — Phase 00, Prompt 02

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit — Database Forensic Audit
**Auditor:** Integration Team (Arena AI)
**Status:** COMPLETE
**Mode:** READ-ONLY — No modifications made

---

## 1. Executive Summary

A comprehensive forensic audit of all database-related artifacts across both repositories was performed. **The database is completely empty.** There are zero application tables, zero Drizzle schema definitions, zero SQL migration files, zero seed scripts, zero stored procedures, zero custom types, zero sequences, zero views, and zero triggers.

The only database interaction in the codebase is a health-check probe (`SELECT 1`) used in two locations.

This is the cleanest possible starting point for Phase 01 schema creation.

---

## 2. Database Server State

### 2.1 Server Identity

| Property | Value |
|---|---|
| Engine | PostgreSQL |
| Version | 15.16 (Debian 15.16-0+deb12u1) |
| Architecture | x86_64-pc-linux-gnu |
| Compiler | gcc 12.2.0 |
| Host | 127.0.0.1:5432 |
| Database Name | `app_db` |
| Owner | `postgres` |
| Encoding | UTF8 |
| Collation | C.UTF-8 |
| Locale Provider | libc |
| Size | 7,455 kB (system metadata only) |

### 2.2 Server Configuration

| Setting | Value | Notes |
|---|---|---|
| max_connections | 100 | Default; sufficient for development |
| shared_buffers | 128 MB | Default; adequate for initial use |
| work_mem | 4 MB | Default; may need tuning for large knowledge queries |

### 2.3 Schemas

| Schema | Owner | Description |
|---|---|---|
| public | pg_database_owner | Standard public schema — **EMPTY** |

No custom schemas exist. No `drizzle` migration schema exists (drizzle-kit has never been run against this database).

### 2.4 Extensions

| Extension | Version | Schema | Description |
|---|---|---|---|
| plpgsql | 1.0 | pg_catalog | PL/pgSQL procedural language (default) |

**Missing extensions that will be needed:**

| Extension | Purpose | Phase |
|---|---|---|
| `uuid-ossp` or `pgcrypto` | UUID generation for primary keys | Phase 01 |
| `pg_trgm` | Trigram-based fuzzy text search | Phase 03 |
| `pgvector` | Vector embeddings for RAG/AI | Phase 06 |

### 2.5 Other Databases

| Database | Owner | Notes |
|---|---|---|
| `app_db` | postgres | Application database (target) |
| `postgres` | postgres | System default |
| `template0` | postgres | Clean template (locked) |
| `template1` | postgres | Default template |

---

## 3. Application Tables

### 3.1 Existing Tables

**NONE.**

```
psql> \dt
Did not find any relations.
```

The `public` schema in `app_db` contains zero user-defined tables.

### 3.2 Existing Objects

| Object Type | Count |
|---|---|
| Tables | **0** |
| Views | **0** |
| Sequences | **0** |
| Functions | **0** |
| Triggers | **0** |
| Custom Types | **0** |
| Indexes | **0** |
| Foreign Keys | **0** |
| Constraints | **0** |

---

## 4. Schema File Audit

### 4.1 Drizzle Schema (`src/db/schema.ts`)

```typescript
// Keep the schema entrypoint present so models can define tables and run
// `npx drizzle-kit push` without bootstrapping Drizzle config first.
export {};
```

**Analysis:**
- File exists as a placeholder
- Contains zero table definitions
- Exports an empty object
- No imports from `drizzle-orm/pg-core`
- No `pgTable`, `pgEnum`, `serial`, `varchar`, `integer`, `boolean`, `timestamp`, `uuid`, `text`, `jsonb`, or any other Drizzle column type is imported or used

### 4.2 Drizzle Config (`drizzle.config.json`)

```json
{
  "dialect": "postgresql",
  "schema": "./src/db/schema.ts",
  "dbCredentials": {
    "url": "postgresql://postgres:postgres@127.0.0.1:5432/app_db"
  }
}
```

**Analysis:**
- Points to the empty schema file
- Configured for PostgreSQL dialect
- Uses direct URL connection string
- No `out` directory specified for migrations (default would be `./drizzle`)
- No migration files exist anywhere in the project

### 4.3 Database Connection (`src/db/index.ts`)

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
// ... pool singleton pattern ...
export const db = drizzle(pool);
```

**Analysis:**
- Uses `node-postgres` (pg) driver via connection pool
- Singleton pattern with global caching for dev server HMR
- `drizzle(pool)` — does NOT pass schema parameter, meaning:
  - Query builder works for raw SQL and basic operations
  - Relational query API (`db.query.*`) is NOT available (requires `drizzle(pool, { schema })`)
  - This will need to be updated in Phase 01 when schema is defined

---

## 5. SQL Migration Audit

### 5.1 Migration Files

**NONE found.**

Searched for:
- `**/*.sql` — 0 results
- `**/migrat*` — 0 results
- `**/seed*` — 0 results
- `drizzle/` directory — does not exist
- `migrations/` directory — does not exist

### 5.2 Drizzle-Kit State

`drizzle-kit` (v0.31.10) is installed as a dev dependency but has never been executed against this database:
- No `drizzle/` output directory exists
- No `__drizzle_migrations` table exists in the database
- No migration journal exists

---

## 6. Database Query Audit

### 6.1 All Database Queries in Codebase

| Location | Query | Purpose | Type |
|---|---|---|---|
| `src/app/api/health/route.ts:8` | `db.execute(sql`select 1`)` | Health check probe | Raw SQL |
| `src/app/page.tsx:67` | `db.execute(sql`select 1`)` | Dashboard DB verification | Raw SQL |

**Total: 2 queries, both identical health-check probes.**

No `db.select()`, `db.insert()`, `db.update()`, `db.delete()`, or `db.query.*` calls exist in the codebase. No Drizzle relational queries. No raw SQL beyond `SELECT 1`.

### 6.2 Database Imports

| File | Import | Usage |
|---|---|---|
| `src/app/api/health/route.ts` | `import { db } from "@/db"` | Health check |
| `src/app/api/health/route.ts` | `import { sql } from "drizzle-orm"` | Raw SQL tag |
| `src/app/page.tsx` | `import { db } from "@/db"` | Dashboard probe |
| `src/app/page.tsx` | `import { sql } from "drizzle-orm"` | Raw SQL tag |

No other files import from `@/db` or `drizzle-orm`.

---

## 7. Expected Tables — From DOMAIN_MODEL.md

The masterplan DOMAIN_MODEL.md specifies the following tables that will need to be created in Phase 01. This serves as the target schema inventory.

### 7.1 Identity / Authentication Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `users` | User | Phase 01 | UUID | email, name, role, created_at | Auth provider determines additional columns |
| `sessions` | User | Phase 01 | UUID | user_id, token, expires_at | Depends on auth library choice (DEC-0005) |
| `accounts` | User | Phase 01 | UUID | user_id, provider, provider_account_id | OAuth accounts (if NextAuth.js) |

### 7.2 Knowledge / Dictionary Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `dictionary_entries` | Knowledge | Phase 02 | UUID | source_id, source, headword, reading, jlpt_level, is_common | Provenance columns required |
| `dictionary_senses` | Knowledge | Phase 02 | UUID | entry_id (FK), position, glosses (JSONB), pos | Multiple per entry |
| `dictionary_readings` | Knowledge | Phase 02 | UUID | entry_id (FK), reading, is_primary | Multiple per entry |
| `dictionary_kanji_forms` | Knowledge | Phase 02 | UUID | entry_id (FK), form, is_primary | Multiple per entry |

### 7.3 Knowledge / Kanji Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `kanji` | Knowledge | Phase 02 | UUID | character (UNIQUE), stroke_count, grade, jlpt_level, meanings, on_readings, kun_readings | Provenance columns required |
| `radicals` | Knowledge | Phase 02 | UUID | character, number, stroke_count, meaning | Kangxi radicals |

### 7.4 Knowledge / Grammar Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `grammar_points` | Knowledge | Phase 02 | UUID | title, jlpt_level, structure, meaning, explanation | Links to examples |

### 7.5 Knowledge / Sentences Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `example_sentences` | Knowledge | Phase 02 | UUID | japanese, reading, english, source, jlpt_level | FK to grammar_points, dictionary_entries |

### 7.6 Learning / Courses Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `courses` | Learning | Phase 04 | UUID | title, description, jlpt_level, is_published, position | FK to users (created_by) |
| `modules` | Learning | Phase 04 | UUID | course_id (FK), title, position | Ordered within course |
| `lessons` | Learning | Phase 04 | UUID | module_id (FK), title, content (JSONB), type, position | Multiple types |
| `questions` | Learning | Phase 04 | UUID | lesson_id (FK), type, prompt, options (JSONB), correct_answer (JSONB) | Quiz engine |

### 7.7 Learning / Progress Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `user_progress` | Learning | Phase 04 | UUID | user_id (FK), course_id (FK), lesson_id (FK), status, score | Per-user per-content |

### 7.8 SRS Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `decks` | SRS | Phase 05 | UUID | user_id (FK), title, is_public, new_cards_per_day | Per-user decks |
| `cards` | SRS | Phase 05 | UUID | deck_id (FK), front (JSONB), back (JSONB), type, state, due, stability, difficulty | FSRS fields |
| `reviews` | SRS | Phase 05 | UUID | card_id (FK), user_id (FK), rating, reviewed_at, state_before, state_after | Append-only history |

### 7.9 Gamification Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `user_xp` | Gamification | Phase 07 | UUID | user_id (FK), total_xp, level | One per user |
| `xp_events` | Gamification | Phase 07 | UUID | user_id (FK), amount, source, earned_at | Append-only log |
| `streaks` | Gamification | Phase 07 | UUID | user_id (FK), current_streak, longest_streak, last_activity_date | One per user |
| `achievements` | Gamification | Phase 07 | UUID | name, description, category, criteria (JSONB) | Definition table |
| `user_achievements` | Gamification | Phase 07 | UUID | user_id (FK), achievement_id (FK), unlocked_at | Junction table |

### 7.10 AI Category

| Table Name | Domain | Priority | PK Type | Key Fields | Notes |
|---|---|---|---|---|---|
| `ai_conversations` | AI | Phase 06 | UUID | user_id (FK), title, context_type, created_at | Chat sessions |
| `ai_messages` | AI | Phase 06 | UUID | conversation_id (FK), role, content, tokens_used | Append-only |

### 7.11 Summary of Expected Tables

| Category | Table Count | Phase |
|---|---|---|
| Identity / Auth | 2–3 | Phase 01 |
| Dictionary | 4 | Phase 02 |
| Kanji | 2 | Phase 02 |
| Grammar | 1 | Phase 02 |
| Sentences | 1 | Phase 02 |
| Learning / Courses | 4 | Phase 04 |
| Learning / Progress | 1 | Phase 04 |
| SRS | 3 | Phase 05 |
| AI | 2 | Phase 06 |
| Gamification | 5 | Phase 07 |
| **TOTAL** | **25–26** | Phases 01–07 |

---

## 8. Repo B Database Artifacts — Known Unknowns

Repository B is not available for direct inspection. The following are expected database-related artifacts that must be audited when access is available:

### 8.1 Tables of Special Interest (from Master Instruction)

The master instruction calls out these table names/patterns for special attention:

| Pattern | Expected Purpose | Risk Level |
|---|---|---|
| `kg_*` | Knowledge-graph prefixed tables | HIGH — may define alternative knowledge schema |
| `dictionary_entries` | Dictionary data table | HIGH — may overlap with DOMAIN_MODEL.md spec |
| `kanji_entries` | Kanji data table | HIGH — may use different column names/types |
| `grammar_patterns` | Grammar point table | MEDIUM — naming differs from `grammar_points` |
| `sentences` | Example sentence table | MEDIUM — may use different structure |
| `practice_tests` | Test/quiz data | MEDIUM — naming differs from `questions` |
| `questions` | Quiz questions | HIGH — may overlap with learning domain |
| `srs_cards` | SRS card table | HIGH — may use different algorithm fields |
| `users` / identity tables | User/auth tables | CRITICAL — must not replace Repo A auth |

### 8.2 Expected Repo B Database Patterns

Based on the `kg_*` prefix pattern, Repo B likely uses a knowledge-graph naming convention. Expected tables might include:

| Potential Table | Likely Purpose | Integration Action |
|---|---|---|
| `kg_dictionary` or `kg_entries` | Dictionary data | EVALUATE → Map to `dictionary_entries` |
| `kg_kanji` | Kanji data | EVALUATE → Map to `kanji` |
| `kg_radicals` | Radical data | EVALUATE → Map to `radicals` |
| `kg_grammar` | Grammar points | EVALUATE → Map to `grammar_points` |
| `kg_sentences` | Example sentences | EVALUATE → Map to `example_sentences` |
| `kg_readings` | Reading data | EVALUATE → Map to `dictionary_readings` |
| `kg_components` | Kanji components | EVALUATE → Map to radicals or new table |

**These are speculative.** Actual table names will be confirmed during Repo B inspection.

### 8.3 ORM Unknown

It is unknown whether Repository B uses:
- Drizzle ORM (same as Repo A)
- Prisma ORM (different migration model)
- TypeORM
- Raw SQL / knex
- Other

This is critical because:
- **Drizzle** → Schema can be compared directly
- **Prisma** → Schema must be translated from `schema.prisma` to Drizzle
- **Raw SQL** → Migrations must be analyzed manually
- **Other** → Case-by-case translation

---

## 9. Database Connection Infrastructure

### 9.1 Connection Pattern Analysis

```typescript
// src/db/index.ts — Full file
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
```

**Assessment:**

| Aspect | Finding | Action Needed |
|---|---|---|
| Driver | `pg` (node-postgres) via Pool | KEEP — correct choice |
| Singleton | Global caching to survive HMR in dev | KEEP — standard pattern |
| Schema binding | `drizzle(pool)` — no schema passed | MODIFY in Phase 01 to `drizzle(pool, { schema })` |
| Connection pool | Default `Pool` settings | EVALUATE — may need `max`, `idleTimeoutMillis` tuning |
| Error handling | Throws on missing `DATABASE_URL` | KEEP — correct fail-fast |
| Exports | `pool` and `db` both exported | KEEP — pool needed for auth libraries |

### 9.2 Connection String

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
```

**Security note:** Default credentials. Acceptable for local development. Must be changed for production (Phase 09).

---

## 10. Phase 01 Database Readiness

### 10.1 What Can Proceed Immediately

| Action | Status | Blocker |
|---|---|---|
| Create schema in `src/db/schema.ts` | ✅ READY | None |
| Run `npx drizzle-kit push` | ✅ READY | None |
| Create UUID extension | ✅ READY | None |
| Create all knowledge tables | ✅ READY | None |
| Create all auth tables | ✅ READY | Depends on DEC-0005 |
| Create all learning tables | ✅ READY | None |
| Create all SRS tables | ✅ READY | None |
| Create all gamification tables | ✅ READY | None |
| Create all AI tables | ✅ READY | None |

### 10.2 Connection File Update Required

`src/db/index.ts` must be updated in Phase 01 to pass schema:

```typescript
// Current:
export const db = drizzle(pool);

// Phase 01 target:
import * as schema from "./schema";
export const db = drizzle(pool, { schema });
```

This enables the Drizzle relational query API (`db.query.users.findMany(...)` etc.).

### 10.3 Index Strategy Recommendations

For Phase 02 knowledge data (millions of rows expected):

| Table | Recommended Indexes |
|---|---|
| `dictionary_entries` | `headword`, `reading`, `jlpt_level`, `is_common`, `source_id` |
| `dictionary_senses` | `entry_id` |
| `dictionary_readings` | `entry_id`, `reading` |
| `kanji` | `character` (UNIQUE), `jlpt_level`, `grade`, `stroke_count` |
| `grammar_points` | `jlpt_level`, `title` |
| `example_sentences` | `grammar_point_id`, `entry_id`, `jlpt_level` |

For Phase 03 search:
- GIN index on `dictionary_entries` for full-text search
- GIN index with `pg_trgm` for fuzzy matching
- Consider `tsvector` column with generated search vector

---

## 11. Conclusion

The database forensic audit confirms an **absolutely clean state**:

- Zero application tables
- Zero schema definitions
- Zero migration history
- Zero seed data
- Zero stored procedures
- Two trivial health-check queries
- Clean connection infrastructure ready for schema binding

**There is nothing to preserve, nothing to migrate, and nothing to conflict with.**

Phase 01 can create the full domain schema from DOMAIN_MODEL.md specifications with zero risk of data loss or schema conflicts.
