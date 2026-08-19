# Architecture

## Current runtime

NihongoBridge is a single Next.js 16 App Router process. PostgreSQL is accessed through a process-wide `pg` Pool and Drizzle (`src/db/index.ts`). Curriculum and bots are seeded on first successful `ensureSeed()`.

```
src/app            routes (LMS + Phase 1 audit/admin)
src/components     React views (do not rewrite working lesson widgets)
src/db             Drizzle client + schema
src/lib            LMS services (learner, game, curriculum, seed)
src/lib/audit      Phase 1 bounded context (catalog, score, repo, auth)
tests/             unit + integration
docs/              human reports
drizzle/migrations additive SQL
```

## Request paths

- **Learner HTML** — server components call `getPublicLearner()` and render. Missing cookie → `/onboarding`.
- **Learner mutations** — browser `fetch('/api/game')` → `handleGame`.
- **Audit** — `getAuditBundle()` reads `audit_*` tables after `ensureAuditSeed()`.
- **Staff** — HMAC cookie `nb_staff` separate from `nb_learner`.

## Compatibility rules

1. Never remove `/api/health`, `/api/me`, `/api/game`.
2. Never rename learner cookies without a dual-read window.
3. New APIs go under `/api/v1/*`.
4. Extend `src/db/schema.ts` (or re-export modules through it). Do not drop LMS columns.
5. Prefer calling existing helpers over cloning SQL.

## Future shape (do not jump here in one commit)

```
src/db/schema/{lms,identity,cms,dictionary,audit}.ts
src/modules/lms        wraps today's learner.ts / game.ts
src/modules/identity   NextAuth
apps/mobile            Flutter
services/etl           JMdict loaders
```

The LMS UI stays the system of engagement while those modules appear.
