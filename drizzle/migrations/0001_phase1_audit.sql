-- Phase 1 additive migration. Does not alter LMS tables.
CREATE TABLE IF NOT EXISTS staff_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_reports (
  id text PRIMARY KEY,
  phase text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_findings (
  id text PRIMARY KEY,
  report_id text NOT NULL REFERENCES audit_reports(id) ON DELETE CASCADE,
  domain text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  evidence text NOT NULL,
  recommendation text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  effort text NOT NULL,
  priority integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_findings_report_title
  ON audit_findings (report_id, title);

CREATE TABLE IF NOT EXISTS audit_roadmap (
  id text PRIMARY KEY,
  report_id text NOT NULL REFERENCES audit_reports(id) ON DELETE CASCADE,
  phase text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  depends_on text,
  status text NOT NULL DEFAULT 'planned',
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  finding_id text REFERENCES audit_findings(id) ON DELETE CASCADE,
  actor_id text,
  action text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
