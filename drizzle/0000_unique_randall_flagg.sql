CREATE TABLE "asset_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"name" varchar(128) NOT NULL,
	"description" text,
	"category" varchar(64) DEFAULT 'general',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"name" varchar(128) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"parent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_usages" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"field" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"url" text NOT NULL,
	"bytes" integer,
	"mime_type" varchar(128),
	"change_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"folder_id" integer,
	"collection_id" integer,
	"kind" varchar(32) NOT NULL,
	"url" text NOT NULL,
	"cdn_url" text,
	"title" varchar(256),
	"alt_text" varchar(512),
	"caption" text,
	"category" varchar(64) DEFAULT 'media',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"copyright" varchar(256),
	"licensing" varchar(128),
	"owner" varchar(128),
	"usage_rights" varchar(128),
	"expires_at" timestamp with time zone,
	"checksum" varchar(128),
	"mime_type" varchar(128),
	"bytes" integer,
	"width" integer,
	"height" integer,
	"aspect_ratio" varchar(16),
	"variants" jsonb DEFAULT '{}'::jsonb,
	"transcode_status" varchar(32) DEFAULT 'ready',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"actor_id" integer,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"category" varchar(64) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"tagline" varchar(256),
	"default_locale" varchar(12) DEFAULT 'en' NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"page_slug" varchar(128) NOT NULL,
	"section_key" varchar(64) NOT NULL,
	"title" varchar(256),
	"subtitle" text,
	"content" jsonb DEFAULT '{}'::jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'published' NOT NULL,
	"locale" varchar(12) DEFAULT 'en' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_summary" text,
	"is_autosave" boolean DEFAULT false NOT NULL,
	"author_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"category" varchar(64) NOT NULL,
	"title" varchar(256) NOT NULL,
	"situation" text NOT NULL,
	"difficulty_level" varchar(12) DEFAULT 'N5',
	"dialogues" jsonb DEFAULT '[]'::jsonb,
	"vocabulary" jsonb DEFAULT '[]'::jsonb,
	"grammar_notes" jsonb DEFAULT '[]'::jsonb,
	"role_play_prompt" text,
	"audio_url" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"slug" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"level" varchar(32) DEFAULT 'beginner' NOT NULL,
	"locale" varchar(12) DEFAULT 'en' NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"cover_asset_id" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_deck_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"card_type" varchar(32) DEFAULT 'vocab' NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"furigana" varchar(256),
	"romaji" varchar(256),
	"notes" text,
	"audio_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"ease_factor" integer DEFAULT 250 NOT NULL,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"accuracy" integer DEFAULT 100 NOT NULL,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_decks" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"title" varchar(256) NOT NULL,
	"description" text,
	"jlpt_level" varchar(12) DEFAULT 'N5',
	"is_public" boolean DEFAULT true NOT NULL,
	"share_code" varchar(64),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"card_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"user_email" varchar(256) NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloadable_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"title" varchar(256) NOT NULL,
	"description" text,
	"file_type" varchar(32) NOT NULL,
	"category" varchar(64) NOT NULL,
	"file_url" text NOT NULL,
	"file_size" varchar(32),
	"format" varchar(32) DEFAULT 'PDF',
	"requires_registration" boolean DEFAULT true NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"rating" integer DEFAULT 49 NOT NULL,
	"rating_count" integer DEFAULT 128 NOT NULL,
	"bookmark_count" integer DEFAULT 42 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"jlpt_level" varchar(12) DEFAULT 'N5',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_calendar" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"title" varchar(256) NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"author_id" integer,
	"body" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"from_status" varchar(24),
	"to_status" varchar(24) NOT NULL,
	"actor_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_id" integer,
	"actor_id" integer,
	"type" varchar(64) NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"title" varchar(256) NOT NULL,
	"assignee_id" integer,
	"reviewer_id" integer,
	"approver_id" integer,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jlpt_exam_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"jlpt_level" varchar(12) DEFAULT 'N5' NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"max_score" integer DEFAULT 180 NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"vocab_score" integer DEFAULT 0 NOT NULL,
	"grammar_score" integer DEFAULT 0 NOT NULL,
	"reading_score" integer DEFAULT 0 NOT NULL,
	"certificate_code" varchar(64),
	"incorrect_answers" jsonb DEFAULT '[]'::jsonb,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanji_dictionary" (
	"id" serial PRIMARY KEY NOT NULL,
	"kanji" varchar(16) NOT NULL,
	"meaning" varchar(256) NOT NULL,
	"onyomi" varchar(128),
	"kunyomi" varchar(128),
	"radicals" varchar(128),
	"stroke_count" integer NOT NULL,
	"frequency_rank" integer,
	"grade_level" integer DEFAULT 1,
	"jlpt_level" varchar(12) DEFAULT 'N5',
	"theme_category" varchar(64) DEFAULT 'nature',
	"audio_url" text,
	"stroke_order_svg" text,
	"component_breakdown" jsonb DEFAULT '[]'::jsonb,
	"kanji_families" jsonb DEFAULT '[]'::jsonb,
	"similar_kanji" jsonb DEFAULT '[]'::jsonb,
	"is_favorite" boolean DEFAULT false,
	"mastery_score" integer DEFAULT 0,
	"examples" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboards" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"xp" integer NOT NULL,
	"rank" integer NOT NULL,
	"avatar_emoji" varchar(8) DEFAULT '🦊',
	"streak_days" integer DEFAULT 1 NOT NULL,
	"league" varchar(32) DEFAULT 'Sapphire League' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_gamification" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"brand_id" integer,
	"xp" integer DEFAULT 420 NOT NULL,
	"streak_days" integer DEFAULT 8 NOT NULL,
	"daily_goal_minutes" integer DEFAULT 15 NOT NULL,
	"weekly_goal_minutes" integer DEFAULT 90 NOT NULL,
	"total_study_minutes" integer DEFAULT 135 NOT NULL,
	"completed_lessons_count" integer DEFAULT 14 NOT NULL,
	"completed_reviews_count" integer DEFAULT 95 NOT NULL,
	"average_test_score" integer DEFAULT 92 NOT NULL,
	"streak_freezes" integer DEFAULT 2 NOT NULL,
	"level" integer DEFAULT 3 NOT NULL,
	"level_title" varchar(64) DEFAULT 'Hiragana Adept' NOT NULL,
	"bookmarks" jsonb DEFAULT '[1,2]'::jsonb,
	"achievements" jsonb DEFAULT '["First 100 XP","7-Day Streak Warrior","Kanji Novice"]'::jsonb,
	"badges" jsonb DEFAULT '[{"name":"First 100 XP","icon":"⚡","description":"Earned your first 100 XP"},{"name":"7-Day Streak","icon":"🔥","description":"Studied 7 days in a row"}]'::jsonb,
	"daily_challenges" jsonb DEFAULT '[{"title":"Review 10 flashcards in Spaced Repetition","xpReward":20,"isCompleted":true},{"title":"Read today’s Japanese news article","xpReward":30,"isCompleted":true}]'::jsonb,
	"weak_areas" jsonb DEFAULT '[{"item":"食べる (taberu)","meaning":"To eat (Ichidan verb)","accuracy":65},{"item":"日本 (nihon)","meaning":"Japan (4 strokes)","accuracy":70}]'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"slug" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"video_asset_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"title" varchar(256) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"slug" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"summary" text NOT NULL,
	"japanese_text" text NOT NULL,
	"furigana_text" text,
	"english_translation" text NOT NULL,
	"tamil_translation" text,
	"malayalam_translation" text,
	"difficulty_level" varchar(12) DEFAULT 'N5' NOT NULL,
	"reading_minutes" integer DEFAULT 3 NOT NULL,
	"audio_url" text,
	"grammar_highlights" jsonb DEFAULT '[]'::jsonb,
	"extracted_vocabulary" jsonb DEFAULT '[]'::jsonb,
	"extracted_kanji" jsonb DEFAULT '[]'::jsonb,
	"comprehension_questions" jsonb DEFAULT '[]'::jsonb,
	"is_today" boolean DEFAULT false NOT NULL,
	"status" varchar(24) DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nihongo_learning_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"category" varchar(64) NOT NULL,
	"jlpt_level" varchar(12) DEFAULT 'N5',
	"japanese" varchar(256) NOT NULL,
	"furigana" varchar(256),
	"romaji" varchar(256),
	"meaning" text NOT NULL,
	"part_of_speech" varchar(64) DEFAULT 'Noun',
	"pitch_accent" varchar(64),
	"image_url" text,
	"synonyms" jsonb DEFAULT '[]'::jsonb,
	"antonyms" jsonb DEFAULT '[]'::jsonb,
	"frequency" integer DEFAULT 100,
	"is_favorite" boolean DEFAULT false,
	"is_bookmarked" boolean DEFAULT false,
	"review_status" varchar(32) DEFAULT 'learning',
	"example_sentence_ja" text,
	"example_sentence_en" text,
	"grammar_structure" text,
	"stroke_count" integer,
	"radicals" varchar(128),
	"audio_url" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(24) DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nihongo_quizzes" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"category" varchar(64) NOT NULL,
	"jlpt_level" varchar(12) DEFAULT 'N5',
	"section_type" varchar(32) DEFAULT 'vocabulary',
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer DEFAULT 0 NOT NULL,
	"explanation" text,
	"audio_prompt" text,
	"time_limit_seconds" integer DEFAULT 60,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"slug" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"locale" varchar(12) DEFAULT 'en' NOT NULL,
	"author_id" integer,
	"hero_asset_id" integer,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_flashcards" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"user_id" integer,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"ease_factor" integer DEFAULT 250 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_japan_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"category" varchar(64) NOT NULL,
	"title" varchar(256) NOT NULL,
	"summary" text NOT NULL,
	"body" text,
	"location" varchar(128),
	"stipend_tuition" varchar(128),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_text" text NOT NULL,
	"source_locale" varchar(12) DEFAULT 'en' NOT NULL,
	"target_locale" varchar(12) NOT NULL,
	"translated_text" text NOT NULL,
	"context" varchar(128),
	"quality_score" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"target_locale" varchar(12) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"missing_keys" jsonb DEFAULT '[]'::jsonb,
	"assigned_translator" varchar(128),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"locale" varchar(12) NOT NULL,
	"field" varchar(64) NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_word_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"title" varchar(256) NOT NULL,
	"share_code" varchar(64),
	"words" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(256) NOT NULL,
	"display_name" varchar(128),
	"role" varchar(32) DEFAULT 'learner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_collections" ADD CONSTRAINT "asset_collections_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_usages" ADD CONSTRAINT "asset_usages_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_folder_id_asset_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."asset_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_collection_id_asset_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."asset_collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_settings" ADD CONSTRAINT "brand_settings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_sections" ADD CONSTRAINT "content_sections_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_lessons" ADD CONSTRAINT "conversation_lessons_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_cover_asset_id_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_deck_cards" ADD CONSTRAINT "custom_deck_cards_deck_id_custom_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."custom_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_decks" ADD CONSTRAINT "custom_decks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_history" ADD CONSTRAINT "download_history_resource_id_downloadable_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."downloadable_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloadable_resources" ADD CONSTRAINT "downloadable_resources_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_calendar" ADD CONSTRAINT "editorial_calendar_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_comments" ADD CONSTRAINT "editorial_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_events" ADD CONSTRAINT "editorial_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_notifications" ADD CONSTRAINT "editorial_notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_notifications" ADD CONSTRAINT "editorial_notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_tasks" ADD CONSTRAINT "editorial_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_tasks" ADD CONSTRAINT "editorial_tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_tasks" ADD CONSTRAINT "editorial_tasks_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jlpt_exam_sessions" ADD CONSTRAINT "jlpt_exam_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_gamification" ADD CONSTRAINT "learner_gamification_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_gamification" ADD CONSTRAINT "learner_gamification_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_video_asset_id_assets_id_fk" FOREIGN KEY ("video_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nihongo_learning_items" ADD CONSTRAINT "nihongo_learning_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nihongo_quizzes" ADD CONSTRAINT "nihongo_quizzes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_hero_asset_id_assets_id_fk" FOREIGN KEY ("hero_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_flashcards" ADD CONSTRAINT "srs_flashcards_item_id_nihongo_learning_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."nihongo_learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_flashcards" ADD CONSTRAINT "srs_flashcards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_japan_items" ADD CONSTRAINT "study_japan_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_word_lists" ADD CONSTRAINT "user_word_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_collections_brand_idx" ON "asset_collections" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "asset_folders_brand_idx" ON "asset_folders" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "asset_usages_asset_idx" ON "asset_usages" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_usages_entity_idx" ON "asset_usages" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "asset_versions_asset_idx" ON "asset_versions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assets_brand_idx" ON "assets" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "assets_kind_idx" ON "assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "assets_checksum_idx" ON "assets" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "assets_category_idx" ON "assets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_settings_category_unique" ON "brand_settings" USING btree ("brand_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_unique" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_sections_lookup_unique" ON "content_sections" USING btree ("brand_id","page_slug","section_key","locale");--> statement-breakpoint
CREATE INDEX "content_sections_key_idx" ON "content_sections" USING btree ("section_key");--> statement-breakpoint
CREATE INDEX "content_versions_entity_idx" ON "content_versions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "conv_lessons_cat_idx" ON "conversation_lessons" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_brand_slug_locale_unique" ON "courses" USING btree ("brand_id","slug","locale");--> statement-breakpoint
CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "custom_deck_cards_deck_idx" ON "custom_deck_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "custom_decks_share_idx" ON "custom_decks" USING btree ("share_code");--> statement-breakpoint
CREATE INDEX "download_hist_user_idx" ON "download_history" USING btree ("user_email");--> statement-breakpoint
CREATE INDEX "download_res_cat_idx" ON "downloadable_resources" USING btree ("category");--> statement-breakpoint
CREATE INDEX "editorial_calendar_lookup_idx" ON "editorial_calendar" USING btree ("brand_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "editorial_comments_lookup_idx" ON "editorial_comments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "editorial_events_entity_idx" ON "editorial_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "editorial_notif_recipient_idx" ON "editorial_notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "editorial_tasks_lookup_idx" ON "editorial_tasks" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "jlpt_exam_cert_idx" ON "jlpt_exam_sessions" USING btree ("certificate_code");--> statement-breakpoint
CREATE UNIQUE INDEX "kanji_dict_unique" ON "kanji_dictionary" USING btree ("kanji");--> statement-breakpoint
CREATE INDEX "kanji_dict_jlpt_idx" ON "kanji_dictionary" USING btree ("jlpt_level");--> statement-breakpoint
CREATE INDEX "kanji_dict_theme_idx" ON "kanji_dictionary" USING btree ("theme_category");--> statement-breakpoint
CREATE INDEX "leaderboards_rank_idx" ON "leaderboards" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "learner_gamify_idx" ON "learner_gamification" USING btree ("user_id","brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_module_slug_unique" ON "lessons" USING btree ("module_id","slug");--> statement-breakpoint
CREATE INDEX "modules_course_idx" ON "modules" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "news_articles_slug_idx" ON "news_articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "news_articles_today_idx" ON "news_articles" USING btree ("is_today");--> statement-breakpoint
CREATE INDEX "nihongo_items_category_idx" ON "nihongo_learning_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "nihongo_items_jlpt_idx" ON "nihongo_learning_items" USING btree ("jlpt_level");--> statement-breakpoint
CREATE INDEX "nihongo_quizzes_cat_idx" ON "nihongo_quizzes" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_brand_slug_locale_unique" ON "pages" USING btree ("brand_id","slug","locale");--> statement-breakpoint
CREATE INDEX "pages_status_idx" ON "pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "srs_flashcards_item_user_idx" ON "srs_flashcards" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE INDEX "study_japan_cat_idx" ON "study_japan_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "translation_memory_lookup_idx" ON "translation_memory" USING btree ("source_locale","target_locale");--> statement-breakpoint
CREATE INDEX "translation_workflows_lookup_idx" ON "translation_workflows" USING btree ("entity_type","entity_id","target_locale");--> statement-breakpoint
CREATE UNIQUE INDEX "translations_lookup_unique" ON "translations" USING btree ("entity_type","entity_id","locale","field");--> statement-breakpoint
CREATE INDEX "user_word_lists_share_idx" ON "user_word_lists" USING btree ("share_code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");