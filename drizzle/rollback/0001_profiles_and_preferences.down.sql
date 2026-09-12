-- @reversible: yes
-- @drops-data: learner profiles and preferences (NOT recoverable)
--
-- Rollback of 0001. Unlike the knowledge domain, this data has no upstream
-- source to re-import from: a learner's timezone, JLPT target, and study
-- settings exist only here.
--
-- The runner therefore reports row counts and requires explicit confirmation
-- before running this. It is a deliberate operator decision, not an automatic
-- step in a rollback chain.

DROP TABLE IF EXISTS "identity_preferences";--> statement-breakpoint
DROP TABLE IF EXISTS "identity_profiles";--> statement-breakpoint

DROP TYPE IF EXISTS "public"."furigana_mode";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."theme_preference";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."profile_visibility";
