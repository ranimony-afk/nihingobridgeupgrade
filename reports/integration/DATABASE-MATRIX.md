# DATABASE MATRIX

**Prompt:** 00.1  
**Rule:** no DROP/TRUNCATE executed. Comparison is read-only.

---

## 1. Physical databases

| Location | Schema in code | Driver |
|---|---|---|
| A-local | 0 tables (`src/db/schema.ts` = `export {}`) | `pg` Pool |
| A-github | 39 tables, 15 enums (`src/db/schema.ts` 2081 lines) | `pg` Pool + schema object |
| B knowledge | ~20 domain tables + links | postgres.js |
| B admin | 6 admin tables | postgres.js |
| B ai | `ai_explanations` | postgres.js |
| B platform compose | creates DBs via `docker/postgres/init` | Postgres 15 Alpine |

---

## 2. Name collisions (do not create side by side)

| Table | A-github columns (verified) | B knowledge columns (verified) | Class |
|---|---|---|---|
| `dictionary_entries` | text PK; `headword`, `reading`, `is_common`, smallint jlpt; child senses | uuid PK; `word`, `kana`, `romaji`, JSON meanings, trgm+FTS indexes | KEEP A; ADAPT missing attrs later |
| `kanji_entries` | text PK; `character` varchar(5); `meanings text[]`; `unicode_codepoint` | uuid PK; `character char(1)`; JSON meanings; radical **arrays** | KEEP A normalized components |
| `grammar_patterns` | text PK; child `grammar_examples` | uuid PK; JSON `examples` | KEEP A |
| `sentences` | text PK; `dictionary_entry_id` FK; child translations | uuid PK; JSON translations; vocab/grammar uuid arrays | KEEP A |
| `srs_decks` / `srs_cards` | text PK; unbound `learner_id` | uuid PK; FK `users.id`; SM-2 ease/interval | KEEP A FSRS tables; ADAPT B review-log idea |
| `user_progress` | split progress tables + `learner_id` | polymorphic `item_type`+`item_id` FK users | KEEP A |
| `user_bookmarks` | `target_type`/`target_id` text | enum item + uuid + collection | KEEP A |
| `practice_tests` / `questions` / `test_sessions` | richer A (sections, options, answers, results) | coarser B | KEEP A |

PK type conflict is **CRITICAL** if B migrations run.

---

## 3. Present only on A-github

`source_provenance`, `dictionary_senses`, `dictionary_readings`, `kanji_readings`, `kanji_components`, `kanji_component_links`, `grammar_examples`, `sentence_translations`, `courses`, `course_modules`, `lessons`, `lesson_items`, `learning_content`, `test_sections`, `question_options`, `test_answers`, `test_results`, `srs_reviews`, `srs_algorithm_state`, `lesson_progress`, `vocabulary_progress`, `kanji_progress`, `grammar_progress`, `xp_events`, `achievements`, `user_achievements`, `streaks`, `daily_goals`.

These are **KEEP** (canonical). B has no courses/lessons.

---

## 4. Present only on B

| Table | Path | Class |
|---|---|---|
| `users` | `schema/users.ts` | ADAPT as A identity later — do not import as-is (uuid + no credentials) |
| `media_assets` | `schema/media.ts` | INTEGRATE later |
| `dictionary_entry_links` and other bridges | `schema/relations.ts` | ADAPT if A lacks graph tables |
| `srs_review_logs` | `schema/srs.ts` | INTEGRATE idea (A has `srs_reviews`) |
| `admin_user_roles`, `admin_audit_logs`, `content_reviews`, `etl_pipeline_runs`, `etl_schedules`, `blog_posts` | `nihongobridge-admin/schema/admin.ts` | INTEGRATE in admin phase |
| `ai_explanations` | `nihongobridge-ai/schema/ai.ts` | INTEGRATE in AI phase |

---

## 5. Type / encoding conflicts

| Topic | A-github | B | Resolution |
|---|---|---|---|
| PK | `text` | `uuid defaultRandom()` | KEEP A text (DEC-0010) |
| JLPT | `smallint` 1–5 (`etl/tests/pipeline.test.ts`) | enum `N5`…`N1`/`NONE` | KEEP A; map at edges — ordinal **UNVERIFIED** vs N-labels |
| Glosses | JSONB on `dictionary_senses` | JSONB `meanings` on entry | KEEP A normalized |
| Search indexes | **not** in schema.ts | `gin_trgm_ops` + FTS declared | INTEGRATE indexes onto A tables in search phase |
| Identity FK | none | `users.id` uuid | REWRITE A identity additively |
| Driver | `pg` | `postgres` | KEEP `pg` |

---

## 6. Extensions

| Extension | A | B |
|---|---|---|
| `pg_trgm` | used in DictionaryService SQL; **not** declared in schema | declared GIN trgm indexes on word/kana |
| `pgcrypto` | unused | knowledge README requires it for uuid |

Runtime `similarity()` on A will fail if `pg_trgm` is missing — **UNVERIFIED** in sandbox.

---

## 7. Dependency graph (A-github, intended)

```
source_provenance
dictionary_entries ─┬─ dictionary_senses
                    └─ dictionary_readings
kanji_entries ─┬─ kanji_readings
               └─ kanji_component_links ─ kanji_components
grammar_patterns ─ grammar_examples
sentences ─ sentence_translations
            (optional FK dictionary_entry_id)

courses ─ course_modules ─ lessons ─ lesson_items
practice_tests ─ test_sections ─ questions ─ question_options
                 test_sessions ─ test_answers / test_results
srs_decks ─ srs_cards ─ srs_reviews / srs_algorithm_state

learnerId (NO FK) ── progress, srs, xp, streaks, bookmarks
```

B hub is `users` uuid. A hub is missing.

---

## 8. Classification

| Action | Class |
|---|---|
| Apply B `drizzle/*.sql` to A DB | DEPRECATE (forbidden) |
| Port A-github 39 tables into A-local schema | KEEP / INTEGRATE additive |
| Add identity table on A | REWRITE (new) |
| Copy B uuid PKs | DEPRECATE |
| Add `media_assets` later | INTEGRATE |
| Add admin_* later | INTEGRATE |
| Enable `pg_trgm` + indexes on A | INTEGRATE (search phase) |
