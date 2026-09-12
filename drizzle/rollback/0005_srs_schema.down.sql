-- @reversible: yes
-- @drops-data: SRS decks, cards, schedules and the full review history (NOT recoverable)
--
-- Rollback of 0005. Drops the SRS domain in reverse dependency order.
--
-- The review log is the costliest loss here. It is the input to FSRS
-- parameter optimisation — a learner's fitted weights are derived by replaying
-- it — and it exists nowhere else. Losing it does not merely reset progress;
-- it permanently degrades scheduling quality for that learner.
--
-- The runner reports the row count of every table below before it will run.
--
-- Dropping the tables removes the append-only trigger with them, but the
-- function is schema-level and must be dropped explicitly.

DROP TABLE IF EXISTS "srs_reviews";--> statement-breakpoint
DROP TABLE IF EXISTS "srs_schedule";--> statement-breakpoint
DROP TABLE IF EXISTS "srs_cards";--> statement-breakpoint
DROP TABLE IF EXISTS "srs_decks";--> statement-breakpoint

DROP FUNCTION IF EXISTS srs_reviews_append_only();--> statement-breakpoint

DROP TYPE IF EXISTS "public"."srs_algorithm";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."srs_direction";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."srs_rating";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."srs_card_state";
