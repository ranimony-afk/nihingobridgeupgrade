# Deployment

## Environments

1. **Sandbox / local** — `DATABASE_URL` only. Redis, Supabase, Sentry optional.
2. **Compose** — Postgres + Redis + app (`docker compose up --build`).
3. **Vercel + Supabase** — set `DATABASE_URL` to the Supabase pooler URL (port 6543) and optionally `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Keep Drizzle; do not switch ORMs.

## Required secrets

- `DATABASE_URL`
- `AUTH_SECRET` (32+ chars). Generate: `openssl rand -hex 32`

## Recommended secrets

- `REDIS_URL` — shared rate limits across instances
- `ADMIN_BOOTSTRAP_PASSWORD` — before first staff seed
- `ERROR_WEBHOOK_URL` — generic incident webhook
- `NEXT_PUBLIC_APP_URL` — canonical origin

## Pipeline

GitHub Actions `CI` runs unit tests, `tsc`, `drizzle-kit push` against a service container, integration/smoke tests, and `next build`.

`Database backup` runs daily at 03:17 UTC when `secrets.DATABASE_URL` is set, uploads `pg_dump` artifacts for 14 days.

## Health

- Platform probe: `GET /api/health` → `{ "ok": true }`
- Deep probe: `GET /api/v1/health`
