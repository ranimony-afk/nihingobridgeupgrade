CREATE TABLE "dictionary_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"headword" text NOT NULL,
	"reading" text NOT NULL,
	"romaji" text NOT NULL,
	"jlpt_level" text NOT NULL,
	"is_common" boolean DEFAULT true NOT NULL,
	"frequency_rank" integer,
	"parts_of_speech" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"senses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kanji_characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ref" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "example_sentences" (
	"id" text PRIMARY KEY NOT NULL,
	"japanese" text NOT NULL,
	"reading" text NOT NULL,
	"english" text NOT NULL,
	"jlpt_level" text NOT NULL,
	"grammar_id" text,
	"dictionary_entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kanji_characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ref" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"structure" text NOT NULL,
	"meaning" text NOT NULL,
	"explanation" text NOT NULL,
	"formation" text,
	"jlpt_level" text NOT NULL,
	"common_mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ref" text NOT NULL,
	CONSTRAINT "grammar_patterns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "jlpt_test_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"test_id" text NOT NULL,
	"question_id" text NOT NULL,
	"section_key" text NOT NULL,
	"mondai_number" integer NOT NULL,
	"order_index" integer NOT NULL,
	"points" real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jlpt_tests" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"jlpt_level" text NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"total_duration_minutes" integer NOT NULL,
	"section_durations" jsonb NOT NULL,
	"passing_score" integer DEFAULT 80 NOT NULL,
	"total_score" integer DEFAULT 180 NOT NULL,
	"section_configs" jsonb NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kana_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"character" text NOT NULL,
	"script" text NOT NULL,
	"romaji" text NOT NULL,
	"category" text NOT NULL,
	"row_key" text NOT NULL,
	"column_key" text NOT NULL,
	"base_character" text,
	"is_archaic" boolean DEFAULT false NOT NULL,
	"mnemonic" text,
	"source_ref" text NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanji_composition" (
	"id" text PRIMARY KEY NOT NULL,
	"kanji_id" text NOT NULL,
	"element_id" text NOT NULL,
	"role" text NOT NULL,
	"position" text,
	"rendered_as" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanji_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"character" text NOT NULL,
	"meaning" text NOT NULL,
	"readings_kun" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"readings_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stroke_count" integer NOT NULL,
	"jlpt_level" text NOT NULL,
	"grade_level" integer,
	"primary_radical_id" text,
	"mnemonic" text,
	"vocabulary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ref" text NOT NULL,
	CONSTRAINT "kanji_entries_character_unique" UNIQUE("character")
);
--> statement-breakpoint
CREATE TABLE "kanji_radicals" (
	"id" text PRIMARY KEY NOT NULL,
	"character" text NOT NULL,
	"alt_forms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meaning" text NOT NULL,
	"reading_kun" text,
	"reading_on" text,
	"stroke_count" integer NOT NULL,
	"kangxi_number" integer,
	"category" text NOT NULL,
	"typical_role" text NOT NULL,
	"mnemonic" text,
	"source_ref" text NOT NULL,
	CONSTRAINT "kanji_radicals_character_unique" UNIQUE("character")
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"license" text NOT NULL,
	"url" text,
	"description" text NOT NULL,
	"domain" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"jlpt_level" text NOT NULL,
	"section" text NOT NULL,
	"category" text NOT NULL,
	"mondai_number" integer NOT NULL,
	"mondai_title" text NOT NULL,
	"question_type" text NOT NULL,
	"prompt" text NOT NULL,
	"prompt_furigana" text,
	"prompt_translation" text NOT NULL,
	"passage" text,
	"passage_furigana" text,
	"passage_translation" text,
	"audio_script" text,
	"audio_url" text,
	"options" jsonb NOT NULL,
	"star_order_parts" jsonb,
	"correct_answer" text NOT NULL,
	"explanation" text NOT NULL,
	"explanation_breakdown" jsonb,
	"difficulty" integer DEFAULT 3 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"user_id" text DEFAULT 'anonymous-user' NOT NULL,
	"card_type" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"reading" text,
	"meaning" text,
	"hint" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"source_question_id" text,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"box" integer DEFAULT 0 NOT NULL,
	"stability_days" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 5 NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"is_learning" boolean DEFAULT true NOT NULL,
	"phase" text DEFAULT 'learning' NOT NULL,
	"total_reviews" integer DEFAULT 0 NOT NULL,
	"correct_reviews" integer DEFAULT 0 NOT NULL,
	"scheduler_key" text NOT NULL,
	"due_at" timestamp DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_decks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"jlpt_level" text DEFAULT 'N5' NOT NULL,
	"owner_id" text DEFAULT 'anonymous-user' NOT NULL,
	"scheduler_key" text NOT NULL,
	"scheduler_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_personalization" (
	"user_id" text PRIMARY KEY NOT NULL,
	"weakness_weight" real DEFAULT 0.5 NOT NULL,
	"urgency_weight" real DEFAULT 0.3 NOT NULL,
	"difficulty_weight" real DEFAULT 0.2 NOT NULL,
	"prefer_weak_areas" boolean DEFAULT true NOT NULL,
	"max_weak_cards_per_session" integer DEFAULT 0 NOT NULL,
	"auto_adapt_targets" boolean DEFAULT true NOT NULL,
	"weak_first" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_review_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'anonymous-user' NOT NULL,
	"deck_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"queue" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"cancelled_reason" text
);
--> statement-breakpoint
CREATE TABLE "srs_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"deck_id" text NOT NULL,
	"user_id" text DEFAULT 'anonymous-user' NOT NULL,
	"rating" text NOT NULL,
	"was_correct" boolean DEFAULT true NOT NULL,
	"time_spent_ms" integer DEFAULT 0 NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"previous_interval_days" real DEFAULT 0 NOT NULL,
	"due_at" timestamp NOT NULL,
	"scheduler_key" text NOT NULL,
	"scheduler_version" text NOT NULL,
	"params_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state_before" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state_after" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"session_id" text,
	"client_id" text,
	"device_id" text,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "srs_reviews_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "srs_schedulers" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"version" text NOT NULL,
	"description" text NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_params" jsonb NOT NULL,
	"is_built_in" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_sync_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'anonymous-user' NOT NULL,
	"device_id" text NOT NULL,
	"name" text DEFAULT 'Unnamed device' NOT NULL,
	"platform" text DEFAULT 'web' NOT NULL,
	"app_version" text DEFAULT 'unknown' NOT NULL,
	"last_pulled_at" timestamp,
	"last_pushed_at" timestamp,
	"last_registry_fingerprint" text,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_sync_log" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"user_id" text DEFAULT 'anonymous-user' NOT NULL,
	"operation" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"duplicates_skipped" integer DEFAULT 0 NOT NULL,
	"conflicts_resolved" integer DEFAULT 0 NOT NULL,
	"cards_touched" integer DEFAULT 0 NOT NULL,
	"payload_count" integer DEFAULT 0 NOT NULL,
	"cursor_before" text,
	"cursor_after" text,
	"registry_fingerprint" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"day_cutoff_hour" integer DEFAULT 4 NOT NULL,
	"daily_new_target" integer DEFAULT 20 NOT NULL,
	"daily_review_target" integer DEFAULT 200 NOT NULL,
	"max_daily_reviews" integer DEFAULT 0 NOT NULL,
	"max_daily_new" integer DEFAULT 0 NOT NULL,
	"load_balance_backlog" boolean DEFAULT true NOT NULL,
	"forecast_days" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"question_id" text NOT NULL,
	"selected_answer" text,
	"star_order_submitted" jsonb,
	"is_correct" boolean,
	"time_spent_seconds" integer DEFAULT 0 NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"test_id" text,
	"quiz_type" text NOT NULL,
	"jlpt_level" text NOT NULL,
	"section_filter" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"is_timed" boolean DEFAULT true NOT NULL,
	"time_limit_seconds" integer NOT NULL,
	"time_remaining_seconds" integer NOT NULL,
	"total_time_spent_seconds" integer DEFAULT 0 NOT NULL,
	"current_section_index" integer DEFAULT 0 NOT NULL,
	"score" real,
	"max_score" real,
	"passed" boolean,
	"section_scores" jsonb,
	"category_breakdown" jsonb,
	"recommendations" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"jlpt_level" text NOT NULL,
	"tests_completed" integer DEFAULT 0 NOT NULL,
	"drills_completed" integer DEFAULT 0 NOT NULL,
	"total_questions_answered" integer DEFAULT 0 NOT NULL,
	"total_correct_answers" integer DEFAULT 0 NOT NULL,
	"average_score_percent" real DEFAULT 0 NOT NULL,
	"streak_days" integer DEFAULT 1 NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"category_mastery" jsonb,
	"weak_grammar_points" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"target_jlpt_level" text DEFAULT 'N5' NOT NULL,
	"target_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'anonymous-user' NOT NULL,
	"event_type" text NOT NULL,
	"rule_key" text NOT NULL,
	"rule_version" text NOT NULL,
	"points" integer NOT NULL,
	"base_points" integer DEFAULT 0 NOT NULL,
	"multiplier" real DEFAULT 1 NOT NULL,
	"dedupe_key" text,
	"source_type" text NOT NULL,
	"source_id" text,
	"breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revoked_at" timestamp,
	"revoked_reason" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "xp_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "xp_rules" (
	"key" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"event_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"base_points" integer NOT NULL,
	"daily_cap" integer DEFAULT 0 NOT NULL,
	"default_params" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
