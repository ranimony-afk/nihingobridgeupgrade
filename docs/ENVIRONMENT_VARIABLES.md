# Outbound Platform Environment Configuration Reference

**Document Version:** 4.0.0  
**Target Environments:** Vercel Edge, GitHub Actions, Local  

---

## 1. Environment Variable Architecture

The Nihongo Bridge unified platform separates configuration and secrets cleanly. All production credentials read directly from `process.env` and are centralized in `src/lib/env.ts`.

### 1.1 Complete Variables Specifications

| Env Variable Name | Required | Target Environment | Purpose |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **YES** | All | Connection string for PostgreSQL database. Use transaction pooler on Vercel. |
| `NEXTAUTH_URL` | **YES** | Prod/Staging | Canonical domain of the application (e.g., `https://nihongobridge.com`). |
| `NEXTAUTH_SECRET` | **YES** | All | 32-character encryption key for cookies. |
| `SUPABASE_URL` | **NO** | Cloud Storage | Supabase project REST base URL endpoint. |
| `SUPABASE_ANON_KEY` | **NO** | Client Storage | Public client anon credential. |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO** | Admin Storage | Secret server-side key bypassing DB RLS policies. |
| `RESEND_API_KEY` | **NO** | Outbound Emails | Resend API credential token starting with `re_`. |
| `EMAIL_FROM` | **NO** | Outbound Emails | Outbound sender address (verified custom domain). |
| `GOOGLE_CLIENT_ID` | **NO** | Social Logins | Client id for Google Social Sign-ins. |
| `GOOGLE_CLIENT_SECRET` | **NO** | Social Logins | Private secret key for Google social logins. |
| `ADMIN_EMAIL` | **YES** | Seeding / Bootstrap | Primary administrator email bootstrapped on start. |
| `ADMIN_PASSWORD` | **YES** | Seeding / Bootstrap | Default password for initial administrator logins. |
| `REDIS_URL` | **NO** | Cache / Queue | Connection string for Redis clusters cache lines. |
| `SENTRY_DSN` | **NO** | Monitoring | Outbound real-time error logging ingestion url. |
| `OPENAI_API_KEY` | **NO** | AI Tutors | Private key starting with `sk-` for conversational speech roleplays. |

---

## 2. Setting Up Variables

1. Copy the `.env.example` file:
   ```bash
   cp .env.example .env
   ```
2. Enter your live PostgreSQL, NextAuth, and administrator values into `.env`.
3. Never commit `.env` or other key files to GitHub or Git tracking.

*(Expected Variables Dashboard Screenshot Placeholder: [vercel_env_variables_configuration_settings.png])*
