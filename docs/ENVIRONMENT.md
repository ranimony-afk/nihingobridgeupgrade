# Environment

Validated by `parseEnv()` / `getEnv()` (`src/lib/infra/env.ts`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Drizzle / Postgres |
| `AUTH_SECRET` | prod | Auth.js JWT signing |
| `AUTH_TRUST_HOST` | no | Trust `X-Forwarded-Host` |
| `REDIS_URL` | no | Shared rate limits |
| `SUPABASE_URL` | no | Supabase JS client |
| `SUPABASE_ANON_KEY` | no | Supabase JS client |
| `SENTRY_DSN` | no | Reserved; DB tracking is default |
| `ERROR_WEBHOOK_URL` | no | POST incidents |
| `ADMIN_BOOTSTRAP_PASSWORD` | no | First staff hash |
| `ADMIN_SESSION_SECRET` | no | HMAC staff cookie |
| `NEXT_PUBLIC_APP_URL` | no | Canonical URL |
| `LOG_LEVEL` | no | `debug\|info\|warn\|error` |
| `BACKUP_DIR` | no | Default `backups` |

Copy `.env.example`. Never commit `.env`.
