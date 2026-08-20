# Phase 13 — Payments

Phase 4 shipped Stripe, Razorpay, subscriptions, coupons, and GST invoices.
Phase 13 **extends** that module rather than replacing it. Every Phase 4 route
and contract still works.

## What was already done (Phase 4)

Stripe Checkout · Razorpay Orders · webhooks · subscription records · coupons
(`SAVE20`, `NIHONGO10`) · GST-inclusive invoices · refunds · billing portal ·
premium locking · admin desk.

## Gaps this phase closed

### 1. Affiliate codes were unvalidated — a revenue leak

Phase 4 gave **15% off to any string** starting with `AFFILIATE-`:

```ts
if (code.startsWith("AFFILIATE-")) {
  return { percentOff: 15 };   // no lookup, no partner, no record
}
```

`AFFILIATE-LOL` worked. Codes now resolve against a `billing_affiliates` row
that must exist and be `active`. Unknown or paused codes are rejected.

### 2. Commission never existed

The spec called for a partner commission, but only the buyer discount was
implemented. Added:

- `billing_affiliates` — partner, discount %, commission %, status
- `billing_commissions` — immutable per-sale ledger
- `billing_payouts` — payout batches

Commission accrues on the **net** amount (after discount and tax). Taking it on
list price would mean paying out on a fully discounted sale.

### 3. Referral attribution was never written

`billing_profiles.referred_by` was declared in Phase 4 and **never populated**.
Credit was granted but you could not see who referred whom. Added
`billing_referrals` plus backfill of `referred_by`, surfaced in a referral
dashboard. Referred emails are masked (`st*****@domain`).

### 4. Webhooks were not idempotent

Providers retry aggressively. Events are now deduped on
`(provider, event_key)` using the Stripe event id / Razorpay event header, so a
replay returns `{ duplicate: true }` without reprocessing.

### 5. No subscription lifecycle

Added cancel (at period end, so paid access is kept), resume, and
`expireLapsedSubscriptions()` which downgrades expired plans.

## Money rules

| Rule | Reason |
| --- | --- |
| Commission on net, not list | A 100%-off coupon must not trigger a payout |
| Refund reverses commission | Never pay out on money we returned |
| Already-paid commission is not reversed | Clawback is a manual finance decision |
| Payout groups one currency | Prevents summing USD and INR cents |
| Duplicate accrual is a no-op | Keyed on `checkout_id` |

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/v1/billing/referrals` | Your code, credit, and invitees |
| `POST /api/v1/billing/subscription` | `{ action: "cancel" \| "resume" }` |
| `GET\|POST /api/v1/admin/affiliates` | List, create, pause, pay out |

Unchanged from Phase 4: `/api/v1/billing/plans`, `/quote`, `/checkout`,
`/sandbox/complete`, `/me`, `/invoices/:id`, both webhooks, `/admin/billing`.

## UI

- `/billing` — now also shows subscription controls and the referral dashboard
- `/admin/affiliates` — partner management, commission owed, payouts

Seeded partner: `AFFILIATE-SAKURA` (15% off buyer / 20% commission).
