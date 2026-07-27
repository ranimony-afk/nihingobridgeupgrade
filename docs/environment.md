# Environment Variable & Configuration Guide

**Document Version:** 4.0.0 (Master Foundation)  
**Target Platform:** Nihongo Bridge Unified Learning Platform  

---

## 1. Environment Variable Architecture

To guarantee strict separation between code and configuration, all sensitive credentials, database connection strings, and third-party service endpoints are loaded dynamically through `process.env` and centralized in `src/lib/env.ts`.

### 1.1 Complete Variable Specification

| Variable Name | Required / Optional | Target Environments | Description & Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Required** | Production, Staging, Local | Connection string for the PostgreSQL database instance (`pg` pool). Must support standard PostgreSQL query parameters such as `?sslmode=require` for Supabase or RDS. |
| `NEXTAUTH_URL` | **Required** | Production, Staging | Canonical base URL of the deployed application (e.g. `https://nihongobridge.com`). Used by NextAuth.js to generate valid callback and redirect URLs. In local development, defaults to `http://localhost:3000`. |
| `NEXTAUTH_SECRET` | **Required** | Production, Staging | A secure, cryptographically random 32-character secret key used by NextAuth.js to sign and encrypt session cookies and authentication tokens. |
| `JWT_SECRET` | **Required** | Production, Staging, Local | Secret signing key used by `signMobileJwt` and `verifyMobileJwt` (`src/shared/mobile/index.ts`) to generate HMAC SHA-256 Bearer tokens for mobile clients (Flutter, React Native, iOS, Android). In development, falls back to `NEXTAUTH_SECRET` if unspecified. |
| `SUPABASE_URL` | **Optional** | Storage / Auth Integrations | The REST API base URL for your Supabase project instance (e.g. `https://xyzproject.supabase.co`). Used when uploading or downloading binary media assets to Supabase Storage. |
| `SUPABASE_ANON_KEY` | **Optional** | Storage / Client Queries | The public anonymous API key provided by Supabase. Safe to expose to client bundles if Row-Level Security (RLS) policies are configured. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Optional** | Server-Side Admin Actions | The administrative service role API key bypassing RLS. Must remain strictly on the server side (in API route handlers or server components) and never be prefixed with `NEXT_PUBLIC_`. |

---

## 2. Setup Instructions by Target Platform

### 2.1 Vercel Deployment
1. Navigate to your Vercel Project Dashboard → **Settings** → **Environment Variables**.
2. Add `DATABASE_URL` pointing to your Supabase PostgreSQL connection string (use the **Transaction Pooler** port `6543` for serverless environments).
3. Generate a secure secret using `openssl rand -base64 32` and enter it for both `NEXTAUTH_SECRET` and `JWT_SECRET`.
4. Set `NEXTAUTH_URL` to your production domain or Vercel deployment URL.

### 2.2 GitHub Actions CI/CD Pipeline
In your GitHub Repository → **Settings** → **Secrets and variables** → **Actions**:
- Add `DATABASE_URL` if executing automated integration tests or Drizzle migrations against a staging database.
- For unit build verification (`npm run build`, `npm test`), local mock variables are automatically supplied via `.env` or CI environment step injections.

### 2.3 Local Development Setup
1. Copy the template file to create your local environment:
   ```bash
   cp .env.example .env
   ```
2. Replace placeholder strings in `.env` with your local PostgreSQL connection string (e.g., `postgresql://postgres:postgres@127.0.0.1:5432/app_db`).
3. Execute `npm run dev` to start the Next.js Turbopack development server.

---

## 3. Security Best Practices & Guardrails

- **Zero Client-Side Secret Exposure**: Never prefix `DATABASE_URL`, `NEXTAUTH_SECRET`, `JWT_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`. Doing so will bundle secrets into public browser JavaScript files.
- **Git Verification**: Ensure `.env` is listed in `.gitignore`. Only `.env.example` containing descriptive placeholder values should be committed to version control.
