# NihongoBridge Phase 2 — Production Infrastructure

## What this phase adds

Phase 2 extends the existing Next.js dashboard and preserves `/`, `/api/feathers`, and `/api/health`. It adds:

- PostgreSQL/Drizzle migration ownership and Auth.js adapter tables.
- Auth.js v5 with GitHub OAuth, database sessions, and typed learner roles.
- Supabase public and server-only client boundaries.
- Redis-backed rate limiting with bounded local fallback.
- Zod environment validation, structured Pino logging, Sentry error reporting, Vercel Analytics, and Speed Insights.
- Liveness/readiness endpoints, security headers, global render error handling, Docker, CI, production deployment, smoke tests, and database backups.

## Prerequisites

- Node.js 22 LTS.
- PostgreSQL 16 or compatible managed PostgreSQL.
- Redis 7 or compatible managed Redis.
- A GitHub OAuth application.
- A Supabase project for Storage/Auth-adjacent services.
- Optional Sentry project and Vercel project.

## Environment configuration

Copy the tracked template and populate values in a secret manager or local `.env` file:

```bash
cp .env.example .env
```

Never commit `.env`. Required values for a production-ready deployment are:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL application connection string. Use a least-privilege runtime user with TLS enabled. |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL, including scheme. |
| `AUTH_SECRET` | Random secret of at least 32 characters. Generate with `openssl rand -base64 48`. |
| `AUTH_TRUST_HOST` | Set to `true` behind the production proxy. |
| `GITHUB_ID`, `GITHUB_SECRET` | GitHub OAuth application credentials. Register `<NEXT_PUBLIC_APP_URL>/api/auth/callback/github` as the callback URL. |
| `REDIS_URL` | TLS Redis URL for distributed rate limiting. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase browser configuration. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key. Never prefix it with `NEXT_PUBLIC_`. |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Server/browser error tracking DSNs. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | CI build source-map upload configuration. |

`src/lib/env.ts` validates all partial configuration combinations. A feature is not considered configured until its full credential set is present. `productionReadinessIssues()` is exposed through health reporting; deployment should fail the production admission gate if it reports any missing integration.

## Authentication and database sessions

`src/auth.ts` configures Auth.js v5 with:

- `@auth/drizzle-adapter` over PostgreSQL.
- Persistent database sessions.
- GitHub OAuth when the credential pair is present.
- Additive `learner` role default on `users`.
- Typed `session.user.id` and `session.user.role` values.

The handler is available at `/api/auth/[...nextauth]`. Configure the GitHub callback URL exactly as:

```text
https://your-domain.example/api/auth/callback/github
```

Do not add password or email-only authentication without an independently verified identity flow. Existing feature APIs remain operational and will be linked to authenticated learner ownership in the authorization phase.

## Supabase

The integration uses two deliberately separate factories:

- `src/lib/supabase/browser.ts` uses only the URL and publishable key.
- `src/lib/supabase/server.ts` is marked `server-only` and requires the service-role key at call time.

Provision Supabase Storage buckets and Row Level Security policies before any browser-side data access is introduced. Service-role access must remain inside server route handlers/services and must always include an application-level actor/tenant authorization decision before it is used.

## Redis and rate limiting

`src/lib/rate-limit.ts` uses an atomic Redis Lua script for fixed-window counters. The existing feather API now emits:

- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`
- `Retry-After` when rejected

Set `RATE_LIMIT_ALLOW_MEMORY_FALLBACK=false` in production. The development fallback is intentionally observable through `X-RateLimit-Source: memory`; it is not a substitute for distributed production limits.

## Migrations

The canonical migration is `drizzle/0000_phase2_auth_infrastructure.sql`. It contains the preserved `feather_progress` table and the new Auth.js tables:

- `users`
- `accounts`
- `sessions`
- `verification_tokens`
- `authenticators`

Use these commands:

```bash
# Create a reviewed migration after a schema change
npx drizzle-kit generate --config drizzle.config.ts --name meaningful_change

# Apply checked-in migration journal
npx tsx src/db/migrate.ts

# Local development only: compare schema and synchronize an ephemeral database
npx drizzle-kit push --config drizzle.config.ts
```

Do not use `drizzle-kit push` against production. Back up the database, review generated SQL, deploy the migration artifact, and run `npx tsx src/db/migrate.ts` once per release before application rollout.

## Health and smoke tests

| Endpoint | Use | Success condition |
| --- | --- | --- |
| `/api/health/live` | Process liveness | Always `200` while the app can answer requests. |
| `/api/health/ready` | Load balancer readiness | `200` when PostgreSQL is reachable; `503` when it is not. |
| `/api/health` | Detailed operational status | Preserves `{ ok }` and reports database, Redis, Supabase, Auth.js, Sentry, and readiness issues. |

Run a deployment smoke test with:

```bash
SMOKE_TEST_URL=https://your-domain.example node scripts/smoke-test.mjs
```

The script probes all three endpoints and fails on non-2xx responses or malformed payloads.

## Observability

- Pino emits structured server logs with request fields and a redaction list for auth headers, cookies, tokens, secrets, and passwords.
- Sentry initializes in Node.js, edge, and browser runtime only when a DSN is present.
- The global App Router error boundary captures render failures.
- Vercel Analytics and Speed Insights are attached in `src/app/layout.tsx`.
- Use `LOG_LEVEL=info` in production; temporary `debug` is appropriate only for targeted incident investigation.

## Security headers

`next.config.ts` configures:

- Content Security Policy.
- HSTS with subdomain and preload directives.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- Strict referrer policy.
- Denied camera, microphone, geolocation, payment, and USB permissions.
- Disabled `X-Powered-By` response header.

Review CSP source lists whenever a third-party script or asset host is added. Do not weaken the policy globally to accommodate a new dependency.

## Docker

Build and run the full local dependency topology:

```bash
export POSTGRES_PASSWORD="set-a-local-secret"
export REDIS_PASSWORD="set-a-local-secret"
export AUTH_SECRET="$(openssl rand -base64 48)"
docker compose up --build
```

`docker-compose.yml` starts PostgreSQL 16, Redis 7 with persistence, and the non-root standalone Next.js image. The web service waits for dependency health checks and exposes `/api/health/ready` as its container health check.

Migrations are intentionally not executed on every container boot. Run the reviewed migration as an explicit pre-deploy operation to avoid concurrent replica migration races.

## GitHub Actions and deployment

### CI

`.github/workflows/ci.yml` runs on pull requests and `main` pushes. It provisions PostgreSQL, applies migrations, runs Vitest unit/integration tests, lint, typecheck, production build, starts the server, and executes smoke tests.

### Production release

`.github/workflows/deploy-production.yml` triggers on `v*` tags or manual dispatch. Configure these GitHub environment secrets and variables before enabling releases:

**Secrets:**

- `DATABASE_URL`
- `AUTH_SECRET`
- `REDIS_URL`
- `GITHUB_ID`
- `GITHUB_SECRET`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`

**Environment variables:**

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

The workflow applies migrations before building a prebuilt Vercel deployment and then smoke-tests the returned production URL.

## Automatic database backups and restore drill

`.github/workflows/database-backup.yml` runs daily at 02:17 UTC and can also be dispatched manually. It:

1. Installs the PostgreSQL client.
2. Runs `scripts/backup-database.sh` with `DATABASE_URL` from the protected production environment.
3. Validates the dump using `pg_restore --list`.
4. Writes a SHA-256 manifest.
5. Uploads the backup artifact with 30-day retention.

The workflow artifact is encrypted at rest by GitHub. For long-term retention and a stronger disaster-recovery posture, mirror verified dumps to a company-controlled encrypted object-storage vault with immutable retention and separate access controls.

Restore to an isolated database first:

```bash
createdb nihongobridge_restore
pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" backups/nihongobridge-<timestamp>.dump
```

Run a smoke test against the restored environment before authorizing any production recovery. Conduct a documented restore drill at least quarterly.

## Tests

```bash
npx vitest run
```

Infrastructure tests currently cover environment readiness, rate limiting, and the database-backed health endpoint. Any new infrastructure feature must add unit tests plus an integration test that exercises its real boundary using disposable CI infrastructure.
