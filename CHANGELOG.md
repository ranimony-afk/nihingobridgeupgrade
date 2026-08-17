# Changelog

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
