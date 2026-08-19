-- Phase 13. Additive: no Phase 4 table is dropped or repurposed.

ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_event_key
  ON billing_webhook_events (provider, event_key);

CREATE TABLE IF NOT EXISTS billing_affiliates (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  user_id text REFERENCES identity_users(id) ON DELETE SET NULL,
  discount_percent integer NOT NULL DEFAULT 15,
  commission_percent integer NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_commissions (
  id text PRIMARY KEY,
  affiliate_id text NOT NULL REFERENCES billing_affiliates(id) ON DELETE CASCADE,
  checkout_id text NOT NULL,
  invoice_id text,
  currency text NOT NULL,
  net_amount integer NOT NULL,
  commission_amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payout_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_commissions_affiliate ON billing_commissions (affiliate_id);
CREATE INDEX IF NOT EXISTS billing_commissions_checkout ON billing_commissions (checkout_id);

CREATE TABLE IF NOT EXISTS billing_payouts (
  id text PRIMARY KEY,
  affiliate_id text NOT NULL REFERENCES billing_affiliates(id) ON DELETE CASCADE,
  currency text NOT NULL,
  amount integer NOT NULL,
  reference text NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_referrals (
  id text PRIMARY KEY,
  referrer_id text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  referred_id text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  checkout_id text,
  reward_amount integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'inr',
  status text NOT NULL DEFAULT 'converted',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_referral_pair
  ON billing_referrals (referrer_id, referred_id);
