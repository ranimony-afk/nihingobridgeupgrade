-- @reversible: yes
-- @drops-data: all user accounts, credentials, sessions and roles (NOT recoverable)
--
-- Rollback of the baseline. This removes the identity domain entirely —
-- every account on the platform.
--
-- It exists so the migration chain can be verified end to end: the gate
-- applies every migration, rolls the whole chain back, and re-applies it,
-- comparing schema fingerprints. Without a down script for 0000 that
-- verification could not reach zero, and an unverifiable rollback is not a
-- rollback strategy.
--
-- In production this is a disaster-recovery action, not a routine one.

DROP TABLE IF EXISTS "identity_user_roles";--> statement-breakpoint
DROP TABLE IF EXISTS "identity_sessions";--> statement-breakpoint
DROP TABLE IF EXISTS "identity_credentials";--> statement-breakpoint
DROP TABLE IF EXISTS "identity_users";--> statement-breakpoint

DROP TYPE IF EXISTS "public"."identity_session_transport";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."identity_role";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."identity_user_status";
