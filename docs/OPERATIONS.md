# Operations

## Logs

All new infra logs are JSON: `{ "level", "msg", "ts", ... }`. Grep `game.action`, `backup.completed`, `error.captured`.

## Rate limits

`POST /api/game` is capped at 80 requests / 60s / client IP. Response `429` + `Retry-After`. Redis is used when `REDIS_URL` is reachable; otherwise a process-local counter.

## Backups

- Cron / Actions: `scripts/backup-db.sh` (needs `pg_dump`)
- On-demand: Admin → Infra → **Run logical backup** (table inventory snapshot + `backup_runs` row)
- Restore (physical dump): `gunzip -c backups/app_db_*.sql.gz | psql "$DATABASE_URL"`

## Error tracking

Unhandled LMS/API exceptions in `/api/game` and client `global-error` write to `error_events`. Staff list: `GET /api/v1/errors`.

## Analytics

`game_action` events are recorded from the existing game facade. Staff: `GET /api/v1/analytics`.
