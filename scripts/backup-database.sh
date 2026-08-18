#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

backup_directory="${BACKUP_DIRECTORY:-./backups}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${backup_directory}/nihongobridge-${timestamp}.dump"
manifest_file="${backup_file}.sha256"

action_cleanup() {
  rm -f "${backup_file}.partial"
}
trap action_cleanup EXIT

umask 077
mkdir -p "$backup_directory"

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${backup_file}.partial"

pg_restore --list "${backup_file}.partial" >/dev/null
mv "${backup_file}.partial" "$backup_file"
sha256sum "$backup_file" > "$manifest_file"

find "$backup_directory" -type f \( -name '*.dump' -o -name '*.dump.sha256' \) -mtime "+${retention_days}" -delete

echo "Database backup verified: ${backup_file}"
