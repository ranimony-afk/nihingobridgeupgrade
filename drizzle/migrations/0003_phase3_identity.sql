CREATE TABLE IF NOT EXISTS institutions (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'institution',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text,
  role text NOT NULL DEFAULT 'student',
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  institution_id text REFERENCES institutions(id) ON DELETE SET NULL,
  learner_id text REFERENCES learners(id) ON DELETE SET NULL,
  staff_id text REFERENCES staff_users(id) ON DELETE SET NULL,
  email_verified_at timestamptz,
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  plan_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_accounts_provider_uid ON identity_accounts (provider, provider_account_id);

CREATE TABLE IF NOT EXISTS identity_refresh_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_challenges (
  id text PRIMARY KEY,
  user_id text REFERENCES identity_users(id) ON DELETE CASCADE,
  email text NOT NULL,
  kind text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_permissions (
  key text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_role_permissions (
  role text NOT NULL,
  permission text NOT NULL REFERENCES identity_permissions(key) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_role_permission_pk ON identity_role_permissions (role, permission);

CREATE TABLE IF NOT EXISTS identity_mail (
  id text PRIMARY KEY,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
