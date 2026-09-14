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

echo "==> creating PostgreSQL search extensions/indexes (additive)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/search-indexes.sql

if [ "${1:-}" = "--schema" ]; then
  echo "==> schema only, skipping ETL"
  exit 0
fi

echo "==> running knowledge ETL (kanji / radicals / vocabulary)"
node etl/run-pipeline.mjs

echo "==> running grammar ETL (points + corpus examples)"
node etl/run-grammar-pipeline.mjs

echo "==> loading canonical sentences, courses and lessons"
node etl/run-content-pipeline.mjs

echo "==> applying course modules, prerequisites and knowledge links"
node etl/run-course-architecture.mjs

echo "==> applying lesson sections, blocks and prerequisites"
node etl/run-lesson-architecture.mjs

echo "==> generating lesson exercises"
node etl/run-exercise-engine.mjs

echo "==> building the canonical question bank"
node etl/run-question-bank.mjs

echo "==> loading JLPT test blueprints (structure only)"
node etl/run-jlpt-blueprints.mjs

echo "==> rebuilding PostgreSQL unified search projection"
node etl/run-search-index.mjs

echo "==> verifying database gates"
node tests/knowledge-gate.mjs
node tests/grammar-gate.mjs
node tests/search-gate.mjs
node tests/course-architecture-gate.mjs
node tests/lesson-architecture-gate.mjs
node tests/lesson-player-gate.mjs
node tests/exercise-engine-gate.mjs
node tests/progress-gate.mjs
node tests/question-engine-gate.mjs
node tests/quiz-gate.mjs
node tests/jlpt-gate.mjs

if [ -n "${BASE_URL:-}" ]; then
  echo "==> verifying HTTP/UI gates against $BASE_URL"
  node tests/knowledge-gate.mjs "$BASE_URL"
  node tests/grammar-gate.mjs "$BASE_URL"
  node tests/grammar-api-gate.mjs "$BASE_URL"
  node tests/grammar-explorer-gate.mjs "$BASE_URL"
  node tests/grammar-detail-gate.mjs "$BASE_URL"
  node tests/search-gate.mjs "$BASE_URL"
  node tests/unified-search-gate.mjs "$BASE_URL"
  node tests/course-architecture-gate.mjs "$BASE_URL"
  node tests/lesson-architecture-gate.mjs "$BASE_URL"
  node tests/lesson-player-gate.mjs "$BASE_URL"
  node tests/exercise-engine-gate.mjs "$BASE_URL"
  node tests/progress-gate.mjs "$BASE_URL"
  node tests/question-engine-gate.mjs "$BASE_URL"
  node tests/quiz-gate.mjs "$BASE_URL"
  node tests/jlpt-gate.mjs "$BASE_URL"
else
  echo "==> skipping HTTP/UI gates (set BASE_URL to enable)"
fi

echo "==> done"
