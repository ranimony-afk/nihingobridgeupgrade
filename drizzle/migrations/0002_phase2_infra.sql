-- Phase 2 additive infrastructure tables. LMS tables are untouched.
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS error_events (
  id text PRIMARY KEY,
  source text NOT NULL,
  message text NOT NULL,
  stack text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY,
  name text NOT NULL,
  path text,
  actor_id text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id text PRIMARY KEY,
  filename text NOT NULL,
  bytes integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  staff_id text NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
