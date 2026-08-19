# Production checklist

Use this before promoting a build. The LMS lesson loop must stay green.

## Required

- [ ] `DATABASE_URL` points at Postgres or the Supabase pooler
- [ ] `AUTH_SECRET` is 32+ random bytes (`openssl rand -hex 32`)
- [ ] `GET /api/health` returns `{ "ok": true }`
- [ ] `GET /api/v1/health` shows `database.status = up`
- [ ] Staff can sign in at `/admin/login`
- [ ] A learner can finish `/learn/vowel-tide`

## Recommended

- [ ] `REDIS_URL` set so rate limits are shared across instances
- [ ] `SUPABASE_URL` + `SUPABASE_ANON_KEY` if using Supabase Auth/Storage later
- [ ] `ERROR_WEBHOOK_URL` for paging
- [ ] GitHub Actions secrets: `DATABASE_URL` (backups), `VERCEL_TOKEN` (deploy)
- [ ] Nightly backup artifact appeared in Actions
- [ ] `ADMIN_BOOTSTRAP_PASSWORD` rotated after first seed

## Do not

- Remove `/api/health`, `/api/me`, `/api/game`
- Drop `nb_learner` until a dual-read window is complete
- Point `drizzle-kit push` at production without a backup row in `backup_runs`
