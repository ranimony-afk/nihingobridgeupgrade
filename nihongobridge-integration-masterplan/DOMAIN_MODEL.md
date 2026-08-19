# DOMAIN MODEL — NihongoBridge

**Version:** 2.0 — Architecture Freeze
**Date:** 2025-07-16
**Phase:** Phase 01 — Architecture Freeze (informed by Phase 00 audit)
**Status:** FROZEN — Changes require DEC-NNNN decision entry

---

## 1. Audit-Informed Context

Phase 00 database forensic audit (database-inventory.md) confirmed:
- 0 tables exist in `app_db` — this model defines the **complete** schema
- PostgreSQL 15.16, UTF-8 encoding, `public` schema
- Drizzle ORM 0.45.2 — all definitions will be `pgTable` in `src/db/schema.ts`
- `src/db/index.ts` must be updated to `drizzle(pool, { schema })` for relational queries

Table creation order follows the topological sort in database-dependency-map.md.

---

## 2. Domain Boundaries

| # | Domain | Responsibility | Tables | Phase |
|---|---|---|---|---|
| 1 | **Identity** | Users, sessions, accounts, roles | 3 | Phase 01 |
| 2 | **Knowledge** | Dictionary, kanji, radicals, grammar, sentences | 8 | Phase 01 schema / Phase 02 data |
| 3 | **Learning** | Courses, modules, lessons, questions, progress | 5 | Phase 04 |
| 4 | **SRS** | Decks, cards, reviews, scheduling | 3 | Phase 05 |
| 5 | **Gamification** | XP, streaks, achievements | 5 | Phase 07 |
| 6 | **AI** | Conversations, messages | 2 | Phase 06 |
| **Total** | | | **26** | |

---

## 3. Conventions

All tables follow these conventions — no exceptions:

| Convention | Rule |
|---|---|
| Primary key | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| Timestamps | `created_at timestamp DEFAULT now()`, `updated_at timestamp` where applicable |
| Foreign keys | `snake_case_id uuid REFERENCES parent(id)` — nullable FKs use `.references(() => parent.id)` |
| Soft delete | NOT used — delete is delete (keep it simple at this scale) |
| Naming | `snake_case` for tables and columns; singular table names for entities, plural for junction tables |
| Enums | Drizzle `pgEnum` — defined alongside the tables that use them |
| Arrays | PostgreSQL native arrays via `.array()` for simple string lists |
| JSON | `jsonb` for structured flexible data (glosses, quiz options, card content) |
| Provenance | Knowledge tables carry `source`, `source_id`, `source_version`, `import_version`, `imported_at` |
| Indexes | Defined explicitly — not auto-generated — per the index strategy in database-inventory.md §10.3 |

---

## 4. Entity Definitions

### 4.1 Identity Domain

#### `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default `gen_random_uuid()` | |
| email | varchar(255) | UNIQUE, NOT NULL | Lowercase, trimmed |
| name | varchar(255) | NOT NULL | Display name |
| password_hash | varchar(255) | NULL | NULL for OAuth-only users |
| role | user_role enum | NOT NULL, default `'user'` | |
| email_verified_at | timestamp | NULL | NULL = unverified |
| image_url | varchar(500) | NULL | Avatar URL |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

**Enum `user_role`:** `'user'`, `'editor'`, `'admin'`

**Indexes:** `users_email_idx` UNIQUE on `email`

#### `sessions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | ON DELETE CASCADE |
| token | varchar(255) | UNIQUE, NOT NULL | Session token (hashed) |
| expires_at | timestamp | NOT NULL | |
| ip_address | varchar(45) | NULL | For audit |
| user_agent | text | NULL | For audit |
| created_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** `sessions_token_idx` UNIQUE on `token`, `sessions_user_id_idx` on `user_id`

#### `accounts` (OAuth providers)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | ON DELETE CASCADE |
| provider | varchar(50) | NOT NULL | e.g. "google", "github" |
| provider_account_id | varchar(255) | NOT NULL | Provider's user ID |
| access_token | text | NULL | Encrypted |
| refresh_token | text | NULL | Encrypted |
| expires_at | integer | NULL | Token expiry epoch |
| created_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** UNIQUE on `(provider, provider_account_id)`

---

### 4.2 Knowledge Domain

All knowledge tables carry provenance columns. These are shown once here and implied on every knowledge table:

| Column | Type | Constraints | Notes |
|---|---|---|---|
| source | varchar(50) | NOT NULL | e.g. "jmdict", "kanjidic2" |
| source_id | varchar(100) | NOT NULL | Original record ID |
| source_version | varchar(50) | NOT NULL | Dataset version |
| import_version | varchar(50) | NOT NULL | ETL pipeline version |
| imported_at | timestamp | NOT NULL, default `now()` | Import timestamp |

**Uniqueness:** `UNIQUE(source, source_id)` on every knowledge table — ensures idempotent upsert.

#### `dictionary_entries`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| headword | varchar(200) | NOT NULL | Primary Japanese form (kanji or kana) |
| reading | varchar(200) | NOT NULL | Primary kana reading |
| is_common | boolean | NOT NULL, default `false` | Common word flag |
| jlpt_level | smallint | NULL | 1–5, NULL if unknown |
| frequency_rank | integer | NULL | Frequency rank |
| pos | text[] | NULL | Parts of speech array |
| *provenance* | | | See above |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** `(source, source_id)` UNIQUE, `headword`, `reading`, `jlpt_level`, `is_common`

#### `dictionary_senses`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| entry_id | uuid | FK → dictionary_entries, NOT NULL | ON DELETE CASCADE |
| position | smallint | NOT NULL | Order within entry |
| glosses | jsonb | NOT NULL | `{ "en": ["meaning1", "meaning2"], ... }` |
| pos | text[] | NULL | Sense-specific POS |
| field | text[] | NULL | Field of application |
| misc | text[] | NULL | Misc tags |
| info | text | NULL | Additional info |

**Indexes:** `entry_id`

#### `dictionary_readings`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| entry_id | uuid | FK → dictionary_entries, NOT NULL | ON DELETE CASCADE |
| reading | varchar(200) | NOT NULL | Kana reading |
| is_primary | boolean | NOT NULL, default `false` | |
| restrictions | text[] | NULL | Kanji form restrictions |

**Indexes:** `entry_id`, `reading`

#### `dictionary_kanji_forms`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| entry_id | uuid | FK → dictionary_entries, NOT NULL | ON DELETE CASCADE |
| form | varchar(200) | NOT NULL | Kanji writing |
| is_primary | boolean | NOT NULL, default `false` | |
| info | text[] | NULL | Form info tags |

**Indexes:** `entry_id`, `form`

#### `radicals`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| character | varchar(10) | UNIQUE, NOT NULL | Radical character |
| number | smallint | NOT NULL | Kangxi radical number (1–214) |
| stroke_count | smallint | NOT NULL | |
| meaning | varchar(100) | NULL | English meaning |
| reading | varchar(100) | NULL | Japanese reading |
| variants | text[] | NULL | Visual variants |
| created_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** `character` UNIQUE, `number`

#### `kanji`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| character | varchar(5) | UNIQUE, NOT NULL | The kanji character |
| unicode_codepoint | varchar(10) | NOT NULL | e.g. "U+4E00" |
| grade | smallint | NULL | School grade (1–10, NULL if ungraded) |
| stroke_count | smallint | NOT NULL | |
| jlpt_level | smallint | NULL | 1–5 |
| frequency_rank | integer | NULL | |
| meanings | text[] | NOT NULL | English meanings |
| on_readings | text[] | NULL | On'yomi |
| kun_readings | text[] | NULL | Kun'yomi |
| nanori | text[] | NULL | Name readings |
| radical_id | uuid | FK → radicals, NULL | May be NULL |
| *provenance* | | | See above |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** `character` UNIQUE, `(source, source_id)` UNIQUE, `jlpt_level`, `grade`, `stroke_count`

#### `grammar_points`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| title | varchar(200) | NOT NULL | e.g. "〜てから" |
| title_ja | varchar(200) | NULL | |
| jlpt_level | smallint | NULL | 1–5 |
| structure | varchar(500) | NOT NULL | Pattern: "Verb て-form + から" |
| meaning | varchar(500) | NOT NULL | English meaning |
| explanation | text | NOT NULL | Detailed explanation |
| notes | text | NULL | Usage notes |
| tags | text[] | NULL | Categories |
| *provenance* | | | See above |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** `(source, source_id)` UNIQUE, `jlpt_level`, `title`

#### `example_sentences`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| japanese | text | NOT NULL | Japanese text |
| reading | text | NULL | Full kana reading |
| english | text | NOT NULL | English translation |
| jlpt_level | smallint | NULL | |
| grammar_point_id | uuid | FK → grammar_points, NULL | Optional link |
| entry_id | uuid | FK → dictionary_entries, NULL | Optional link |
| *provenance* | | | See above |
| created_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** `(source, source_id)` UNIQUE, `grammar_point_id`, `entry_id`, `jlpt_level`

---

### 4.3 Learning Domain

#### `courses`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| title | varchar(300) | NOT NULL | |
| description | text | NULL | |
| level | varchar(20) | NULL | beginner / intermediate / advanced |
| jlpt_level | smallint | NULL | Target JLPT level |
| is_published | boolean | NOT NULL, default `false` | |
| position | integer | NOT NULL, default `0` | Display order |
| image_url | varchar(500) | NULL | |
| created_by | uuid | FK → users, NULL | |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

#### `modules`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| course_id | uuid | FK → courses, NOT NULL | ON DELETE CASCADE |
| title | varchar(300) | NOT NULL | |
| description | text | NULL | |
| position | integer | NOT NULL, default `0` | Order within course |
| created_at | timestamp | NOT NULL, default `now()` | |

#### `lessons`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| module_id | uuid | FK → modules, NOT NULL | ON DELETE CASCADE |
| title | varchar(300) | NOT NULL | |
| content | jsonb | NULL | Lesson content blocks |
| type | lesson_type enum | NOT NULL | |
| position | integer | NOT NULL, default `0` | |
| estimated_minutes | smallint | NULL | |
| created_at | timestamp | NOT NULL, default `now()` | |

**Enum `lesson_type`:** `'lesson'`, `'quiz'`, `'practice'`, `'reading'`, `'listening'`

#### `questions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| lesson_id | uuid | FK → lessons, NULL | NULL = standalone question bank |
| type | question_type enum | NOT NULL | |
| prompt | text | NOT NULL | Question text |
| prompt_ja | text | NULL | Japanese prompt |
| options | jsonb | NULL | Answer options |
| correct_answer | jsonb | NOT NULL | Correct answer |
| explanation | text | NULL | |
| jlpt_level | smallint | NULL | |
| tags | text[] | NULL | |
| created_at | timestamp | NOT NULL, default `now()` | |

**Enum `question_type`:** `'multiple_choice'`, `'fill_blank'`, `'matching'`, `'ordering'`, `'free_text'`

#### `user_progress`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | ON DELETE CASCADE |
| course_id | uuid | FK → courses, NOT NULL | |
| module_id | uuid | FK → modules, NULL | |
| lesson_id | uuid | FK → lessons, NULL | |
| status | progress_status enum | NOT NULL, default `'not_started'` | |
| score | smallint | NULL | 0–100 |
| started_at | timestamp | NULL | |
| completed_at | timestamp | NULL | |
| time_spent_seconds | integer | NOT NULL, default `0` | |
| created_at | timestamp | NOT NULL, default `now()` | |

**Enum `progress_status`:** `'not_started'`, `'in_progress'`, `'completed'`

**Indexes:** `(user_id, course_id, lesson_id)` UNIQUE

---

### 4.4 SRS Domain

#### `decks`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | ON DELETE CASCADE |
| title | varchar(200) | NOT NULL | |
| description | text | NULL | |
| is_public | boolean | NOT NULL, default `false` | |
| new_cards_per_day | smallint | NOT NULL, default `20` | |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

#### `cards`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| deck_id | uuid | FK → decks, NOT NULL | ON DELETE CASCADE |
| front | jsonb | NOT NULL | Front content |
| back | jsonb | NOT NULL | Back content |
| type | card_type enum | NOT NULL | |
| source_type | varchar(50) | NULL | e.g. "dictionary_entry", "kanji" |
| source_id | uuid | NULL | ID of source entity |
| state | card_state enum | NOT NULL, default `'new'` | |
| due | timestamp | NULL | Next review date |
| stability | real | NOT NULL, default `0` | FSRS |
| difficulty | real | NOT NULL, default `0` | FSRS |
| elapsed_days | integer | NOT NULL, default `0` | |
| scheduled_days | integer | NOT NULL, default `0` | |
| reps | integer | NOT NULL, default `0` | |
| lapses | integer | NOT NULL, default `0` | |
| last_review | timestamp | NULL | |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

**Enum `card_type`:** `'vocabulary'`, `'kanji'`, `'grammar'`, `'sentence'`, `'custom'`
**Enum `card_state`:** `'new'`, `'learning'`, `'review'`, `'relearning'`

**Indexes:** `deck_id`, `(deck_id, state, due)` composite for due-card queries

#### `reviews`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| card_id | uuid | FK → cards, NOT NULL | ON DELETE CASCADE |
| user_id | uuid | FK → users, NOT NULL | |
| rating | review_rating enum | NOT NULL | |
| review_duration_ms | integer | NULL | |
| reviewed_at | timestamp | NOT NULL, default `now()` | |
| scheduled_days | integer | NOT NULL | Interval before review |
| elapsed_days | integer | NOT NULL | Actual days since last |
| state_before | card_state enum | NOT NULL | |
| state_after | card_state enum | NOT NULL | |

**Enum `review_rating`:** `'again'`, `'hard'`, `'good'`, `'easy'`

**Indexes:** `card_id`, `user_id`, `reviewed_at`

---

### 4.5 Gamification Domain

#### `user_xp`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, UNIQUE, NOT NULL | One per user |
| total_xp | integer | NOT NULL, default `0` | |
| level | smallint | NOT NULL, default `1` | |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

#### `xp_events`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | |
| amount | integer | NOT NULL | |
| source | varchar(50) | NOT NULL | e.g. "lesson_complete", "review" |
| source_id | uuid | NULL | Related entity ID |
| earned_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** `user_id`, `earned_at`

#### `streaks`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, UNIQUE, NOT NULL | One per user |
| current_streak | integer | NOT NULL, default `0` | Days |
| longest_streak | integer | NOT NULL, default `0` | |
| last_activity_date | date | NULL | |
| updated_at | timestamp | NOT NULL, default `now()` | |

#### `achievements`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| name | varchar(100) | UNIQUE, NOT NULL | |
| description | text | NOT NULL | |
| icon | varchar(50) | NULL | Emoji or icon ID |
| category | varchar(50) | NOT NULL | |
| criteria | jsonb | NOT NULL | Machine-readable unlock criteria |
| created_at | timestamp | NOT NULL, default `now()` | |

#### `user_achievements`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | |
| achievement_id | uuid | FK → achievements, NOT NULL | |
| unlocked_at | timestamp | NOT NULL, default `now()` | |

**Indexes:** `(user_id, achievement_id)` UNIQUE

---

### 4.6 AI Domain

#### `ai_conversations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | ON DELETE CASCADE |
| title | varchar(200) | NULL | Auto-generated or user-set |
| context_type | varchar(50) | NULL | "grammar", "vocabulary", "general" |
| context_id | uuid | NULL | Related entity ID |
| created_at | timestamp | NOT NULL, default `now()` | |
| updated_at | timestamp | NOT NULL, default `now()` | |

#### `ai_messages`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| conversation_id | uuid | FK → ai_conversations, NOT NULL | ON DELETE CASCADE |
| role | message_role enum | NOT NULL | |
| content | text | NOT NULL | |
| tokens_used | integer | NULL | |
| model | varchar(50) | NULL | e.g. "gpt-4o" |
| created_at | timestamp | NOT NULL, default `now()` | |

**Enum `message_role`:** `'user'`, `'assistant'`, `'system'`

**Indexes:** `conversation_id`, `created_at`

---

## 5. Table Creation Order (Topological)

Per database-dependency-map.md. Drizzle-kit handles this automatically, but ETL/seed scripts must respect it.

```
Level 0: users, radicals, achievements
Level 1: sessions, accounts, dictionary_entries, kanji, grammar_points,
         courses, decks, user_xp, streaks, ai_conversations
Level 2: dictionary_senses, dictionary_readings, dictionary_kanji_forms,
         example_sentences, modules, cards, xp_events, user_achievements,
         ai_messages
Level 3: lessons, reviews
Level 4: questions, user_progress
```

---

## 6. Enum Registry

| Enum Name | Values | Used By |
|---|---|---|
| `user_role` | user, editor, admin | users |
| `lesson_type` | lesson, quiz, practice, reading, listening | lessons |
| `question_type` | multiple_choice, fill_blank, matching, ordering, free_text | questions |
| `progress_status` | not_started, in_progress, completed | user_progress |
| `card_type` | vocabulary, kanji, grammar, sentence, custom | cards |
| `card_state` | new, learning, review, relearning | cards, reviews |
| `review_rating` | again, hard, good, easy | reviews |
| `message_role` | user, assistant, system | ai_messages |

---

## 7. Relationship Map

```
users (root)
  ├─→ sessions (1:N, CASCADE)
  ├─→ accounts (1:N, CASCADE)
  ├─→ courses.created_by (1:N, SET NULL)
  ├─→ user_progress (1:N, CASCADE)
  ├─→ decks (1:N, CASCADE)
  ├─→ reviews.user_id (1:N)
  ├─→ user_xp (1:1, CASCADE)
  ├─→ xp_events (1:N)
  ├─→ streaks (1:1, CASCADE)
  ├─→ user_achievements (1:N)
  └─→ ai_conversations (1:N, CASCADE)

dictionary_entries (root)
  ├─→ dictionary_senses (1:N, CASCADE)
  ├─→ dictionary_readings (1:N, CASCADE)
  ├─→ dictionary_kanji_forms (1:N, CASCADE)
  └─→ example_sentences.entry_id (1:N, SET NULL)

radicals (root) ─→ kanji.radical_id (1:N, SET NULL)
grammar_points (root) ─→ example_sentences.grammar_point_id (1:N, SET NULL)
achievements (root) ─→ user_achievements (1:N)

courses ─→ modules (1:N, CASCADE) ─→ lessons (1:N, CASCADE) ─→ questions (1:N, SET NULL)
decks ─→ cards (1:N, CASCADE) ─→ reviews (1:N, CASCADE)
ai_conversations ─→ ai_messages (1:N, CASCADE)
```

No circular dependencies. Graph is a DAG.
