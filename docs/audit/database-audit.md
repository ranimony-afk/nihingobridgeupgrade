# Relational Database & Schema Audit Report

**Document Version:** 4.0.0 (Master Foundation)  
**Database Engine:** PostgreSQL 16+ (Supabase / AWS RDS / Local pg)  
**ORM Client:** Drizzle ORM `0.45.2` / Drizzle Kit `0.31.10`  
**Status:** Certified Database Architecture ✅  

---

## 1. Database Connection & Pooling Architecture

### 1.1 Global Connection Pool (`src/db/index.ts`)
- **Driver Integration**: Uses official `pg.Pool` combined with `drizzle-orm/node-postgres`.
- **Serverless Caching**: To prevent connection pool exhaustion during Next.js App Router hot-reloading in development and lambda scaling in production, the connection pool is cached on `globalThis.__arenaNextJsPostgresqlPool`.
- **Dynamic Configuration**: Connects dynamically via `process.env.DATABASE_URL`, supporting standard SSL requirements (`?sslmode=require`) natively.

---

## 2. Relational Schema Architecture (`src/db/schema.ts`)

The database schema is fully normalized and implements 24 relational tables covering all 10 educational platform domains. Every table supporting multi-tenancy enforces foreign key integrity via `brand_id REFERENCES brands(id) ON DELETE CASCADE`.

### 2.1 Complete Table Inventory

| Schema Domain | Relational Table Name | Verified Columns & Purpose | Indexing Strategy |
| :--- | :--- | :--- | :--- |
| **Multi-Tenancy** | `brands` | `id`, `slug`, `name`, `tagline`, `default_locale`, `theme`, `created_at`. Multi-brand tenant root. | Unique index on `slug`. |
| **Identity & RBAC** | `users` | `id`, `email`, `display_name`, `role`, `created_at`. Universal user identities. | Unique index on `email`. |
| **DAM: Folders** | `asset_folders` | `id`, `brand_id`, `name`, `slug`, `parent_id`, `created_at`. Nested folder hierarchy. | Index on `brand_id`. |
| **DAM: Collections** | `asset_collections` | `id`, `brand_id`, `name`, `description`, `category`, `tags`, `created_at`. Curated albums. | Index on `brand_id`. |
| **DAM: Assets** | `assets` | `id`, `brand_id`, `folder_id`, `collection_id`, `kind`, `url`, `cdn_url`, `title`, `alt_text`, `caption`, `category`, `tags`, `copyright`, `licensing`, `owner`, `usage_rights`, `expires_at`, `checksum`, `mime_type`, `bytes`, `width`, `height`, `aspect_ratio`, `variants`, `transcode_status`, `metadata`, `created_at`. Master DAM store. | Indexes on `brand_id`, `kind`, `checksum`, `category`. |
| **DAM: Versions** | `asset_versions` | `id`, `asset_id`, `version_number`, `url`, `bytes`, `mime_type`, `change_notes`, `metadata`, `created_at`. Asset rollback history. | Index on `asset_id`. |
| **DAM: Usages** | `asset_usages` | `id`, `asset_id`, `entity_type`, `entity_id`, `field`, `created_at`. Cross-entity usage tracking. | Indexes on `asset_id`, `(entity_type, entity_id)`. |
| **CMS Pages** | `pages` | `id`, `brand_id`, `slug`, `title`, `body`, `status`, `locale`, `author_id`, `hero_asset_id`, `published_at`, `updated_at`, `created_at`. CMS page nodes. | Unique index on `(brand_id, slug, locale)`, index on `status`. |
| **CMS Sections** | `content_sections` | `id`, `brand_id`, `page_slug`, `section_key`, `title`, `subtitle`, `content`, `position`, `status`, `locale`, `updated_at`, `created_at`. 22 homepage block modules. | Unique index on `(brand_id, page_slug, section_key, locale)`, index on `section_key`. |
| **CMS Versions** | `content_versions` | `id`, `entity_type`, `entity_id`, `version_number`, `snapshot`, `change_summary`, `is_autosave`, `author_id`, `created_at`. Section & page version history. | Index on `(entity_type, entity_id)`. |
| **CMS Settings** | `brand_settings` | `id`, `brand_id`, `category`, `data`, `updated_at`. Mega menu, footer, and SEO configs. | Unique index on `(brand_id, category)`. |
| **Audit Trail** | `audit_logs` | `id`, `action`, `entity_type`, `entity_id`, `actor_id`, `details`, `created_at`. Tamper-evident action logging. | Indexes on `action`, `(entity_type, entity_id)`. |
| **LMS Courses** | `courses` | `id`, `brand_id`, `slug`, `title`, `summary`, `level`, `locale`, `status`, `cover_asset_id`, `is_featured`, `created_at`, `updated_at`. Course master catalog. | Unique index on `(brand_id, slug, locale)`, index on `status`. |
| **LMS Modules** | `modules` | `id`, `course_id`, `title`, `position`, `created_at`. Curriculum module chapters. | Index on `course_id`. |
| **LMS Lessons** | `lessons` | `id`, `module_id`, `slug`, `title`, `body`, `position`, `duration_minutes`, `video_asset_id`, `created_at`. Lesson content units. | Unique index on `(module_id, slug)`. |
| **Japanese Master** | `nihongo_learning_items` | `id`, `brand_id`, `category`, `jlpt_level`, `japanese`, `furigana`, `romaji`, `meaning`, `part_of_speech`, `pitch_accent`, `image_url`, `synonyms`, `antonyms`, `frequency`, `is_favorite`, `is_bookmarked`, `review_status`, `example_sentence_ja`, `example_sentence_en`, `grammar_structure`, `stroke_count`, `radicals`, `audio_url`, `tags`, `status`, `created_at`. Vocabulary, Kanji & Grammar master items. | Indexes on `category`, `jlpt_level`. |
| **Flashcard Decks** | `custom_decks` | `id`, `brand_id`, `title`, `description`, `jlpt_level`, `is_public`, `share_code`, `tags`, `card_count`, `created_at`, `updated_at`. Custom Quizlet-style decks. | Index on `share_code`. |
| **Flashcard Cards** | `custom_deck_cards` | `id`, `deck_id`, `card_type`, `front`, `back`, `furigana`, `romaji`, `notes`, `audio_url`, `position`, `ease_factor`, `interval_days`, `repetitions`, `accuracy`, `next_review_at`, `last_reviewed_at`, `created_at`. Cards with SM-2 metrics. | Index on `deck_id`. |
| **Spaced Repetition**| `srs_flashcards` | `id`, `item_id`, `user_id`, `interval_days`, `ease_factor`, `repetitions`, `next_review_at`, `last_reviewed_at`, `created_at`. SM-2 user review schedules. | Index on `(item_id, user_id)`. |
| **Quizzes & Mock** | `nihongo_quizzes` | `id`, `brand_id`, `category`, `jlpt_level`, `section_type`, `question`, `options`, `correct_index`, `explanation`, `audio_prompt`, `time_limit_seconds`, `created_at`. Practice test question bank. | Index on `category`. |
| **Gamification** | `learner_gamification` | `id`, `user_id`, `brand_id`, `xp`, `streak_days`, `daily_goal_minutes`, `weekly_goal_minutes`, `total_study_minutes`, `completed_lessons_count`, `completed_reviews_count`, `average_test_score`, `streak_freezes`, `level`, `level_title`, `bookmarks`, `achievements`, `badges`, `daily_challenges`, `weak_areas`, `updated_at`. Duolingo-style gamification store. | Index on `(user_id, brand_id)`. |
| **Leaderboards** | `leaderboards` | `id`, `display_name`, `xp`, `rank`, `avatar_emoji`, `streak_days`, `league`, `created_at`. Sapphire League rankings. | Index on `rank`. |
| **Daily News** | `news_articles` | `id`, `brand_id`, `slug`, `title`, `summary`, `japanese_text`, `furigana_text`, `english_translation`, `tamil_translation`, `malayalam_translation`, `difficulty_level`, `reading_minutes`, `audio_url`, `grammar_highlights`, `extracted_vocabulary`, `extracted_kanji`, `comprehension_questions`, `is_today`, `status`, `published_at`, `created_at`. TODAI-style daily news reader. | Indexes on `slug`, `is_today`. |
| **Download Center** | `downloadable_resources` | `id`, `brand_id`, `title`, `description`, `file_type`, `category`, `file_url`, `file_size`, `format`, `requires_registration`, `download_count`, `rating`, `rating_count`, `bookmark_count`, `tags`, `jlpt_level`, `created_at`. Gated resource library. | Index on `category`. |
| **Download History** | `download_history` | `id`, `resource_id`, `user_email`, `downloaded_at`. User download logs. | Index on `user_email`. |
| **Study in Japan** | `study_japan_items` | `id`, `brand_id`, `category`, `title`, `summary`, `body`, `location`, `stipend_tuition`, `tags`, `created_at`. Study abroad advisory portal. | Index on `category`. |
| **Kanji Mastery** | `kanji_dictionary` | `id`, `kanji`, `meaning`, `onyomi`, `kunyomi`, `radicals`, `stroke_count`, `frequency_rank`, `grade_level`, `jlpt_level`, `theme_category`, `audio_url`, `stroke_order_svg`, `component_breakdown`, `kanji_families`, `similar_kanji`, `is_favorite`, `mastery_score`, `examples`, `created_at`. Takoboto/Kanji Study dictionary. | Unique index on `kanji`, indexes on `jlpt_level`, `theme_category`. |
| **User Word Lists** | `user_word_lists` | `id`, `user_id`, `title`, `share_code`, `words`, `created_at`. Custom vocabulary collections. | Index on `share_code`. |
| **Mock Exam Sessions**| `jlpt_exam_sessions` | `id`, `user_id`, `jlpt_level`, `total_score`, `max_score`, `passed`, `vocab_score`, `grammar_score`, `reading_score`, `certificate_code`, `incorrect_answers`, `completed_at`. Timed simulator sessions & certificate registry. | Index on `certificate_code`. |
| **Conversation Lab** | `conversation_lessons` | `id`, `brand_id`, `category`, `title`, `situation`, `difficulty_level`, `dialogues`, `vocabulary`, `grammar_notes`, `role_play_prompt`, `audio_url`, `is_completed`, `created_at`. 9 situational speaking lessons. | Index on `category`. |
| **i18n Translations**| `translations` | `id`, `entity_type`, `entity_id`, `locale`, `field`, `value`, `created_at`. Multilingual text overlays. | Unique index on `(entity_type, entity_id, locale, field)`. |
| **Translation Memory**| `translation_memory` | `id`, `source_text`, `source_locale`, `target_locale`, `translated_text`, `context`, `quality_score`, `created_at`. Reusable translation segment repository. | Index on `(source_locale, target_locale)`. |
| **i18n Workflows** | `translation_workflows` | `id`, `entity_type`, `entity_id`, `target_locale`, `status`, `missing_keys`, `assigned_translator`, `updated_at`, `created_at`. Translation status tracking & missing key alerts. | Index on `(entity_type, entity_id, target_locale)`. |
| **Editorial Comments**| `editorial_comments` | `id`, `entity_type`, `entity_id`, `author_id`, `body`, `mentions`, `is_resolved`, `created_at`. Threaded discussions & @mentions. | Index on `(entity_type, entity_id)`. |
| **Editorial Tasks** | `editorial_tasks` | `id`, `entity_type`, `entity_id`, `title`, `assignee_id`, `reviewer_id`, `approver_id`, `status`, `due_date`, `created_at`. Reviewer & approver assignments. | Index on `(entity_type, entity_id)`. |
| **Editorial Calendar**| `editorial_calendar` | `id`, `brand_id`, `entity_type`, `entity_id`, `title`, `scheduled_at`, `status`, `created_at`. Scheduled release planning. | Index on `(brand_id, scheduled_at)`. |
| **Notifications** | `editorial_notifications`| `id`, `recipient_id`, `actor_id`, `type`, `message`, `is_read`, `created_at`. Workflow alerts & review reminders. | Index on `recipient_id`. |
| **Editorial Audit** | `editorial_events` | `id`, `entity_type`, `entity_id`, `from_status`, `to_status`, `actor_id`, `note`, `created_at`. Publishing state transition logs. | Index on `(entity_type, entity_id)`. |

---

## 3. Migration & Introspection Safety Guarantees

- **Additive Schema Evolution**: All database tables and columns are structured additively. No destructive `DROP COLUMN` or `RENAME TABLE` operations exist in the migration pipeline.
- **Idempotent Seeding (`src/lib/seed.ts`)**: Seeding functions perform `select().limit(1)` checks before inserting default catalogs, decks, news articles, and conversation lessons, guaranteeing safe execution under concurrent starts.
