#!/usr/bin/env bash
# Provision the NihongoBridge knowledge database (additive only).
#
#   ./scripts/provision.sh            # schema + data
#   ./scripts/provision.sh --schema   # schema only
#   SKIP_ETL=1 ./scripts/provision.sh --schema
#
# Requires: DATABASE_URL (see .env.example), node, npx, curl (for downloads).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL is required (see .env.example)}"

echo "==> pushing Drizzle schema (additive)"
npx drizzle-kit push --config drizzle.config.json

if [ "${1:-}" = "--schema" ]; then
  echo "==> schema only, skipping ETL"
  exit 0
fi

echo "==> running knowledge ETL"
node etl/run-pipeline.mjs

echo "==> verifying"
node tests/knowledge-gate.mjs "${BASE_URL:-}"

echo "==> done"
