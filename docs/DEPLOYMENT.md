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

1. **CI** (`.github/workflows/ci.yml`) — unit tests, `tsc`, schema push against a Postgres service, integration/smoke, `next build`.
2. **Deploy** (`.github/workflows/deploy.yml`) — re-runs the gate, then `vercel deploy` when `VERCEL_TOKEN` is set. Without the token it dry-runs after a green gate.
3. **Backup** (`.github/workflows/backup.yml`) — daily 03:17 UTC `pg_dump` when `secrets.DATABASE_URL` is set.

Local gate: `bash scripts/deploy.sh`.

See `docs/PRODUCTION_CHECKLIST.md` before promoting.

## Health

- Platform probe: `GET /api/health` → `{ "ok": true }`
- Deep probe: `GET /api/v1/health`
