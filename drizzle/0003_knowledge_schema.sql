-- Knowledge domain: dictionary, kanji, radicals, grammar, sentences,
-- conjugations, and the provenance tables that license every imported row.
--
-- pg_trgm is created here rather than assumed. Six GIN trigram indexes below
-- depend on it, and the Phase 00 audit flagged the extension as UNVERIFIED:
-- the dictionary service called similarity() while nothing guaranteed the
-- extension existed. Creating it alongside the indexes that need it removes
-- the gap. IF NOT EXISTS keeps this safe on databases that already have it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."dictionary_form_kind" AS ENUM('kana', 'kanji');--> statement-breakpoint
CREATE TYPE "public"."grammar_register" AS ENUM('casual', 'neutral', 'polite', 'formal', 'written');--> statement-breakpoint
CREATE TYPE "public"."kanji_component_position" AS ENUM('hen', 'tsukuri', 'kanmuri', 'ashi', 'tare', 'nyou', 'kamae', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."kanji_reading_kind" AS ENUM('on', 'kun', 'nanori');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_status" AS ENUM('active', 'deprecated', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."polarity" AS ENUM('affirmative', 'negative');--> statement-breakpoint
CREATE TYPE "public"."politeness" AS ENUM('plain', 'polite');--> statement-breakpoint
CREATE TYPE "public"."provenance_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tense" AS ENUM('nonpast', 'past', 'atemporal');--> statement-breakpoint
CREATE TYPE "public"."word_class" AS ENUM('ichidan', 'godan', 'suru_irregular', 'kuru_irregular', 'i_adjective', 'na_adjective', 'copula');--> statement-breakpoint
CREATE TABLE "conjugations" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"word_class" "word_class" NOT NULL,
	"form" varchar(60) NOT NULL,
	"surface" varchar(240) NOT NULL,
	"reading" varchar(240),
	"politeness" "politeness" DEFAULT 'plain' NOT NULL,
	"polarity" "polarity" DEFAULT 'affirmative' NOT NULL,
	"tense" "tense" DEFAULT 'nonpast' NOT NULL,
	"is_generated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conjugations_surface_not_blank" CHECK (btrim("conjugations"."surface") <> '')
);
--> statement-breakpoint
CREATE TABLE "dictionary_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_ref" varchar(120) NOT NULL,
	"provenance_id" text,
	"checksum" varchar(64),
	"headword" varchar(200) NOT NULL,
	"reading" varchar(200) NOT NULL,
	"romaji" varchar(240),
	"is_common" boolean DEFAULT false NOT NULL,
	"jlpt_level" smallint,
	"frequency_rank" integer,
	"parts_of_speech" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_entries_jlpt_check" CHECK ("dictionary_entries"."jlpt_level" IS NULL OR "dictionary_entries"."jlpt_level" BETWEEN 1 AND 5),
	CONSTRAINT "dictionary_entries_headword_not_blank" CHECK (btrim("dictionary_entries"."headword") <> '')
);
--> statement-breakpoint
CREATE TABLE "dictionary_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"kind" "dictionary_form_kind" DEFAULT 'kana' NOT NULL,
	"text" varchar(200) NOT NULL,
	"romaji" varchar(240),
	"is_primary" boolean DEFAULT false NOT NULL,
	"restrictions" text[],
	"tags" text[],
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_senses" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"glosses" jsonb NOT NULL,
	"parts_of_speech" text[],
	"fields" text[],
	"misc" text[],
	"dialects" text[],
	"info" text,
	"cross_references" text[],
	"antonyms" text[],
	CONSTRAINT "dictionary_senses_glosses_object" CHECK (jsonb_typeof("dictionary_senses"."glosses") = 'object')
);
--> statement-breakpoint
CREATE TABLE "grammar_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_ref" varchar(120),
	"provenance_id" text,
	"slug" varchar(160) NOT NULL,
	"pattern" varchar(200) NOT NULL,
	"pattern_normalized" varchar(200) NOT NULL,
	"meaning" text NOT NULL,
	"meaning_translations" jsonb,
	"formation" text,
	"jlpt_level" smallint,
	"register" "grammar_register" DEFAULT 'neutral' NOT NULL,
	"notes" text,
	"common_mistakes" text,
	"related_slugs" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_patterns_jlpt_check" CHECK ("grammar_patterns"."jlpt_level" IS NULL OR "grammar_patterns"."jlpt_level" BETWEEN 1 AND 5),
	CONSTRAINT "grammar_patterns_slug_not_blank" CHECK (btrim("grammar_patterns"."slug") <> '')
);
--> statement-breakpoint
CREATE TABLE "kanji_components" (
	"id" text PRIMARY KEY NOT NULL,
	"kanji_id" text NOT NULL,
	"component_character" varchar(8) NOT NULL,
	"component_kanji_id" text,
	"radical_id" text,
	"is_classifying_radical" boolean DEFAULT false NOT NULL,
	"position" "kanji_component_position" DEFAULT 'unknown' NOT NULL,
	"ordinal" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanji_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_ref" varchar(120) NOT NULL,
	"provenance_id" text,
	"checksum" varchar(64),
	"character" varchar(8) NOT NULL,
	"codepoint" varchar(12) NOT NULL,
	"stroke_count" smallint NOT NULL,
	"grade" smallint,
	"jlpt_level" smallint,
	"frequency_rank" integer,
	"meanings" text[] NOT NULL,
	"radical_id" text,
	"classical_radical_number" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kanji_entries_jlpt_check" CHECK ("kanji_entries"."jlpt_level" IS NULL OR "kanji_entries"."jlpt_level" BETWEEN 1 AND 5),
	CONSTRAINT "kanji_entries_grade_check" CHECK ("kanji_entries"."grade" IS NULL OR "kanji_entries"."grade" BETWEEN 1 AND 10),
	CONSTRAINT "kanji_entries_stroke_count_check" CHECK ("kanji_entries"."stroke_count" BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "kanji_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"kanji_id" text NOT NULL,
	"kind" "kanji_reading_kind" NOT NULL,
	"reading" varchar(120) NOT NULL,
	"reading_normalized" varchar(120) NOT NULL,
	"romaji" varchar(160),
	"is_primary" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_provenance" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_version" varchar(80) NOT NULL,
	"pipeline_version" varchar(80) NOT NULL,
	"input_checksum" varchar(64),
	"status" "provenance_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"records_read" integer DEFAULT 0 NOT NULL,
	"records_written" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"license" varchar(120) NOT NULL,
	"license_url" text,
	"attribution" text NOT NULL,
	"homepage_url" text,
	"download_url" text,
	"version" varchar(80) NOT NULL,
	"released_at" timestamp with time zone,
	"license_verified" boolean DEFAULT false NOT NULL,
	"license_verified_at" timestamp with time zone,
	"license_note" text,
	"status" "knowledge_source_status" DEFAULT 'blocked' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sources_active_requires_license_check" CHECK ("knowledge_sources"."status" <> 'active' OR "knowledge_sources"."license_verified" = true)
);
--> statement-breakpoint
CREATE TABLE "radicals" (
	"id" text PRIMARY KEY NOT NULL,
	"number" smallint NOT NULL,
	"character" varchar(8) NOT NULL,
	"variants" text[],
	"stroke_count" smallint NOT NULL,
	"meaning" varchar(200) NOT NULL,
	"reading_ja" varchar(120),
	"reading_romaji" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radicals_number_check" CHECK ("radicals"."number" BETWEEN 1 AND 214),
	CONSTRAINT "radicals_stroke_count_check" CHECK ("radicals"."stroke_count" BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "sentences" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_ref" varchar(120),
	"provenance_id" text,
	"checksum" varchar(64),
	"japanese" text NOT NULL,
	"reading" text,
	"furigana" jsonb,
	"translations" jsonb NOT NULL,
	"jlpt_level" smallint,
	"tags" text[],
	"audio_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentences_japanese_not_blank" CHECK (btrim("sentences"."japanese") <> ''),
	CONSTRAINT "sentences_translations_object" CHECK (jsonb_typeof("sentences"."translations") = 'object'),
	CONSTRAINT "sentences_jlpt_check" CHECK ("sentences"."jlpt_level" IS NULL OR "sentences"."jlpt_level" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "conjugations" ADD CONSTRAINT "conjugations_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_provenance_id_knowledge_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."knowledge_provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_readings" ADD CONSTRAINT "dictionary_readings_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_senses" ADD CONSTRAINT "dictionary_senses_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_patterns" ADD CONSTRAINT "grammar_patterns_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_patterns" ADD CONSTRAINT "grammar_patterns_provenance_id_knowledge_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."knowledge_provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_components" ADD CONSTRAINT "kanji_components_kanji_id_kanji_entries_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."kanji_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_components" ADD CONSTRAINT "kanji_components_component_kanji_id_kanji_entries_id_fk" FOREIGN KEY ("component_kanji_id") REFERENCES "public"."kanji_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_components" ADD CONSTRAINT "kanji_components_radical_id_radicals_id_fk" FOREIGN KEY ("radical_id") REFERENCES "public"."radicals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_entries" ADD CONSTRAINT "kanji_entries_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_entries" ADD CONSTRAINT "kanji_entries_provenance_id_knowledge_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."knowledge_provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_entries" ADD CONSTRAINT "kanji_entries_radical_id_radicals_id_fk" FOREIGN KEY ("radical_id") REFERENCES "public"."radicals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_readings" ADD CONSTRAINT "kanji_readings_kanji_id_kanji_entries_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."kanji_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_provenance" ADD CONSTRAINT "knowledge_provenance_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_provenance_id_knowledge_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."knowledge_provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conjugations_entry_form_idx" ON "conjugations" USING btree ("entry_id","form");--> statement-breakpoint
CREATE INDEX "conjugations_entry_idx" ON "conjugations" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "conjugations_surface_idx" ON "conjugations" USING btree ("surface");--> statement-breakpoint
CREATE INDEX "conjugations_surface_trgm_idx" ON "conjugations" USING gin ("surface" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_entries_source_ref_idx" ON "dictionary_entries" USING btree ("source_id","source_ref");--> statement-breakpoint
CREATE INDEX "dictionary_entries_headword_idx" ON "dictionary_entries" USING btree ("headword");--> statement-breakpoint
CREATE INDEX "dictionary_entries_reading_idx" ON "dictionary_entries" USING btree ("reading");--> statement-breakpoint
CREATE INDEX "dictionary_entries_jlpt_idx" ON "dictionary_entries" USING btree ("jlpt_level");--> statement-breakpoint
CREATE INDEX "dictionary_entries_common_idx" ON "dictionary_entries" USING btree ("is_common");--> statement-breakpoint
CREATE INDEX "dictionary_entries_frequency_idx" ON "dictionary_entries" USING btree ("frequency_rank");--> statement-breakpoint
CREATE INDEX "dictionary_entries_provenance_idx" ON "dictionary_entries" USING btree ("provenance_id");--> statement-breakpoint
CREATE INDEX "dictionary_entries_headword_trgm_idx" ON "dictionary_entries" USING gin ("headword" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "dictionary_entries_reading_trgm_idx" ON "dictionary_entries" USING gin ("reading" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "dictionary_readings_entry_idx" ON "dictionary_readings" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "dictionary_readings_text_idx" ON "dictionary_readings" USING btree ("text");--> statement-breakpoint
CREATE INDEX "dictionary_readings_text_trgm_idx" ON "dictionary_readings" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_readings_unique" ON "dictionary_readings" USING btree ("entry_id","kind","text");--> statement-breakpoint
CREATE INDEX "dictionary_senses_entry_idx" ON "dictionary_senses" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_senses_position_idx" ON "dictionary_senses" USING btree ("entry_id","position");--> statement-breakpoint
CREATE INDEX "dictionary_senses_glosses_idx" ON "dictionary_senses" USING gin ("glosses");--> statement-breakpoint
CREATE UNIQUE INDEX "grammar_patterns_slug_idx" ON "grammar_patterns" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "grammar_patterns_jlpt_idx" ON "grammar_patterns" USING btree ("jlpt_level");--> statement-breakpoint
CREATE INDEX "grammar_patterns_normalized_idx" ON "grammar_patterns" USING btree ("pattern_normalized");--> statement-breakpoint
CREATE INDEX "grammar_patterns_pattern_trgm_idx" ON "grammar_patterns" USING gin ("pattern" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "kanji_components_kanji_idx" ON "kanji_components" USING btree ("kanji_id");--> statement-breakpoint
CREATE INDEX "kanji_components_character_idx" ON "kanji_components" USING btree ("component_character");--> statement-breakpoint
CREATE INDEX "kanji_components_radical_idx" ON "kanji_components" USING btree ("radical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kanji_components_unique" ON "kanji_components" USING btree ("kanji_id","component_character");--> statement-breakpoint
CREATE UNIQUE INDEX "kanji_entries_character_idx" ON "kanji_entries" USING btree ("character");--> statement-breakpoint
CREATE UNIQUE INDEX "kanji_entries_source_ref_idx" ON "kanji_entries" USING btree ("source_id","source_ref");--> statement-breakpoint
CREATE INDEX "kanji_entries_jlpt_idx" ON "kanji_entries" USING btree ("jlpt_level");--> statement-breakpoint
CREATE INDEX "kanji_entries_grade_idx" ON "kanji_entries" USING btree ("grade");--> statement-breakpoint
CREATE INDEX "kanji_entries_stroke_count_idx" ON "kanji_entries" USING btree ("stroke_count");--> statement-breakpoint
CREATE INDEX "kanji_entries_frequency_idx" ON "kanji_entries" USING btree ("frequency_rank");--> statement-breakpoint
CREATE INDEX "kanji_entries_radical_idx" ON "kanji_entries" USING btree ("radical_id");--> statement-breakpoint
CREATE INDEX "kanji_readings_kanji_idx" ON "kanji_readings" USING btree ("kanji_id");--> statement-breakpoint
CREATE INDEX "kanji_readings_normalized_idx" ON "kanji_readings" USING btree ("reading_normalized");--> statement-breakpoint
CREATE INDEX "kanji_readings_kind_idx" ON "kanji_readings" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "kanji_readings_unique" ON "kanji_readings" USING btree ("kanji_id","kind","reading");--> statement-breakpoint
CREATE INDEX "knowledge_provenance_source_idx" ON "knowledge_provenance" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_provenance_status_idx" ON "knowledge_provenance" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_provenance_started_idx" ON "knowledge_provenance" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "knowledge_sources_status_idx" ON "knowledge_sources" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "radicals_number_idx" ON "radicals" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "radicals_character_idx" ON "radicals" USING btree ("character");--> statement-breakpoint
CREATE INDEX "radicals_stroke_count_idx" ON "radicals" USING btree ("stroke_count");--> statement-breakpoint
CREATE UNIQUE INDEX "sentences_source_ref_idx" ON "sentences" USING btree ("source_id","source_ref");--> statement-breakpoint
CREATE INDEX "sentences_jlpt_idx" ON "sentences" USING btree ("jlpt_level");--> statement-breakpoint
CREATE INDEX "sentences_provenance_idx" ON "sentences" USING btree ("provenance_id");--> statement-breakpoint
CREATE INDEX "sentences_japanese_trgm_idx" ON "sentences" USING gin ("japanese" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sentences_translations_idx" ON "sentences" USING gin ("translations");