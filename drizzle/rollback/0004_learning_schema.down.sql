-- @reversible: yes
-- @drops-data: curriculum, and learner attempts and progress (NOT recoverable)
--
-- Rollback of 0004. Drops the learning domain in reverse dependency order.
--
-- Unlike the knowledge domain, this is not uniformly re-importable. Courses
-- and questions are authored content that can be restored from a content
-- export, but `attempts` and `progress` are learner-generated: what somebody
-- answered, and how far they got. Those exist nowhere else.
--
-- The runner reports the row count of every table below before it will run,
-- so an operator sees exactly how much learner history is at stake.
--
-- attempts must go first: it holds RESTRICT references to questions and
-- exercises specifically to stop live content being deleted underneath a
-- learner's history. That protection has to be released deliberately, which
-- is what this ordering does.

DROP TABLE IF EXISTS "progress";--> statement-breakpoint
DROP TABLE IF EXISTS "attempts";--> statement-breakpoint
DROP TABLE IF EXISTS "answers";--> statement-breakpoint
DROP TABLE IF EXISTS "questions";--> statement-breakpoint
DROP TABLE IF EXISTS "exercises";--> statement-breakpoint
DROP TABLE IF EXISTS "lesson_items";--> statement-breakpoint
DROP TABLE IF EXISTS "lessons";--> statement-breakpoint
DROP TABLE IF EXISTS "units";--> statement-breakpoint
DROP TABLE IF EXISTS "courses";--> statement-breakpoint

DROP TYPE IF EXISTS "public"."progress_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."question_type";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."exercise_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."lesson_item_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."lesson_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."publish_status";
