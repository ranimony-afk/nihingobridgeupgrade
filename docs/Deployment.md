# Production Deployment Checklist & Rollback Plan

**Document Version:** 4.1.0  
**Target Platform:** Nihongo Bridge Unified Learning Platform (Next.js 16 + Drizzle ORM + Supabase PostgreSQL)  

---

## 1. Pre-Deployment Verification Runbook

Before triggering any production deployment, the release engineer must run and verify the following commands in a clean staging environment:

### 1.1 Integrity Checks

1. **Install Dependencies**
   Ensure that a fresh, lockfile-locked installation completes with zero dependency resolution conflicts:
   ```bash
   npm ci
   ```

2. **Database Migration Generation**
   Verify that Drizzle ORM schema changes are correctly compiled and match the TypeScript declarations:
   ```bash
   npm run db:generate
   ```

3. **Programmatic Database Migration Test**
   Run the migration script against a mock or staging PostgreSQL instance to guarantee that all 38 relational tables are successfully provisioned with correct keys and indices:
   ```bash
   # Sets DATABASE_URL to a test instance and runs migrations
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/test_db" npm run db:migrate
   ```

4. **Database Seeding Verification**
   Verify that the idempotent seeding script runs to completion with zero duplicate insertion or primary key conflicts, populating baseline tenant records (Ascend Academy, Nihongo Bridge), news articles, Kanji dictionaries, and Conversation Lab interactive lessons:
   ```bash
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/test_db" npm run db:seed
   ```

5. **Static Analysis & Type Checking**
   Run the TypeScript compiler to ensure 100% type safety across both web, admin, and mobile API routing layers:
   ```bash
   npm run typecheck
   ```

6. **Next.js Production Build**
   Trigger the Next.js production bundler. Ensure that the build compiles successfully with zero compile-time module evaluation errors:
   ```bash
   npm run build
   ```

7. **Automated Test Suite**
   Ensure all 19 unit and integration tests run and pass without failures:
   ```bash
   npm run test
   ```

---

## 2. Supabase & Database Configuration Guide

To ensure zero downtime and optimal performance under heavy load, the Supabase database must be provisioned as follows:

### 2.1 Connection Pooling Setup
- **Transaction Pooler (Port 6543)**: Serverless environments (like Vercel functions) must connect to the Supabase transaction pooler port (`6543`) rather than the direct database port (`5432`). This prevents pool exhaustion during concurrent lambda executions.
- **Direct Connection (Port 5432)**: Use only for administrative migration and seeding scripts (run via SSH, GitHub Actions, or local terminals).

### 2.2 SSL Settings
- Always append `?sslmode=require` to the end of the `DATABASE_URL` string to guarantee encrypted transport-layer security between the serverless app router and Supabase.

---

## 3. Production Deployment Checklist (Vercel)

Follow these steps to deploy to Vercel:

1. **Create Vercel Project**
   - Import the repository into the Vercel Team dashboard.
   - Set the Framework Preset to **Next.js**.

2. **Configure Environment Variables**
   Add the following production environment variables under Project Settings → **Environment Variables**:
   - `DATABASE_URL`: Pointing to your Supabase Transaction Pooler (e.g., `postgresql://postgres.yourproject:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`).
   - `NEXTAUTH_URL`: The custom canonical production domain (e.g., `https://nihongobridge.com`).
   - `NEXTAUTH_SECRET`: A secure, cryptographically random 32-character secret key (generate with `openssl rand -base64 32`).
   - `JWT_SECRET`: Secret signing key used by the mobile API layer (same as or different from `NEXTAUTH_SECRET`).
   - `SUPABASE_URL`: (Optional) Your Supabase project URL.
   - `SUPABASE_ANON_KEY`: (Optional) Your Supabase anonymous client API key.
   - `SUPABASE_SERVICE_ROLE_KEY`: (Optional) Your Supabase service role key (server-side only).

3. **Deploy Release Branch**
   - Push the vetted code to the main release branch (e.g., `main` or `production`).
   - Monitor the Vercel build output to ensure compiling, linting, and route-type generation succeed.

4. **Post-Deployment Smoke Tests**
   - Check `GET https://your-domain.com/api/health` and verify the JSON response is `{ "ok": true }`.
   - Test Mobile Auth & Registration: Submit a POST request to `/api/v1/mobile/auth` with a new email address and verify that it registers the user and returns a signed Bearer token.
   - Access the Headless CMS Admin Dashboard (`/admin`) and verify the brand workspaces are rendered and fully editable.

---

## 4. Production Rollback Plan

In the rare event of a severe production regression (e.g., memory leak, database lock, or API service outage):

### 4.1 Deployment Rollback (Zero-Downtime)
1. **Identify Stable Commit**
   - Find the last known-good deployment SHA in your git history or Vercel Deployment List.
2. **Promote Stable Build**
   - In Vercel, navigate to Project → **Deployments**.
   - Click the options menu next to the stable deployment and select **Promote to Production**. This instantly reroutes edge traffic back to the stable build container, bypassing the faulty commit in `< 2 seconds`.

### 4.2 Database Rollback (Backward Compatibility Safeguard)
1. **Additive Schema Guarantee**
   - Because all Drizzle ORM migrations are designed to be strictly **additive** (no tables or columns are destructively dropped or renamed in a single release), the database remains 100% backward-compatible with older codebases.
   - You do **not** need to revert the database schema or restore a backup during a standard code rollback, as the older version of the Next.js app will safely ignore any new additive columns or tables without crashing.
2. **Emergency Schema Revert (If Destructive Changes Occurred)**
   - If a manual schema alteration broke database compatibility, restore the database to the pre-deployment snapshot using Supabase's **Point-in-Time Recovery (PITR)** or automated nightly backups.
