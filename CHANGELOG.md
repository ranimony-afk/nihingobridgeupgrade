# Changelog

## 1.5.0 — Phase 5 knowledge graph

- Normalized KG tables for lexemes, kanji, sentences, grammar, idioms, collocations, pitch, strokes, furigana, frequency, tags, audio, AI metadata, SRS
- Incremental ETL (`scripts/kg-etl.ts`) + admin import
- Full-text search APIs and `/dictionary` `/kanji` `/grammar`



## 1.4.0 — Phase 4 payments

- Stripe Checkout + Razorpay Orders when secrets exist; sandbox fulfill without keys
- Subscriptions, coupons, referral/affiliate codes, GST-inclusive INR invoices
- Billing portal, printable invoices, refunds, webhook inbox
- Premium path lock (`/premium`) and admin billing CMS
- Flutter restore via `GET /api/v1/billing/me`



## 1.3.0 — Phase 3 authentication

- Identity users, institutions, refresh tokens, challenges, TOTP, mail outbox
- REST `/api/v1/auth/*` for email, magic link, reset, verify, 2FA, sessions
- Google/GitHub OAuth hooks on Auth.js when secrets exist
- RBAC + subscription-aware middleware for `/teacher`, `/institution`, `/plus`
- CMS `/admin/identity` and Flutter bearer-token contract
- Unit, integration, and e2e identity tests



## 1.2.1 — Phase 2 pipeline close-out

- GitHub deploy workflow with a green-build gate and optional Vercel promotion
- Staff login rate limit (10/min)
- Local Supabase `config.toml` and production checklist
- Drizzle kit `out` directory for future generated migrations

## 1.2.0 — Phase 2 infrastructure

### Added

- Auth.js v5 staff JWT (`/api/auth/[...nextauth]`) dual-stacked with HMAC `nb_staff`
- Signed `nb_learner_sig` cookie while keeping `nb_learner`
- Zod environment validation, JSON logger, DB error tracking, analytics events
- Optional Redis rate limits and Supabase client
- Deep health at `/api/v1/health` (compat `/api/health` unchanged)
- Docker + Compose, GitHub Actions CI and scheduled backups
- In-app logical backups and `/admin/infra`
- Unit, integration, and smoke tests for infra

### Preserved

- All LMS routes and `/api/health` `{ ok: true }`, `/api/me`, `/api/game` action union

## 1.1.0 — Phase 1 repository audit

### Added

- Audit schema: `audit_reports`, `audit_findings`, `audit_roadmap`, `audit_events`, `staff_users`
- Public report at `/audit`
- Staff CMS at `/admin` with HMAC login
- REST: `/api/v1/audit`, `/api/v1/audit/findings`, `/api/v1/admin/*`
- Documentation under `docs/`
- Unit and integration tests under `tests/`
- SQL migration `drizzle/migrations/0001_phase1_audit.sql`

### Preserved

- All LMS routes and `/api/health`, `/api/me`, `/api/game`
- Curriculum, hearts, XP, streaks, stories, shop, leagues
