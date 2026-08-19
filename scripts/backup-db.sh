#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/app_db_${STAMP}.sql.gz"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --no-owner --format=plain "$DATABASE_URL" | gzip > "$FILE"
  BYTES="$(wc -c < "$FILE" | tr -d ' ')"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "insert into backup_runs (id, filename, bytes, status, note) values ('bak_${STAMP}', 'app_db_${STAMP}.sql.gz', ${BYTES}, 'ok', 'cron-pg_dump')"
  echo "Wrote ${FILE} (${BYTES} bytes)"
  exit 0
fi

echo "pg_dump not found. Use POST /api/v1/admin/backups for the in-app logical snapshot." >&2
exit 2
