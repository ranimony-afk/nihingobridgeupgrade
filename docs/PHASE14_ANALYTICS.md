# Phase 14 — Analytics

A staff dashboard covering learning, business, retention, funnels, and revenue.
Everything aggregates in SQL at request time — there is no separate warehouse to
keep in sync.

## Layout

`src/lib/analytics/metrics.ts` holds the **pure maths** (MRR, churn, LTV,
cohorts, funnels) with no database imports, so every rule is unit tested.
`src/lib/analytics/service.ts` runs the SQL and feeds those functions.

## Dashboard

`/admin/analytics` — staff only, since it exposes revenue and learner behaviour.

| Section | Shows |
| --- | --- |
| Learning | DAU/WAU/MAU, stickiness, XP trend, streaks, hardest lessons |
| Funnel | Visit → onboard → XP → lesson → account → subscribe |
| Retention | Weekly cohort heatmap |
| Revenue | MRR, ARR, ARPU, LTV, churn, revenue by plan |
| Product | Tutor sessions, search volume, zero-result rate |

## Decisions worth knowing

**Annual plans are normalised.** A ¤7900/year plan contributes ¤658 to MRR, not
¤7900. Counting the full annual payment as monthly revenue would overstate MRR
roughly 12×.

**`canceling` still counts toward MRR.** The account has paid for the current
period and retains access, so excluding it would understate live revenue.

**Churn divides by accounts that could have churned** (active at period start),
not by today's total — otherwise growth artificially suppresses the rate.

**LTV is capped at 36 months.** At zero churn the formula `ARPU / churn` is
unbounded; a dashboard should not print `Infinity`.

**Empty days are kept in the series.** The chart pads missing dates with zero so
a gap in activity looks like a gap, not a shorter chart.

**Median alongside mean** for XP, because a handful of power users skew the
average.

## Funnel integrity

Funnel stages must be subsets of the stage above. During testing the live
funnel reported `Started onboarding: 0` followed by `Earned XP: 68` — one
stage filtered bot accounts while the others did not.

Two changes came out of that:

1. Every stage now counts the same population.
2. `buildFunnel` flags any stage whose count exceeds the one above it, and the
   dashboard renders a red warning. Counts are **never clamped**, because
   hiding the anomaly would hide the tracking bug that caused it.

## Fixed while building

`eventCounts()` selected **every** row from `analytics_events` into Node just to
tally names. That grows unbounded with traffic. It is now a SQL `GROUP BY`.

## Demo data

A fresh install has no activity, so the dashboard would render all zeros. The
**Seed demo activity** button creates 60 synthetic learners with decaying
retention, plus events, searches, tutor sessions, and a few subscriptions.

It is deliberately conservative:

- Skips automatically when real activity already exists
- Every generated learner is flagged `is_bot = true`
- Deterministic PRNG, so the dataset is stable and reviewable
- Requires an explicit staff action (`POST /api/v1/admin/analytics/demo`)

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/v1/admin/analytics` | Full overview |
| `GET /api/v1/admin/analytics?section=learning\|revenue\|funnel\|retention\|product` | One section |
| `GET\|POST /api/v1/admin/analytics/demo` | Check / seed demo activity |

`?days=` (1–365) controls the learning window.
