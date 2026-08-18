CREATE TABLE IF NOT EXISTS billing_plans (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  interval text NOT NULL,
  currency text NOT NULL,
  amount integer NOT NULL,
  entitles text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS billing_coupons (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  kind text NOT NULL,
  percent_off integer,
  amount_off integer,
  active boolean NOT NULL DEFAULT true,
  max_redemptions integer,
  redeemed integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS billing_profiles (
  user_id text PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE,
  credit_paise integer NOT NULL DEFAULT 0,
  referred_by text
);

CREATE TABLE IF NOT EXISTS billing_checkouts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES billing_plans(id),
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  coupon_code text,
  referral_code text,
  currency text NOT NULL,
  subtotal integer NOT NULL,
  discount integer NOT NULL DEFAULT 0,
  tax integer NOT NULL DEFAULT 0,
  total integer NOT NULL,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES billing_plans(id),
  status text NOT NULL,
  provider text NOT NULL,
  current_period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  checkout_id text,
  number text NOT NULL UNIQUE,
  currency text NOT NULL,
  subtotal integer NOT NULL,
  tax integer NOT NULL,
  cgst integer NOT NULL DEFAULT 0,
  sgst integer NOT NULL DEFAULT 0,
  total integer NOT NULL,
  gstin text,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_invoice_lines (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount integer NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_refunds (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
