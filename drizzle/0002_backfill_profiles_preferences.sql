-- Backfill: every existing user gets a profile and a preferences row.
--
-- identity_profiles and identity_preferences are 1:1 with identity_users, and
-- the application assumes both rows exist. Accounts created before migration
-- 0001 have neither, so without this backfill they would read as null and
-- every consumer would need a "profile might be missing" branch forever.
--
-- Non-destructive and idempotent:
--   - INSERT ... SELECT only adds rows for users that lack one
--   - NOT EXISTS makes a re-run a no-op
--   - all other columns take their schema defaults
--
-- Ids mirror the application's prefix convention (prefix_<32 hex>), so
-- backfilled rows are indistinguishable in shape from ones created at runtime.
-- gen_random_uuid() is core PostgreSQL 13+, so this needs no extension —
-- pgcrypto is deliberately not a dependency (DATABASE_OWNERSHIP §6).

INSERT INTO "identity_profiles" ("id", "user_id")
SELECT
  'prof_' || replace(gen_random_uuid()::text, '-', ''),
  u."id"
FROM "identity_users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "identity_profiles" p WHERE p."user_id" = u."id"
);
--> statement-breakpoint
INSERT INTO "identity_preferences" ("id", "user_id")
SELECT
  'pref_' || replace(gen_random_uuid()::text, '-', ''),
  u."id"
FROM "identity_users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "identity_preferences" p WHERE p."user_id" = u."id"
);
