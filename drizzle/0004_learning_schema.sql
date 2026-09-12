CREATE TYPE "public"."exercise_kind" AS ENUM('practice', 'quiz', 'review', 'assessment');--> statement-breakpoint
CREATE TYPE "public"."lesson_item_kind" AS ENUM('dictionary_entry', 'kanji_entry', 'grammar_pattern', 'sentence', 'note');--> statement-breakpoint
CREATE TYPE "public"."lesson_kind" AS ENUM('vocabulary', 'kanji', 'grammar', 'reading', 'listening', 'review', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."progress_status" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multiple_choice', 'type_answer', 'reading', 'listening', 'matching', 'fill_blank', 'translation', 'kanji_recognition');--> statement-breakpoint
CREATE TABLE "answers" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"normalized" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_position_check" CHECK ("answers"."position" >= 0),
	CONSTRAINT "answers_text_not_blank" CHECK (btrim("answers"."text") <> '')
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"selected_answer_id" text,
	"response_text" text,
	"is_correct" boolean NOT NULL,
	"points_awarded" smallint DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_attempt_number_check" CHECK ("attempts"."attempt_number" >= 1),
	CONSTRAINT "attempts_points_check" CHECK ("attempts"."points_awarded" >= 0),
	CONSTRAINT "attempts_duration_check" CHECK ("attempts"."duration_ms" IS NULL OR "attempts"."duration_ms" >= 0),
	CONSTRAINT "attempts_response_present_check" CHECK ("attempts"."selected_answer_id" IS NOT NULL OR "attempts"."response_text" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"subtitle" varchar(300),
	"description" text,
	"jlpt_level" smallint,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"estimated_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_jlpt_check" CHECK ("courses"."jlpt_level" IS NULL OR "courses"."jlpt_level" BETWEEN 1 AND 5),
	CONSTRAINT "courses_position_check" CHECK ("courses"."position" >= 0),
	CONSTRAINT "courses_slug_not_blank" CHECK (btrim("courses"."slug") <> '')
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"instructions" text,
	"kind" "exercise_kind" DEFAULT 'practice' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"pass_threshold" smallint DEFAULT 80 NOT NULL,
	"time_limit_seconds" integer,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_position_check" CHECK ("exercises"."position" >= 0),
	CONSTRAINT "exercises_pass_threshold_check" CHECK ("exercises"."pass_threshold" BETWEEN 0 AND 100),
	CONSTRAINT "exercises_time_limit_check" CHECK ("exercises"."time_limit_seconds" IS NULL OR "exercises"."time_limit_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_items" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"kind" "lesson_item_kind" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"dictionary_entry_id" text,
	"kanji_entry_id" text,
	"grammar_pattern_id" text,
	"sentence_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_items_position_check" CHECK ("lesson_items"."position" >= 0),
	CONSTRAINT "lesson_items_target_count_check" CHECK ((
        CASE WHEN "lesson_items"."kind" = 'note' THEN
          num_nonnulls("lesson_items"."dictionary_entry_id", "lesson_items"."kanji_entry_id",
                       "lesson_items"."grammar_pattern_id", "lesson_items"."sentence_id") = 0
          AND "lesson_items"."note" IS NOT NULL
        ELSE
          num_nonnulls("lesson_items"."dictionary_entry_id", "lesson_items"."kanji_entry_id",
                       "lesson_items"."grammar_pattern_id", "lesson_items"."sentence_id") = 1
        END
      )),
	CONSTRAINT "lesson_items_target_matches_kind_check" CHECK ((
        ("lesson_items"."kind" <> 'dictionary_entry' OR "lesson_items"."dictionary_entry_id" IS NOT NULL)
        AND ("lesson_items"."kind" <> 'kanji_entry' OR "lesson_items"."kanji_entry_id" IS NOT NULL)
        AND ("lesson_items"."kind" <> 'grammar_pattern' OR "lesson_items"."grammar_pattern_id" IS NOT NULL)
        AND ("lesson_items"."kind" <> 'sentence' OR "lesson_items"."sentence_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"summary" text,
	"kind" "lesson_kind" DEFAULT 'mixed' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"estimated_minutes" integer,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_position_check" CHECK ("lessons"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"course_id" text NOT NULL,
	"status" "progress_status" DEFAULT 'not_started' NOT NULL,
	"completion_percent" smallint DEFAULT 0 NOT NULL,
	"best_score_percent" smallint,
	"attempts_count" integer DEFAULT 0 NOT NULL,
	"time_spent_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_completion_check" CHECK ("progress"."completion_percent" BETWEEN 0 AND 100),
	CONSTRAINT "progress_best_score_check" CHECK ("progress"."best_score_percent" IS NULL OR "progress"."best_score_percent" BETWEEN 0 AND 100),
	CONSTRAINT "progress_attempts_check" CHECK ("progress"."attempts_count" >= 0),
	CONSTRAINT "progress_time_check" CHECK ("progress"."time_spent_seconds" >= 0),
	CONSTRAINT "progress_completed_consistency_check" CHECK ("progress"."status" <> 'completed'
          OR ("progress"."completed_at" IS NOT NULL AND "progress"."completion_percent" = 100))
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_id" text NOT NULL,
	"type" "question_type" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"prompt" text NOT NULL,
	"prompt_ja" text,
	"hint" text,
	"explanation" text,
	"difficulty" smallint DEFAULT 3 NOT NULL,
	"points" smallint DEFAULT 1 NOT NULL,
	"audio_url" text,
	"dictionary_entry_id" text,
	"kanji_entry_id" text,
	"grammar_pattern_id" text,
	"sentence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_position_check" CHECK ("questions"."position" >= 0),
	CONSTRAINT "questions_difficulty_check" CHECK ("questions"."difficulty" BETWEEN 1 AND 5),
	CONSTRAINT "questions_points_check" CHECK ("questions"."points" > 0),
	CONSTRAINT "questions_prompt_not_blank" CHECK (btrim("questions"."prompt") <> '')
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_position_check" CHECK ("units"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_selected_answer_id_answers_id_fk" FOREIGN KEY ("selected_answer_id") REFERENCES "public"."answers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_items" ADD CONSTRAINT "lesson_items_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_items" ADD CONSTRAINT "lesson_items_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_items" ADD CONSTRAINT "lesson_items_kanji_entry_id_kanji_entries_id_fk" FOREIGN KEY ("kanji_entry_id") REFERENCES "public"."kanji_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_items" ADD CONSTRAINT "lesson_items_grammar_pattern_id_grammar_patterns_id_fk" FOREIGN KEY ("grammar_pattern_id") REFERENCES "public"."grammar_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_items" ADD CONSTRAINT "lesson_items_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_dictionary_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("dictionary_entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_kanji_entry_id_kanji_entries_id_fk" FOREIGN KEY ("kanji_entry_id") REFERENCES "public"."kanji_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_grammar_pattern_id_grammar_patterns_id_fk" FOREIGN KEY ("grammar_pattern_id") REFERENCES "public"."grammar_patterns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answers_question_position_idx" ON "answers" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "answers_question_idx" ON "answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "answers_normalized_idx" ON "answers" USING btree ("question_id","normalized");--> statement-breakpoint
CREATE INDEX "attempts_user_idx" ON "attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempts_question_idx" ON "attempts" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "attempts_submission_idx" ON "attempts" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "attempts_user_question_idx" ON "attempts" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "attempts_user_exercise_idx" ON "attempts" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "attempts_created_idx" ON "attempts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_unique_try_idx" ON "attempts" USING btree ("user_id","question_id","submission_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_idx" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "courses_jlpt_idx" ON "courses" USING btree ("jlpt_level");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_lesson_slug_idx" ON "exercises" USING btree ("lesson_id","slug");--> statement-breakpoint
CREATE INDEX "exercises_lesson_idx" ON "exercises" USING btree ("lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_items_lesson_position_idx" ON "lesson_items" USING btree ("lesson_id","position");--> statement-breakpoint
CREATE INDEX "lesson_items_lesson_idx" ON "lesson_items" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_items_dictionary_idx" ON "lesson_items" USING btree ("dictionary_entry_id");--> statement-breakpoint
CREATE INDEX "lesson_items_kanji_idx" ON "lesson_items" USING btree ("kanji_entry_id");--> statement-breakpoint
CREATE INDEX "lesson_items_grammar_idx" ON "lesson_items" USING btree ("grammar_pattern_id");--> statement-breakpoint
CREATE INDEX "lesson_items_sentence_idx" ON "lesson_items" USING btree ("sentence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_unit_slug_idx" ON "lessons" USING btree ("unit_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_unit_position_idx" ON "lessons" USING btree ("unit_id","position");--> statement-breakpoint
CREATE INDEX "lessons_unit_idx" ON "lessons" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "lessons_status_idx" ON "lessons" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_user_lesson_idx" ON "progress" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX "progress_user_idx" ON "progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "progress_user_course_idx" ON "progress" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "progress_status_idx" ON "progress" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "progress_last_activity_idx" ON "progress" USING btree ("user_id","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_exercise_position_idx" ON "questions" USING btree ("exercise_id","position");--> statement-breakpoint
CREATE INDEX "questions_exercise_idx" ON "questions" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "questions_type_idx" ON "questions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "questions_dictionary_idx" ON "questions" USING btree ("dictionary_entry_id");--> statement-breakpoint
CREATE INDEX "questions_kanji_idx" ON "questions" USING btree ("kanji_entry_id");--> statement-breakpoint
CREATE INDEX "questions_grammar_idx" ON "questions" USING btree ("grammar_pattern_id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_course_slug_idx" ON "units" USING btree ("course_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "units_course_position_idx" ON "units" USING btree ("course_id","position");--> statement-breakpoint
CREATE INDEX "units_course_idx" ON "units" USING btree ("course_id");