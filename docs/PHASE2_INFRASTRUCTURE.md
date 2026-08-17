# Phase 2 — Infrastructure

Production adapters wrapped around the working LMS. No lesson module was rewritten. `/api/health`, `/api/me`, and `/api/game` still exist.

## What shipped

| Concern | Implementation | Failure mode |
| --- | --- | --- |
| Supabase | `@supabase/supabase-js` client when `SUPABASE_URL` + anon key exist | App boots; status = `not_configured` |
| Drizzle | Pool `max=20`, idle 30s, connect timeout 3s | Same `db` export |
| NextAuth | Auth.js v5 JWT credentials against `staff_users` | HMAC `nb_staff` still works |
| Redis | ioredis for rate-limit counters | In-memory limiter |
| Rate limiting | 80 req/min on `POST /api/game` | 429 + `Retry-After` |
| Env validation | `zod` in `src/lib/infra/env.ts` | Throws only if `DATABASE_URL` missing |
| Logging | JSON lines via `logger` | stdout |
| Error tracking | `error_events` + optional webhook | Never blocks the request path |
| Analytics | `analytics_events` + `/api/v1/analytics` | Staff read, public write of names |
| Health | `/api/health` remains `{ ok: true }`; details at `/api/v1/health` | 503 only on detailed route if DB down |
| Docker | `Dockerfile` + `docker-compose.yml` (app, Postgres, Redis) | Local `npm run dev` unchanged |
| GitHub Actions | `.github/workflows/ci.yml` + scheduled `backup.yml` | Secrets optional |
| Backups | `scripts/backup-db.sh` + in-app logical snapshot | Catalogued in `backup_runs` |
| Smoke tests | `tests/smoke/health.test.ts` | Uses live `DATABASE_URL` |

## Dual-stack identity

- Learners: unsigned `nb_learner` is still written **and** a signed `nb_learner_sig` HMAC is added. Reads prefer the signed cookie, then fall back.
- Staff: HMAC `/api/v1/admin/login` remains. Login also establishes an Auth.js JWT. `getStaffSession()` checks Auth.js first.

## Operate it

```bash
# local
npx drizzle-kit push
npm run dev

# compose
docker compose up --build

# backups
bash scripts/backup-db.sh
# or POST /api/v1/admin/backups after staff login
```

Admin console: `/admin/infra`.
