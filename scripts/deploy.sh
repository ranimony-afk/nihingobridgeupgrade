#!/usr/bin/env bash
set -euo pipefail

echo "NihongoBridge deploy gate"
test -n "${DATABASE_URL:-}" || { echo "DATABASE_URL is required"; exit 1; }
test -n "${AUTH_SECRET:-}" || echo "WARN: AUTH_SECRET missing; Auth.js will derive a local secret"

npm run typecheck
npm run build
echo "Build green. Ship with: docker compose up --build  OR  vercel --prod"
