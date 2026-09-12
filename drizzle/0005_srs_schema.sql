CREATE TYPE "public"."srs_algorithm" AS ENUM('fsrs_5', 'sm_2');--> statement-breakpoint
CREATE TYPE "public"."srs_card_state" AS ENUM('new', 'learning', 'review', 'relearning');--> statement-breakpoint
CREATE TYPE "public"."srs_direction" AS ENUM('recognition', 'recall', 'writing');--> statement-breakpoint
CREATE TYPE "public"."srs_rating" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TABLE "srs_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"deck_id" text NOT NULL,
	"target_kind" "lesson_item_kind" NOT NULL,
	"direction" "srs_direction" DEFAULT 'recognition' NOT NULL,
	"dictionary_entry_id" text,
	"kanji_entry_id" text,
	"grammar_pattern_id" text,
	"sentence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srs_cards_target_count_check" CHECK (num_nonnulls("srs_cards"."dictionary_entry_id", "srs_cards"."kanji_entry_id",
                       "srs_cards"."grammar_pattern_id", "srs_cards"."sentence_id") = 1),
	CONSTRAINT "srs_cards_target_matches_kind_check" CHECK ((
        ("srs_cards"."target_kind" <> 'dictionary_entry' OR "srs_cards"."dictionary_entry_id" IS NOT NULL)
        AND ("srs_cards"."target_kind" <> 'kanji_entry' OR "srs_cards"."kanji_entry_id" IS NOT NULL)
        AND ("srs_cards"."target_kind" <> 'grammar_pattern' OR "srs_cards"."grammar_pattern_id" IS NOT NULL)
        AND ("srs_cards"."target_kind" <> 'sentence' OR "srs_cards"."sentence_id" IS NOT NULL)
        AND "srs_cards"."target_kind" <> 'note'
      ))
);
--> statement-breakpoint
CREATE TABLE "srs_decks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"daily_new_limit" smallint,
	"daily_review_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srs_decks_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "srs_decks_name_not_blank" CHECK (btrim("srs_decks"."name") <> ''),
	CONSTRAINT "srs_decks_new_limit_check" CHECK ("srs_decks"."daily_new_limit" IS NULL OR "srs_decks"."daily_new_limit" BETWEEN 0 AND 500),
	CONSTRAINT "srs_decks_review_limit_check" CHECK ("srs_decks"."daily_review_limit" IS NULL OR "srs_decks"."daily_review_limit" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "srs_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" "srs_rating" NOT NULL,
	"algorithm" "srs_algorithm" DEFAULT 'fsrs_5' NOT NULL,
	"state_before" "srs_card_state" NOT NULL,
	"state_after" "srs_card_state" NOT NULL,
	"stability_before" double precision,
	"stability_after" double precision,
	"difficulty_before" double precision,
	"difficulty_after" double precision,
	"interval_before" integer DEFAULT 0 NOT NULL,
	"interval_after" integer DEFAULT 0 NOT NULL,
	"elapsed_days" integer,
	"duration_ms" integer,
	"scheduled_for" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srs_reviews_interval_before_check" CHECK ("srs_reviews"."interval_before" >= 0),
	CONSTRAINT "srs_reviews_interval_after_check" CHECK ("srs_reviews"."interval_after" >= 0),
	CONSTRAINT "srs_reviews_duration_check" CHECK ("srs_reviews"."duration_ms" IS NULL OR "srs_reviews"."duration_ms" >= 0),
	CONSTRAINT "srs_reviews_elapsed_check" CHECK ("srs_reviews"."elapsed_days" IS NULL OR "srs_reviews"."elapsed_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "srs_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state" "srs_card_state" DEFAULT 'new' NOT NULL,
	"algorithm" "srs_algorithm" DEFAULT 'fsrs_5' NOT NULL,
	"due" timestamp with time zone DEFAULT now() NOT NULL,
	"stability" double precision,
	"difficulty" double precision,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srs_schedule_reps_check" CHECK ("srs_schedule"."reps" >= 0),
	CONSTRAINT "srs_schedule_lapses_check" CHECK ("srs_schedule"."lapses" >= 0),
	CONSTRAINT "srs_schedule_interval_check" CHECK ("srs_schedule"."interval_days" >= 0),
	CONSTRAINT "srs_schedule_difficulty_check" CHECK ("srs_schedule"."difficulty" IS NULL OR "srs_schedule"."difficulty" BETWEEN 1 AND 10),
	CONSTRAINT "srs_schedule_stability_check" CHECK ("srs_schedule"."stability" IS NULL OR "srs_schedule"."stability" > 0),
	CONSTRAINT "srs_schedule_lapses_bound_check" CHECK ("srs_schedule"."lapses" <= "srs_schedule"."reps"),
	CONSTRAINT "srs_schedule_new_state_check" CHECK (("srs_schedule"."state" = 'new') = ("srs_schedule"."reps" = 0 AND "srs_schedule"."last_reviewed_at" IS NULL)),
	CONSTRAINT "srs_schedule_review_requires_memory_check" CHECK ("srs_schedule"."state" <> 'review'
          OR ("srs_schedule"."stability" IS NOT NULL AND "srs_schedule"."difficulty" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_kanji_entry_id_kanji_entries_id_fk" FOREIGN KEY ("kanji_entry_id") REFERENCES "public"."kanji_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_grammar_pattern_id_grammar_patterns_id_fk" FOREIGN KEY ("grammar_pattern_id") REFERENCES "public"."grammar_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_deck_owner_fk" FOREIGN KEY ("deck_id","user_id") REFERENCES "public"."srs_decks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_decks" ADD CONSTRAINT "srs_decks_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_card_id_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_schedule" ADD CONSTRAINT "srs_schedule_card_id_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_schedule" ADD CONSTRAINT "srs_schedule_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "srs_cards_user_idx" ON "srs_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "srs_cards_deck_idx" ON "srs_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "srs_cards_dictionary_idx" ON "srs_cards" USING btree ("dictionary_entry_id");--> statement-breakpoint
CREATE INDEX "srs_cards_kanji_idx" ON "srs_cards" USING btree ("kanji_entry_id");--> statement-breakpoint
CREATE INDEX "srs_cards_grammar_idx" ON "srs_cards" USING btree ("grammar_pattern_id");--> statement-breakpoint
CREATE INDEX "srs_cards_sentence_idx" ON "srs_cards" USING btree ("sentence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "srs_cards_unique_dictionary_idx" ON "srs_cards" USING btree ("user_id","dictionary_entry_id","direction") WHERE "srs_cards"."dictionary_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "srs_cards_unique_kanji_idx" ON "srs_cards" USING btree ("user_id","kanji_entry_id","direction") WHERE "srs_cards"."kanji_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "srs_cards_unique_grammar_idx" ON "srs_cards" USING btree ("user_id","grammar_pattern_id","direction") WHERE "srs_cards"."grammar_pattern_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "srs_cards_unique_sentence_idx" ON "srs_cards" USING btree ("user_id","sentence_id","direction") WHERE "srs_cards"."sentence_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "srs_decks_user_name_idx" ON "srs_decks" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "srs_decks_user_idx" ON "srs_decks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "srs_decks_one_default_idx" ON "srs_decks" USING btree ("user_id") WHERE "srs_decks"."is_default" = true;--> statement-breakpoint
CREATE INDEX "srs_reviews_card_idx" ON "srs_reviews" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "srs_reviews_user_idx" ON "srs_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "srs_reviews_user_reviewed_idx" ON "srs_reviews" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "srs_reviews_card_reviewed_idx" ON "srs_reviews" USING btree ("card_id","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "srs_schedule_card_idx" ON "srs_schedule" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "srs_schedule_due_idx" ON "srs_schedule" USING btree ("user_id","due") WHERE "srs_schedule"."suspended" = false;--> statement-breakpoint
CREATE INDEX "srs_schedule_user_state_idx" ON "srs_schedule" USING btree ("user_id","state");
--> statement-breakpoint
-- Make srs_reviews genuinely append-only.
--
-- The review log is the input to FSRS parameter optimisation: the optimiser
-- replays a learner's full history to fit weights. A silently edited or
-- deleted row would corrupt that fit in a way nothing downstream could detect,
-- so the guarantee is enforced here rather than left to repository discipline.
--
-- Cascade deletes from srs_cards still work: PostgreSQL fires referential
-- actions as the table owner with triggers on the referencing table suppressed
-- for the FK path, and pg_trigger_depth() > 0 covers the nested case.
CREATE OR REPLACE FUNCTION srs_reviews_append_only()
RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'srs_reviews is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER srs_reviews_no_update
  BEFORE UPDATE ON "srs_reviews"
  FOR EACH ROW EXECUTE FUNCTION srs_reviews_append_only();
