# PHASE 00 — Database Schema Comparison

**Date:** 2026-03-25  
**Rule honoured:** no DROP / TRUNCATE / destructive SQL executed.

---

## 1. Local sandbox

`src/db/schema.ts` contains only `export {}`. Drizzle defines **0 tables**.

Live PostgreSQL: sandbox instance via `DATABASE_URL`. No NihongoBridge domain tables are declared in code.

---

## 2. GitHub A canonical schema (`src/db/schema.ts`, 2081 lines)

### Enums (15)

`course_level`, `publish_status`, `lesson_kind`, `lesson_item_type`, `exercise_type`, `question_type`, `difficulty`, `test_session_status`, `srs_card_type`, `srs_card_state`, `srs_rating`, `mastery_level`, `enrollment_status`, `xp_source`, `achievement_category`

### Tables (39)

| Domain | Tables | PK style |
|---|---|---|
| Provenance | `source_provenance` | text |
| Dictionary | `dictionary_entries`, `dictionary_senses`, `dictionary_readings` | text |
| Kanji | `kanji_entries`, `kanji_readings`, `kanji_components`, `kanji_component_links` | text |
| Grammar | `grammar_patterns`, `grammar_examples` | text |
| Sentences | `sentences`, `sentence_translations` | text |
| Learning | `courses`, `course_modules`, `lessons`, `lesson_items`, `learning_content` | text |
| Assessment | `practice_tests`, `test_sections`, `questions`, `question_options`, `test_sessions`, `test_answers`, `test_results` | text |
| SRS | `srs_decks`, `srs_cards`, `srs_reviews`, `srs_algorithm_state` | text |
| Progress | `user_progress`, `lesson_progress`, `vocabulary_progress`, `kanji_progress`, `grammar_progress` | text |
| Gamification | `xp_events`, `achievements`, `user_achievements`, `streaks`, `daily_goals` | text |
| Bookmarks | `user_bookmarks` | text |

### Design notes (evidence)

- Text PKs, application-generated IDs
- Timestamps with timezone
- JSONB for glosses / flexible payloads
- Provenance denormalized on knowledge rows (`source`, `source_id`, `source_version`, `import_version`)
- JLPT as `smallint` 1–5 (NULL if unclassified)
- Dictionary normalized: entry / senses / readings
- `learnerId` appears on progress/SRS/gamification **without an identity table**
- Comment references `kg_*` tables — **none exist** in this schema
- No `users`, `sessions`, `accounts`, `api_keys`, `media_assets`, `admin_*`

---

## 3. Repo B knowledge schema

PK style: `uuid` + `defaultRandom()`. Driver: `postgres` (postgres.js), not `pg`.

| Table | Notes |
|---|---|
| `dictionary_entries` | Denormalized: `word`, `kana`, `romaji`, JSON `meanings`/`furigana`, array FKs, GIN trgm + FTS |
| `kanji_entries` | `character char(1)`, JSON meanings, radical/component text arrays |
| `grammar_patterns` | JSON meaning/examples, unique (pattern, source) |
| `sentences` | JSON translations, grammar/vocab UUID arrays |
| `media_assets` | Missing from GitHub A |
| `dictionary_entry_links` and 8 other link tables | Graph between entities |
| `srs_decks`, `srs_cards`, `srs_review_logs` | SM-2 fields; FK to `users` |
| `practice_tests`, `questions`, `test_sessions` | Coarser than A's assessment model |
| `users` | email/username/xp/streak/JLPT levels |
| `user_progress` | polymorphic item_type + item_id |
| `user_bookmarks` | collections |

Admin schema (separate package): `admin_user_roles`, `admin_audit_logs`, `content_reviews`, `etl_pipeline_runs`, `etl_schedules`, `blog_posts`.  
AI schema: `ai_explanations`.

JLPT: enum `N5` | `N4` | `N3` | `N2` | `N1` | `NONE` (not smallint).

---

## 4. Overlaps (same name, incompatible shape)

These **must not** be created side-by-side.

| Table | A (GitHub) | B | Conflict |
|---|---|---|---|
| `dictionary_entries` | text PK, `headword`/`reading`, child senses | uuid PK, `word`/`kana`, JSON meanings | PK + columns |
| `kanji_entries` | text PK, `meanings text[]`, `unicode_codepoint` | uuid PK, JSON meanings, `unicode` | PK + types |
| `grammar_patterns` | text PK, child `grammar_examples` | uuid PK, JSON `examples` | Normalization |
| `sentences` | text PK, child `sentence_translations` | uuid PK, JSON `translations` | Normalization |
| `srs_decks` / `srs_cards` | text PK, `learnerId` unbound | uuid PK, FK `users.id` | Identity + PK |
| `user_progress` | split tables + `learnerId` | polymorphic + FK users | Shape |
| `user_bookmarks` | `targetType`/`targetId` text | `itemType` enum + uuid `itemId` + collection | Shape |
| `practice_tests` / `questions` / `test_sessions` | richer A model | coarser B model | Columns |

---

## 5. Gaps

| Missing on GitHub A | Missing on Repo B knowledge |
|---|---|
| Identity (`users` / sessions / oauth) | Courses, modules, lessons, lesson items |
| `media_assets` | Provenance table |
| Admin RBAC / audit / ETL run tables | Gamification (xp/achievements/daily_goals as first-class) |
| `ai_explanations` | Kanji component link table (B uses arrays) |
| pg_trgm indexes declared in code | Learning content / enrollments |

Local sandbox: **everything** is missing (expected).

---

## 6. Dependency map (target)

```
source_provenance
    └── dictionary_entries ── dictionary_senses
                           └── dictionary_readings
    └── kanji_entries ── kanji_readings
                      └── kanji_component_links ── kanji_components
    └── grammar_patterns ── grammar_examples
    └── sentences ── sentence_translations

courses ── course_modules ── lessons ── lesson_items
                                      └── learning_content

practice_tests ── test_sections ── questions ── question_options
                 └── test_sessions ── test_answers
                                    └── test_results

srs_decks ── srs_cards ── srs_reviews
                       └── srs_algorithm_state

[MISSING identity_users] ←── learnerId on progress, srs, xp, streaks, bookmarks
```

Repo B additionally: `users` is the hub. GitHub A has a **dangling learnerId** (RISK-0013).

---

## 7. Recommendation (DEC-0010)

1. Canonical schema = GitHub A's 39-table text-PK model.
2. Never run Repo B `drizzle/*.sql` against A's database.
3. Phase 01 adds GitHub A tables with CREATE/ADD only.
4. Identity table is a **new additive** GitHub A table (do not import B `users` as-is).
5. Adopt selected B columns as additive later (romaji, furigana JSON, media_assets, admin_*) if still missing after A schema is applied.
6. Map JLPT: store smallint 1–5 in A; translate N5↔5 at API edges if B clients appear.

**Migration risk if B schema is applied:** CRITICAL (type conflicts on identical table names).
