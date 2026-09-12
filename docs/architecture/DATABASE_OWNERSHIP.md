# DATABASE OWNERSHIP

**Version:** 1.0 — Frozen with `ARCHITECTURE_FREEZE.md` v3.0  
**Date:** 2026-03-25  
**Canonical schema file:** `src/db/schema.ts` (single Drizzle schema)  
**Driver:** `pg` (node-postgres) via `src/db/index.ts`  
**Non-destructive rule:** CREATE / ADD / BACKFILL / MIGRATE / DEPRECATE only

---

## 1. One database, one schema

| Rule | Value |
|---|---|
| Databases | **one** PostgreSQL logical database |
| Schema definitions | **one** file (`src/db/schema.ts`) |
| Competing schema | Repository B's `nihongobridge-knowledge` — **not applied, ever** |
| B migrations | `nihongobridge-knowledge/drizzle/*.sql` — **must never execute** against A |
| Multi-DB compose | rejected |
| Migration tool | `drizzle-kit` |

A table exists **once**. If two definitions of `dictionary_entries` could exist, the B one is deleted from consideration.

---

## 2. Table ownership register

Writer = the only module permitted to INSERT/UPDATE/DELETE.

### 2.1 Provenance

| Table | Writer | Readers |
|---|---|---|
| `source_provenance` | ETL | Knowledge, Admin |

### 2.2 Knowledge

| Table | Writer | Readers |
|---|---|---|
| `dictionary_entries` | ETL, Admin (via Knowledge service) | Knowledge, Search, Learning, SRS, AI |
| `dictionary_senses` | same | same |
| `dictionary_readings` | same | same |
| `kanji_entries` | same | same |
| `kanji_readings` | same | same |
| `kanji_components` | same | Knowledge |
| `kanji_component_links` | same | Knowledge |
| `grammar_patterns` | same | Knowledge, Learning, AI |
| `grammar_examples` | same | Knowledge, AI |
| `sentences` | same | Knowledge, Learning, Assessment, AI |
| `sentence_translations` | same | same |
| `media_assets` *(to add)* | ETL, Admin | Knowledge, clients |

**Learners never write knowledge tables.**

### 2.3 Learning

| Table | Writer | Readers |
|---|---|---|
| `courses`, `course_modules`, `lessons`, `lesson_items`, `learning_content` | Learning (Admin-driven) | Learning, Progress, clients |

### 2.4 Assessment

| Table | Writer | Readers |
|---|---|---|
| `practice_tests`, `test_sections` | Assessment (Admin-driven) | Assessment |
| `questions`, `question_options` | Assessment + ETL generators | Assessment, Learning |
| `test_sessions`, `test_answers` | Assessment (learner-driven) | Assessment, Progress |
| `test_results` | Assessment | Progress, Gamification, clients |

### 2.5 SRS

| Table | Writer | Readers |
|---|---|---|
| `srs_decks`, `srs_cards`, `srs_algorithm_state` | SRS | SRS, Progress |
| `srs_reviews` | SRS — **append-only** | SRS, Progress, analytics |

### 2.6 Progress

| Table | Writer | Readers |
|---|---|---|
| `user_progress`, `lesson_progress`, `vocabulary_progress`, `kanji_progress`, `grammar_progress` | Progress | Progress, Assessment (readiness), AI (personalization), clients |

### 2.7 Gamification

| Table | Writer | Readers |
|---|---|---|
| `xp_events` | Gamification — **append-only** | Gamification, clients |
| `achievements` | Admin | Gamification |
| `user_achievements`, `streaks`, `daily_goals` | Gamification | clients |

### 2.8 Learner-owned

| Table | Writer | Readers |
|---|---|---|
| `user_bookmarks` | Knowledge service (learner-initiated) | clients |

### 2.9 Identity *(to add — Phase 01)*

| Table | Writer | Readers |
|---|---|---|
| `identity_users` | Identity | all domains (FK only) |
| `identity_credentials`, `identity_sessions`, `identity_roles` | Identity | Identity only |

### 2.10 Admin / AI *(to add)*

| Table | Writer | Readers |
|---|---|---|
| `admin_audit_logs` | Admin — **append-only** | Admin |
| `content_reviews` | Admin | Admin |
| `etl_pipeline_runs`, `etl_schedules` | Admin + ETL | Admin |
| `blog_posts` | Admin | public web |
| `ai_explanations` | AI | AI |

---

## 3. Frozen column conventions

| Concern | Rule |
|---|---|
| Primary key | `text`, application-generated. Deterministic (`hash(source, source_id)`) for imported rows so re-imports are stable |
| Foreign keys | real FK constraints; `ON DELETE CASCADE` only for owned children (senses, readings, answers) |
| Timestamps | `timestamptz`, `created_at` + `updated_at` |
| Soft state | explicit status/enum columns; no magic strings |
| Flexible data | `jsonb` (glosses, structured content, algorithm params) |
| Multi-valued scalars | native arrays (`text[]`) |
| JLPT | `smallint`, **5 = N5 … 1 = N1**, `NULL` = unclassified |
| Booleans | non-null with defaults |
| Money/subscriptions | deferred; when added, integer minor units |

### 3.1 Provenance columns on every imported row

`source`, `source_id`, `source_version`, `import_version`, `imported_at`, `checksum`.

Uniqueness: `(source, source_id)`.

---

## 4. Identity binding (open defect, frozen resolution)

Today `learnerId` is unbound `text` across SRS, progress, gamification, bookmarks, and test sessions — no referential integrity.

**Frozen plan (Phase 01, additive):**

1. CREATE `identity_users`.
2. BACKFILL any orphan `learner_id` values into identity rows or quarantine them.
3. ADD FK constraints from each `learner_id` to `identity_users.id`.
4. No column is dropped or renamed.

Until step 3 completes, mutating learner endpoints stay unexposed.

---

## 5. Indexes and extensions

| Item | Decision |
|---|---|
| `pg_trgm` | **Required.** Enabled explicitly in migration — never assumed. `DictionaryService` already calls `similarity()` |
| `pgcrypto` | Not required (text PKs, app-generated) |
| Trigram indexes | GIN `gin_trgm_ops` on `headword`, `reading`, kanji `character`, grammar `pattern` |
| Full text | weighted `tsvector` GIN (word A, kana/romaji B, glosses C) — pattern adopted from B |
| Hot paths | `(learner_id, due)` on `srs_cards`; `(learner_id, date)` on `daily_goals`; `(source, source_id)` unique everywhere |
| Declaration site | all indexes in `schema.ts`, not ad hoc SQL |

---

## 6. Migration policy

| Allowed | Forbidden without authorizing DEC |
|---|---|
| `CREATE TABLE` | `DROP TABLE` |
| `ADD COLUMN` (nullable or defaulted) | `DROP COLUMN` |
| `CREATE INDEX` | `TRUNCATE` |
| Backfill via job | destructive type changes |
| Mark deprecated in comments | renaming live columns |

**Deprecation path:** mark → stop writing → migrate readers → retain ≥1 release → remove only with explicit authorization.

**Every migration must:** be reversible or documented as irreversible, run inside a transaction where possible, and be verified against a copy before production.

---

## 7. Data classification

| Class | Examples | Handling |
|---|---|---|
| Public knowledge | dictionary, kanji, grammar, sentences | cacheable; attribution required |
| Learner private | progress, SRS, XP, bookmarks, sessions | authenticated access only; never in public caches |
| Credentials | password hashes, tokens | hashed, never logged, never returned by any API |
| Operational | audit logs, ETL runs | admin-only |
| Generated | AI explanations | cacheable; regenerable |

---

## 8. Licensing obligations stored with data

Knowledge rows must resolve to a license. Unresolved conflicts from the audit that **block first import**:

| Source | Conflict |
|---|---|
| JMdict | A registry says CC-BY-SA-4.0; B config says CC BY-SA 3.0 |
| Tatoeba | CC-BY-2.0 vs CC BY 2.0 FR |
| JLPT lists | "community-compiled" — needs a concrete citation |
| Frequency corpus | "public domain" — unverified |
| TTS audio | redistribution terms unverified — blocked |

No import runs until its row here is resolved and recorded in `source_provenance`.

---

## 9. Prohibited

1. Applying Repository B migrations.
2. A second schema file or second database.
3. `uuid` primary keys on canonical tables.
4. Direct cross-domain writes (e.g. AI writing `xp_events`).
5. Dropping or truncating anything without an authorizing decision.
6. Storing secrets in the database.
7. Importing data without provenance and a permitted license.
