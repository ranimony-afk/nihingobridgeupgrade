CREATE TABLE "knowledge_ai_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" text NOT NULL,
	"model" varchar(160) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_audio_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" varchar(128),
	"duration_milliseconds" integer,
	"speaker" varchar(160),
	"license" text NOT NULL,
	"attribution" text NOT NULL,
	"checksum" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_collocations" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"headword" text NOT NULL,
	"collocate" text NOT NULL,
	"relation" varchar(64) DEFAULT 'cooccurrence' NOT NULL,
	"frequency" integer,
	"example" text,
	"search_text" text DEFAULT '' NOT NULL,
	"source_hash" varchar(128) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"title" varchar(160) NOT NULL,
	"source_url" text NOT NULL,
	"license" text NOT NULL,
	"attribution" text NOT NULL,
	"format" varchar(32) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"latest_version" varchar(128),
	"latest_checksum" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entity_tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" text NOT NULL,
	"semantic_tag_id" text NOT NULL,
	"confidence_bps" integer DEFAULT 10000 NOT NULL,
	"provenance" varchar(32) DEFAULT 'source' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_grammar_examples" (
	"id" text PRIMARY KEY NOT NULL,
	"grammar_point_id" text NOT NULL,
	"sentence_id" text,
	"japanese" text NOT NULL,
	"english" text,
	"explanation" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_grammar_points" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"pattern" text NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"jlpt_level" varchar(8),
	"formation" text,
	"search_text" text DEFAULT '' NOT NULL,
	"source_hash" varchar(128) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_idioms" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"expression" text NOT NULL,
	"reading" text,
	"meaning" text NOT NULL,
	"register" varchar(64),
	"jlpt_level" varchar(8),
	"search_text" text DEFAULT '' NOT NULL,
	"source_hash" varchar(128) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_import_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"source_version" varchar(128) NOT NULL,
	"source_checksum" varchar(128) NOT NULL,
	"source_path" text NOT NULL,
	"mode" varchar(32) DEFAULT 'incremental' NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"records_read" integer DEFAULT 0 NOT NULL,
	"records_written" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"cursor" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_kanji" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"literal" varchar(8) NOT NULL,
	"unicode_codepoint" varchar(16) NOT NULL,
	"radical" varchar(16),
	"grade" integer,
	"stroke_count" integer,
	"frequency_rank" integer,
	"jlpt_level" varchar(8),
	"joyo" boolean DEFAULT false NOT NULL,
	"jinmeiyo" boolean DEFAULT false NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"source_hash" varchar(128) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_kanji_components" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kanji_id" text NOT NULL,
	"component_literal" varchar(8) NOT NULL,
	"component_type" varchar(32) DEFAULT 'radical' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_kanji_meanings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kanji_id" text NOT NULL,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"meaning" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_kanji_readings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kanji_id" text NOT NULL,
	"reading" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"status" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "knowledge_kanji_strokes" (
	"id" text PRIMARY KEY NOT NULL,
	"kanji_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"stroke_number" integer NOT NULL,
	"svg_path" text NOT NULL,
	"element" varchar(8),
	"source_file" text NOT NULL,
	"source_hash" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_lexeme_glosses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sense_id" text NOT NULL,
	"language" varchar(16) DEFAULT 'eng' NOT NULL,
	"gloss" text NOT NULL,
	"type" varchar(64),
	"gender" varchar(32),
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_lexeme_readings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lexeme_id" text NOT NULL,
	"reading" text NOT NULL,
	"romaji" text,
	"no_kanji" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"pitch_accents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"furigana" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"information" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_lexeme_senses" (
	"id" text PRIMARY KEY NOT NULL,
	"lexeme_id" text NOT NULL,
	"position" integer NOT NULL,
	"part_of_speech" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dialects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"misc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applies_to_spellings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applies_to_readings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_lexeme_spellings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lexeme_id" text NOT NULL,
	"spelling" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"information" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_lexemes" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"primary_spelling" text,
	"primary_reading" text,
	"primary_gloss" text,
	"common" boolean DEFAULT false NOT NULL,
	"jlpt_level" varchar(8),
	"frequency_rank" integer,
	"search_text" text DEFAULT '' NOT NULL,
	"source_hash" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_names" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"kanji" text,
	"reading" text NOT NULL,
	"name_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"translations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"source_hash" varchar(128) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_semantic_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(128) NOT NULL,
	"label" varchar(160) NOT NULL,
	"category" varchar(64) DEFAULT 'semantic' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sentence_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sentence_id" text NOT NULL,
	"position" integer NOT NULL,
	"surface" text NOT NULL,
	"lemma" text,
	"reading" text,
	"pronunciation" text,
	"part_of_speech" varchar(128),
	"inflection_type" varchar(128),
	"inflection_form" varchar(128),
	"start_offset" integer,
	"end_offset" integer,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sentence_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"sentence_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"external_id" varchar(128),
	"language" varchar(16) NOT NULL,
	"text" text NOT NULL,
	"source_hash" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sentences" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"language" varchar(16) NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"reading" text,
	"romaji" text,
	"jlpt_level" varchar(8),
	"difficulty" integer,
	"audio_url" text,
	"license" text,
	"search_text" text DEFAULT '' NOT NULL,
	"source_hash" varchar(128) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_srs_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" text NOT NULL,
	"state" varchar(32) DEFAULT 'new' NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease_factor_bps" integer DEFAULT 250 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_srs_reviews" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"rating" integer NOT NULL,
	"previous_interval_days" integer NOT NULL,
	"next_interval_days" integer NOT NULL,
	"previous_ease_factor_bps" integer NOT NULL,
	"next_ease_factor_bps" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_validation_issues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"import_run_id" text NOT NULL,
	"severity" varchar(16) NOT NULL,
	"code" varchar(96) NOT NULL,
	"record_locator" text,
	"message" text NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_ai_metadata" ADD CONSTRAINT "knowledge_ai_metadata_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_audio_assets" ADD CONSTRAINT "knowledge_audio_assets_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_collocations" ADD CONSTRAINT "knowledge_collocations_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entity_tags" ADD CONSTRAINT "knowledge_entity_tags_semantic_tag_id_knowledge_semantic_tags_id_fk" FOREIGN KEY ("semantic_tag_id") REFERENCES "public"."knowledge_semantic_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_grammar_examples" ADD CONSTRAINT "knowledge_grammar_examples_grammar_point_id_knowledge_grammar_points_id_fk" FOREIGN KEY ("grammar_point_id") REFERENCES "public"."knowledge_grammar_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_grammar_examples" ADD CONSTRAINT "knowledge_grammar_examples_sentence_id_knowledge_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."knowledge_sentences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_grammar_points" ADD CONSTRAINT "knowledge_grammar_points_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_idioms" ADD CONSTRAINT "knowledge_idioms_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_import_runs" ADD CONSTRAINT "knowledge_import_runs_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_kanji" ADD CONSTRAINT "knowledge_kanji_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_kanji_components" ADD CONSTRAINT "knowledge_kanji_components_kanji_id_knowledge_kanji_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."knowledge_kanji"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_kanji_meanings" ADD CONSTRAINT "knowledge_kanji_meanings_kanji_id_knowledge_kanji_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."knowledge_kanji"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_kanji_readings" ADD CONSTRAINT "knowledge_kanji_readings_kanji_id_knowledge_kanji_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."knowledge_kanji"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_kanji_strokes" ADD CONSTRAINT "knowledge_kanji_strokes_kanji_id_knowledge_kanji_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."knowledge_kanji"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_kanji_strokes" ADD CONSTRAINT "knowledge_kanji_strokes_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_lexeme_glosses" ADD CONSTRAINT "knowledge_lexeme_glosses_sense_id_knowledge_lexeme_senses_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."knowledge_lexeme_senses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_lexeme_readings" ADD CONSTRAINT "knowledge_lexeme_readings_lexeme_id_knowledge_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."knowledge_lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_lexeme_senses" ADD CONSTRAINT "knowledge_lexeme_senses_lexeme_id_knowledge_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."knowledge_lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_lexeme_spellings" ADD CONSTRAINT "knowledge_lexeme_spellings_lexeme_id_knowledge_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."knowledge_lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_lexemes" ADD CONSTRAINT "knowledge_lexemes_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_names" ADD CONSTRAINT "knowledge_names_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_tokens" ADD CONSTRAINT "knowledge_sentence_tokens_sentence_id_knowledge_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."knowledge_sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_translations" ADD CONSTRAINT "knowledge_sentence_translations_sentence_id_knowledge_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."knowledge_sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_translations" ADD CONSTRAINT "knowledge_sentence_translations_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentences" ADD CONSTRAINT "knowledge_sentences_dataset_id_knowledge_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."knowledge_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_srs_cards" ADD CONSTRAINT "knowledge_srs_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_srs_reviews" ADD CONSTRAINT "knowledge_srs_reviews_card_id_knowledge_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."knowledge_srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_validation_issues" ADD CONSTRAINT "knowledge_validation_issues_import_run_id_knowledge_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."knowledge_import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_ai_metadata_version_unique" ON "knowledge_ai_metadata" USING btree ("entity_type","entity_id","model","prompt_version","content_hash");--> statement-breakpoint
CREATE INDEX "knowledge_ai_metadata_status_idx" ON "knowledge_ai_metadata" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_audio_assets_url_unique" ON "knowledge_audio_assets" USING btree ("url");--> statement-breakpoint
CREATE INDEX "knowledge_audio_assets_entity_idx" ON "knowledge_audio_assets" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_collocations_dataset_external_unique" ON "knowledge_collocations" USING btree ("dataset_id","external_id");--> statement-breakpoint
CREATE INDEX "knowledge_collocations_headword_idx" ON "knowledge_collocations" USING btree ("headword");--> statement-breakpoint
CREATE INDEX "knowledge_collocations_collocate_idx" ON "knowledge_collocations" USING btree ("collocate");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_datasets_key_unique" ON "knowledge_datasets" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_entity_tags_unique" ON "knowledge_entity_tags" USING btree ("entity_type","entity_id","semantic_tag_id");--> statement-breakpoint
CREATE INDEX "knowledge_entity_tags_tag_idx" ON "knowledge_entity_tags" USING btree ("semantic_tag_id");--> statement-breakpoint
CREATE INDEX "knowledge_grammar_examples_point_idx" ON "knowledge_grammar_examples" USING btree ("grammar_point_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_grammar_points_dataset_external_unique" ON "knowledge_grammar_points" USING btree ("dataset_id","external_id");--> statement-breakpoint
CREATE INDEX "knowledge_grammar_points_jlpt_idx" ON "knowledge_grammar_points" USING btree ("jlpt_level");--> statement-breakpoint
CREATE INDEX "knowledge_grammar_points_pattern_idx" ON "knowledge_grammar_points" USING btree ("pattern");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_idioms_dataset_external_unique" ON "knowledge_idioms" USING btree ("dataset_id","external_id");--> statement-breakpoint
CREATE INDEX "knowledge_idioms_expression_idx" ON "knowledge_idioms" USING btree ("expression");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_import_runs_dataset_revision_unique" ON "knowledge_import_runs" USING btree ("dataset_id","source_version","source_checksum");--> statement-breakpoint
CREATE INDEX "knowledge_import_runs_dataset_status_idx" ON "knowledge_import_runs" USING btree ("dataset_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_kanji_literal_unique" ON "knowledge_kanji" USING btree ("literal");--> statement-breakpoint
CREATE INDEX "knowledge_kanji_jlpt_frequency_idx" ON "knowledge_kanji" USING btree ("jlpt_level","frequency_rank");--> statement-breakpoint
CREATE INDEX "knowledge_kanji_radical_idx" ON "knowledge_kanji" USING btree ("radical");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_kanji_components_unique" ON "knowledge_kanji_components" USING btree ("kanji_id","component_literal","component_type");--> statement-breakpoint
CREATE INDEX "knowledge_kanji_components_literal_idx" ON "knowledge_kanji_components" USING btree ("component_literal");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_kanji_meanings_unique" ON "knowledge_kanji_meanings" USING btree ("kanji_id","language","meaning");--> statement-breakpoint
CREATE INDEX "knowledge_kanji_meanings_meaning_idx" ON "knowledge_kanji_meanings" USING btree ("meaning");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_kanji_readings_unique" ON "knowledge_kanji_readings" USING btree ("kanji_id","reading","kind");--> statement-breakpoint
CREATE INDEX "knowledge_kanji_readings_reading_idx" ON "knowledge_kanji_readings" USING btree ("reading");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_kanji_strokes_unique" ON "knowledge_kanji_strokes" USING btree ("kanji_id","dataset_id","stroke_number");--> statement-breakpoint
CREATE INDEX "knowledge_kanji_strokes_kanji_idx" ON "knowledge_kanji_strokes" USING btree ("kanji_id");--> statement-breakpoint
CREATE INDEX "knowledge_lexeme_glosses_language_gloss_idx" ON "knowledge_lexeme_glosses" USING btree ("language","gloss");--> statement-breakpoint
CREATE INDEX "knowledge_lexeme_glosses_sense_idx" ON "knowledge_lexeme_glosses" USING btree ("sense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_lexeme_readings_unique" ON "knowledge_lexeme_readings" USING btree ("lexeme_id","reading");--> statement-breakpoint
CREATE INDEX "knowledge_lexeme_readings_reading_idx" ON "knowledge_lexeme_readings" USING btree ("reading");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_lexeme_senses_position_unique" ON "knowledge_lexeme_senses" USING btree ("lexeme_id","position");--> statement-breakpoint
CREATE INDEX "knowledge_lexeme_senses_lexeme_idx" ON "knowledge_lexeme_senses" USING btree ("lexeme_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_lexeme_spellings_unique" ON "knowledge_lexeme_spellings" USING btree ("lexeme_id","spelling");--> statement-breakpoint
CREATE INDEX "knowledge_lexeme_spellings_spelling_idx" ON "knowledge_lexeme_spellings" USING btree ("spelling");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_lexemes_dataset_external_unique" ON "knowledge_lexemes" USING btree ("dataset_id","external_id");--> statement-breakpoint
CREATE INDEX "knowledge_lexemes_spelling_idx" ON "knowledge_lexemes" USING btree ("primary_spelling");--> statement-breakpoint
CREATE INDEX "knowledge_lexemes_reading_idx" ON "knowledge_lexemes" USING btree ("primary_reading");--> statement-breakpoint
CREATE INDEX "knowledge_lexemes_jlpt_frequency_idx" ON "knowledge_lexemes" USING btree ("jlpt_level","frequency_rank");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_names_dataset_external_unique" ON "knowledge_names" USING btree ("dataset_id","external_id");--> statement-breakpoint
CREATE INDEX "knowledge_names_kanji_idx" ON "knowledge_names" USING btree ("kanji");--> statement-breakpoint
CREATE INDEX "knowledge_names_reading_idx" ON "knowledge_names" USING btree ("reading");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_semantic_tags_slug_unique" ON "knowledge_semantic_tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sentence_tokens_position_unique" ON "knowledge_sentence_tokens" USING btree ("sentence_id","position");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_tokens_lemma_idx" ON "knowledge_sentence_tokens" USING btree ("lemma");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sentence_translations_unique" ON "knowledge_sentence_translations" USING btree ("sentence_id","language","text");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_translations_language_idx" ON "knowledge_sentence_translations" USING btree ("language");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sentences_dataset_external_unique" ON "knowledge_sentences" USING btree ("dataset_id","external_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentences_language_jlpt_idx" ON "knowledge_sentences" USING btree ("language","jlpt_level");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_srs_cards_user_entity_unique" ON "knowledge_srs_cards" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_srs_cards_user_due_idx" ON "knowledge_srs_cards" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "knowledge_srs_reviews_card_reviewed_idx" ON "knowledge_srs_reviews" USING btree ("card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "knowledge_validation_issues_run_severity_idx" ON "knowledge_validation_issues" USING btree ("import_run_id","severity");--> statement-breakpoint
CREATE INDEX "knowledge_validation_issues_code_idx" ON "knowledge_validation_issues" USING btree ("code");--> statement-breakpoint
CREATE INDEX "knowledge_lexemes_search_fts_idx" ON "knowledge_lexemes" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "knowledge_kanji_search_fts_idx" ON "knowledge_kanji" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "knowledge_grammar_search_fts_idx" ON "knowledge_grammar_points" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "knowledge_sentences_search_fts_idx" ON "knowledge_sentences" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "knowledge_idioms_search_fts_idx" ON "knowledge_idioms" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "knowledge_collocations_search_fts_idx" ON "knowledge_collocations" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "knowledge_names_search_fts_idx" ON "knowledge_names" USING gin (to_tsvector('simple', "search_text"));