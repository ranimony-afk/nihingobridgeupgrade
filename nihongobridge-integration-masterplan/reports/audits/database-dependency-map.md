# DATABASE DEPENDENCY MAP — Phase 00, Prompt 02

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit — Database Forensic Audit
**Auditor:** Integration Team (Arena AI)
**Status:** COMPLETE
**Mode:** READ-ONLY — No modifications made

---

## 1. Overview

This document maps every database dependency in the current codebase: which files touch the database, how they connect, what they query, and what the dependency chain looks like. It also maps the planned dependency structure for Phase 01+ based on DOMAIN_MODEL.md.

---

## 2. Current Dependency Map

### 2.1 Infrastructure Layer

```
.env
  └── DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app_db"
        │
        ▼
src/db/index.ts
  ├── imports: drizzle-orm/node-postgres (drizzle)
  ├── imports: pg (Pool)
  ├── reads: process.env.DATABASE_URL
  ├── creates: Pool (connection pool, singleton in dev)
  ├── exports: pool (Pool instance)
  └── exports: db (Drizzle instance)
        │
        ▼
src/db/schema.ts
  ├── imports: NOTHING
  ├── defines: NOTHING
  └── exports: {} (empty)
```

### 2.2 Consumer Layer

```
src/db/index.ts
  │
  ├──► src/app/api/health/route.ts
  │      ├── imports: db from @/db
  │      ├── imports: sql from drizzle-orm
  │      ├── executes: sql`select 1`
  │      └── purpose: Health check endpoint
  │
  └──► src/app/page.tsx
         ├── imports: db from @/db
         ├── imports: sql from drizzle-orm
         ├── executes: sql`select 1`
         └── purpose: Dashboard DB verification
```

### 2.3 Configuration Layer

```
drizzle.config.json
  ├── dialect: "postgresql"
  ├── schema: "./src/db/schema.ts"
  └── dbCredentials.url: "postgresql://postgres:postgres@127.0.0.1:5432/app_db"
        │
        └──► Used by: npx drizzle-kit push (CLI only, not runtime)
```

### 2.4 Package Dependencies

```
package.json
  ├── drizzle-orm: 0.45.2 ──► Runtime ORM (query builder, SQL tag, relations)
  ├── pg: 8.20.0 ──► PostgreSQL client library (connection, queries)
  ├── dotenv: 17.3.1 ──► Loads .env file (DATABASE_URL)
  └── drizzle-kit: 0.31.10 (dev) ──► Schema tooling (push, generate, migrate)
```

### 2.5 Complete Dependency Graph (Current)

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL                                      │
│                                                                   │
│  PostgreSQL 15.16 (127.0.0.1:5432/app_db)                       │
│  └── public schema (EMPTY)                                       │
└────────────────────────────┬──────────────────────────────────────┘
                             │ TCP connection
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                    INFRASTRUCTURE                                 │
│                                                                   │
│  .env ──► DATABASE_URL                                           │
│              │                                                    │
│              ▼                                                    │
│  src/db/index.ts                                                 │
│    ├── pg.Pool (connection pool)                                 │
│    └── drizzle(pool) → db                                       │
│              │                                                    │
│  src/db/schema.ts (EMPTY)                                        │
│              │                                                    │
│  drizzle.config.json                                             │
│    └── CLI tool config only                                      │
└────────────────────────────┬──────────────────────────────────────┘
                             │ import { db }
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                    CONSUMERS                                      │
│                                                                   │
│  src/app/api/health/route.ts ──► db.execute(sql`select 1`)      │
│  src/app/page.tsx ──► db.execute(sql`select 1`)                  │
│                                                                   │
│  (No other consumers exist)                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Planned Dependency Map (Phase 01+)

Based on DOMAIN_MODEL.md and TARGET_ARCHITECTURE.md, here is the intended dependency structure after schema is created.

### 3.1 Schema Layer (Phase 01)

```
src/db/schema.ts (Phase 01 target)
  │
  ├── imports: drizzle-orm/pg-core (pgTable, uuid, varchar, text, integer,
  │                                  boolean, timestamp, jsonb, pgEnum, etc.)
  │
  ├── defines auth tables:
  │     ├── users
  │     ├── sessions
  │     └── accounts
  │
  ├── defines knowledge tables:
  │     ├── dictionary_entries
  │     ├── dictionary_senses ──► FK: dictionary_entries
  │     ├── dictionary_readings ──► FK: dictionary_entries
  │     ├── dictionary_kanji_forms ──► FK: dictionary_entries
  │     ├── kanji ──► FK: radicals
  │     ├── radicals
  │     ├── grammar_points
  │     └── example_sentences ──► FK: grammar_points, dictionary_entries
  │
  ├── defines learning tables:
  │     ├── courses ──► FK: users
  │     ├── modules ──► FK: courses
  │     ├── lessons ──► FK: modules
  │     ├── questions ──► FK: lessons
  │     └── user_progress ──► FK: users, courses, modules, lessons
  │
  ├── defines SRS tables:
  │     ├── decks ──► FK: users
  │     ├── cards ──► FK: decks
  │     └── reviews ──► FK: cards, users
  │
  ├── defines gamification tables:
  │     ├── user_xp ──► FK: users
  │     ├── xp_events ──► FK: users
  │     ├── streaks ──► FK: users
  │     ├── achievements
  │     └── user_achievements ──► FK: users, achievements
  │
  └── defines AI tables:
        ├── ai_conversations ──► FK: users
        └── ai_messages ──► FK: ai_conversations
```

### 3.2 Service Layer (Phase 01+)

```
src/db/index.ts (updated)
  ├── imports: * as schema from "./schema"
  └── exports: db = drizzle(pool, { schema })
        │
        ├──► src/services/knowledge/ (Phase 02)
        │      ├── dictionary.service.ts ──► dictionary_entries, senses, readings
        │      ├── kanji.service.ts ──► kanji, radicals
        │      └── grammar.service.ts ──► grammar_points, example_sentences
        │
        ├──► src/services/search/ (Phase 03)
        │      └── search.service.ts ──► dictionary_entries, kanji, grammar_points
        │
        ├──► src/services/learning/ (Phase 04)
        │      ├── course.service.ts ──► courses, modules, lessons
        │      ├── quiz.service.ts ──► questions, user_progress
        │      └── progress.service.ts ──► user_progress
        │
        ├──► src/services/srs/ (Phase 05)
        │      ├── deck.service.ts ──► decks, cards
        │      ├── review.service.ts ──► reviews, cards
        │      └── scheduler.service.ts ──► cards (FSRS algorithm)
        │
        ├──► src/services/ai/ (Phase 06)
        │      ├── chat.service.ts ──► ai_conversations, ai_messages
        │      └── rag.service.ts ──► dictionary_entries, grammar_points (search)
        │
        ├──► src/services/gamification/ (Phase 07)
        │      ├── xp.service.ts ──► user_xp, xp_events
        │      ├── streak.service.ts ──► streaks
        │      └── achievement.service.ts ──► achievements, user_achievements
        │
        └──► src/services/auth/ (Phase 01)
               └── auth.service.ts ──► users, sessions, accounts
```

### 3.3 API Route Layer

```
src/services/*
  │
  ├──► src/app/api/health/route.ts ──► db (direct)
  ├──► src/app/api/v2/dictionary/* ──► knowledge service
  ├──► src/app/api/v2/kanji/* ──► knowledge service
  ├──► src/app/api/v2/grammar/* ──► knowledge service
  ├──► src/app/api/v2/courses/* ──► learning service
  ├──► src/app/api/v2/lessons/* ──► learning service
  ├──► src/app/api/v2/progress/* ──► learning service
  ├──► src/app/api/v2/srs/* ──► srs service
  ├──► src/app/api/v2/gamification/* ──► gamification service
  ├──► src/app/api/ai/* ──► ai service
  ├──► src/app/api/admin/* ──► multiple services
  └──► src/app/api/auth/* ──► auth service
```

---

## 4. Foreign Key Dependency Graph

### 4.1 Entity Relationships (from DOMAIN_MODEL.md)

```
users (root entity — no FK dependencies)
  │
  ├──► courses.created_by
  ├──► user_progress.user_id
  ├──► decks.user_id
  ├──► reviews.user_id
  ├──► user_xp.user_id
  ├──► xp_events.user_id
  ├──► streaks.user_id
  ├──► user_achievements.user_id
  ├──► ai_conversations.user_id
  ├──► sessions.user_id
  └──► accounts.user_id

dictionary_entries (root entity — no FK dependencies)
  ├──► dictionary_senses.entry_id
  ├──► dictionary_readings.entry_id
  ├──► dictionary_kanji_forms.entry_id
  └──► example_sentences.entry_id (optional FK)

radicals (root entity)
  └──► kanji.radical_id (optional FK)

grammar_points (root entity)
  └──► example_sentences.grammar_point_id (optional FK)

achievements (root entity — definition table)
  └──► user_achievements.achievement_id

courses
  └──► modules.course_id
         └──► lessons.module_id
                └──► questions.lesson_id

decks
  └──► cards.deck_id
         └──► reviews.card_id

ai_conversations
  └──► ai_messages.conversation_id
```

### 4.2 Table Creation Order (Topological Sort)

Based on FK dependencies, tables must be created in this order:

```
Level 0 (No dependencies — create first):
  ├── users
  ├── dictionary_entries
  ├── radicals
  ├── grammar_points
  └── achievements

Level 1 (Depends on Level 0):
  ├── sessions ──► users
  ├── accounts ──► users
  ├── dictionary_senses ──► dictionary_entries
  ├── dictionary_readings ──► dictionary_entries
  ├── dictionary_kanji_forms ──► dictionary_entries
  ├── kanji ──► radicals
  ├── example_sentences ──► grammar_points, dictionary_entries
  ├── courses ──► users
  ├── decks ──► users
  ├── user_xp ──► users
  ├── xp_events ──► users
  ├── streaks ──► users
  ├── user_achievements ──► users, achievements
  └── ai_conversations ──► users

Level 2 (Depends on Level 1):
  ├── modules ──► courses
  ├── cards ──► decks
  └── ai_messages ──► ai_conversations

Level 3 (Depends on Level 2):
  ├── lessons ──► modules
  └── reviews ──► cards, users

Level 4 (Depends on Level 3):
  ├── questions ──► lessons
  └── user_progress ──► users, courses, modules, lessons
```

**Note:** Drizzle ORM handles creation order automatically during `drizzle-kit push`, but this ordering is important for understanding migration and seeding sequences.

### 4.3 Circular Dependency Check

**Result: NO CIRCULAR DEPENDENCIES FOUND.**

The dependency graph is a DAG (Directed Acyclic Graph). No table depends on itself or creates a cycle through other tables.

---

## 5. Consumer Dependency Map

### 5.1 Which Services Read/Write Which Tables

| Service | Tables Read | Tables Written | Phase |
|---|---|---|---|
| Auth | users, sessions, accounts | users, sessions, accounts | 01 |
| Knowledge | dictionary_*, kanji, radicals, grammar_points, example_sentences | (read-only in app; ETL writes) | 02 |
| Search | dictionary_entries, kanji, grammar_points | (read-only) | 03 |
| Learning | courses, modules, lessons, questions, user_progress | user_progress, courses* | 04 |
| SRS | decks, cards, reviews | decks, cards, reviews | 05 |
| AI | ai_conversations, ai_messages + knowledge tables (read) | ai_conversations, ai_messages | 06 |
| Gamification | user_xp, xp_events, streaks, achievements, user_achievements | user_xp, xp_events, streaks, user_achievements | 07 |
| ETL | dictionary_*, kanji, radicals, grammar_points, example_sentences | Same (bulk upsert) | 02 |
| Admin | All tables | Varies | 04+ |

### 5.2 Cross-Domain Read Dependencies

```
AI Service
  ├── reads: dictionary_entries (for RAG context)
  ├── reads: grammar_points (for explanations)
  ├── reads: example_sentences (for examples)
  ├── reads: user_progress (for personalization)
  └── reads: cards, reviews (for SRS-aware tutoring)

Gamification Service
  ├── reads: user_progress (XP from lesson completion)
  ├── reads: reviews (XP from SRS reviews)
  └── reads: streaks (streak-based achievements)

SRS Service
  ├── reads: dictionary_entries (for card creation from vocab)
  ├── reads: kanji (for card creation from kanji)
  └── reads: grammar_points (for card creation from grammar)
```

These cross-domain reads mean:
- **Knowledge tables must exist before SRS and AI can function**
- **User progress must exist before Gamification can function**
- **Phase ordering (01→02→03→04→05→06→07) is correct**

---

## 6. ETL Data Flow

### 6.1 ETL Pipeline Dependencies

```
External Data Sources
  │
  ├── JMdict XML ──► ETL Parser ──► dictionary_entries
  │                                  ├── dictionary_senses
  │                                  ├── dictionary_readings
  │                                  └── dictionary_kanji_forms
  │
  ├── KANJIDIC2 XML ──► ETL Parser ──► kanji
  │                                     └── (links to radicals)
  │
  ├── Radical Data ──► ETL Parser ──► radicals
  │
  ├── Grammar Source ──► ETL Parser ──► grammar_points
  │
  └── Sentence Source ──► ETL Parser ──► example_sentences
       (e.g., Tatoeba)                   ├── links to grammar_points
                                         └── links to dictionary_entries
```

### 6.2 ETL Table Write Order

ETL must write tables in dependency order:
1. `radicals` (no dependencies)
2. `dictionary_entries` (no dependencies)
3. `kanji` (depends on `radicals`)
4. `dictionary_senses` (depends on `dictionary_entries`)
5. `dictionary_readings` (depends on `dictionary_entries`)
6. `dictionary_kanji_forms` (depends on `dictionary_entries`)
7. `grammar_points` (no dependencies)
8. `example_sentences` (depends on `grammar_points`, `dictionary_entries`)

---

## 7. Performance-Critical Dependencies

### 7.1 High-Volume Tables

| Table | Expected Volume | Access Pattern | Index Priority |
|---|---|---|---|
| `dictionary_entries` | 200,000+ | Search-heavy reads | CRITICAL |
| `dictionary_senses` | 500,000+ | FK joins | HIGH |
| `dictionary_readings` | 300,000+ | Search + FK joins | HIGH |
| `kanji` | ~13,000 | Lookup + search | MEDIUM |
| `example_sentences` | 100,000+ | FK joins + search | HIGH |
| `reviews` | Growing (append-only) | Write-heavy + user queries | HIGH |
| `cards` | Growing | Read-heavy (due dates) | HIGH |
| `ai_messages` | Growing (append-only) | Read by conversation | MEDIUM |

### 7.2 Hot Path Queries (Expected)

| Query | Tables | Frequency | Index Need |
|---|---|---|---|
| Dictionary search by headword/reading | dictionary_entries | Very high | GIN + trgm |
| Get due SRS cards | cards | High (per user session) | (user_id, state, due) |
| Submit SRS review | reviews, cards | High | card_id |
| Get user progress | user_progress | Medium | (user_id, course_id) |
| AI context retrieval | dictionary_entries, grammar_points | Medium | Full-text |
| Streak check | streaks | Daily per user | user_id |

---

## 8. Migration Dependency Chain

### 8.1 Phase-to-Database Dependencies

```
Phase 01 (Schema)
  ├── Creates: ALL tables (empty)
  ├── Creates: Extensions (uuid-ossp, pg_trgm)
  ├── Creates: Indexes
  ├── Updates: src/db/schema.ts
  └── Updates: src/db/index.ts (add schema binding)

Phase 02 (ETL) ──► Depends on Phase 01
  ├── Populates: Knowledge tables
  └── Requires: dictionary_entries, kanji, radicals, grammar_points, example_sentences

Phase 03 (Search) ──► Depends on Phase 02
  ├── Creates: Search indexes (GIN, tsvector)
  └── Requires: Populated knowledge tables

Phase 04 (Learning) ──► Depends on Phase 01
  ├── Populates: courses, modules, lessons, questions
  └── Requires: users table, knowledge tables for content

Phase 05 (SRS) ──► Depends on Phase 04
  ├── Uses: decks, cards, reviews
  └── Requires: users table, knowledge tables for card source

Phase 06 (AI) ──► Depends on Phase 03
  ├── Uses: ai_conversations, ai_messages
  ├── Creates: Vector indexes (if pgvector)
  └── Requires: Search infrastructure, knowledge data

Phase 07 (Gamification) ──► Depends on Phase 04
  ├── Uses: user_xp, xp_events, streaks, achievements, user_achievements
  └── Requires: user_progress, reviews (for XP triggers)
```

---

## 9. Conclusion

The dependency map reveals a **clean, acyclic, well-structured** dependency graph with:

- **Zero current dependencies** (database is empty, only health checks exist)
- **Clear phase ordering** that respects FK constraints
- **No circular dependencies** in the planned schema
- **Well-defined cross-domain read patterns** (AI reads knowledge; gamification reads progress)
- **Predictable ETL write ordering** that respects FK constraints

The system is ready for Phase 01 schema creation with zero migration concerns and zero dependency conflicts.
