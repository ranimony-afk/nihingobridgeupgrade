CREATE TYPE "public"."furigana_mode" AS ENUM('always', 'hover', 'never');--> statement-breakpoint
CREATE TYPE "public"."profile_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."theme_preference" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TABLE "identity_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"theme" "theme_preference" DEFAULT 'system' NOT NULL,
	"furigana_mode" "furigana_mode" DEFAULT 'hover' NOT NULL,
	"show_romaji" boolean DEFAULT false NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"daily_goal_minutes" smallint DEFAULT 15 NOT NULL,
	"srs_daily_new_limit" smallint DEFAULT 20 NOT NULL,
	"srs_daily_review_limit" integer DEFAULT 200 NOT NULL,
	"email_digest" boolean DEFAULT true NOT NULL,
	"review_reminders" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_preferences_daily_goal_check" CHECK ("identity_preferences"."daily_goal_minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "identity_preferences_srs_new_check" CHECK ("identity_preferences"."srs_daily_new_limit" BETWEEN 0 AND 500),
	CONSTRAINT "identity_preferences_srs_review_check" CHECK ("identity_preferences"."srs_daily_review_limit" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "identity_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"avatar_url" text,
	"bio" varchar(500),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"locale" varchar(12) DEFAULT 'en' NOT NULL,
	"native_language" varchar(12),
	"target_jlpt_level" smallint,
	"current_jlpt_level" smallint,
	"visibility" "profile_visibility" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_profiles_target_level_check" CHECK ("identity_profiles"."target_jlpt_level" IS NULL OR "identity_profiles"."target_jlpt_level" BETWEEN 1 AND 5),
	CONSTRAINT "identity_profiles_current_level_check" CHECK ("identity_profiles"."current_jlpt_level" IS NULL OR "identity_profiles"."current_jlpt_level" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "identity_preferences" ADD CONSTRAINT "identity_preferences_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_profiles" ADD CONSTRAINT "identity_profiles_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_preferences_user_idx" ON "identity_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_profiles_user_idx" ON "identity_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_profiles_target_level_idx" ON "identity_profiles" USING btree ("target_jlpt_level");