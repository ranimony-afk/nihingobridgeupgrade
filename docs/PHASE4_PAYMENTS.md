# Phase 4 — Payments

Monetization sits beside the LMS. `/learn` stays free. Plus extras live at `/plus` and `/premium`.

## Providers

| Provider | Env | Behavior without keys |
| --- | --- | --- |
| Stripe Checkout | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Button hidden; sandbox pay still works |
| Razorpay Orders | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Same |
| Sandbox | none | `GET/POST /api/v1/billing/sandbox/complete` fulfills immediately |

## Catalog

- Plus monthly/annual USD
- Plus monthly INR (GST-inclusive 18%, CGST 9 + SGST 9, GSTIN `33AAAAA0000A1Z1`)
- Institution seat USD/INR

Coupons: `SAVE20`, `NIHONGO10`. Referrals: `REFER-XXXXXX` (₹10 / $10 credit to referrer). Affiliates: `AFFILIATE-*` = 15% off.

## Flutter

```
GET  /api/v1/billing/plans
GET  /api/v1/billing/me          Authorization: Bearer
POST /api/v1/billing/quote       { planId, coupon }
POST /api/v1/billing/checkout    { planId, provider, coupon }
POST /api/v1/billing/sandbox/complete { checkout }
```

Restore purchases by reading `billing/me` subscription status.

## Webhooks

- `POST /api/v1/billing/webhooks/stripe`
- `POST /api/v1/billing/webhooks/razorpay`

Unsigned events are accepted only when the matching webhook secret is unset (local).
