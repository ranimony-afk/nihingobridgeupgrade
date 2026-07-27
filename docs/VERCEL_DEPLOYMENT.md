# Vercel Production Deployment Guide

**Document Version:** 4.0.0  
**Target Platform:** Vercel Global Edge Network  

---

## 1. Automated GitHub/Vercel Deployment

Deploying the Nihongo Bridge platform to Vercel takes under 2 minutes:

1. **Import Project**
   - Push your code to a clean GitHub repository.
   - Import the repository inside your [Vercel Dashboard](https://vercel.com).

2. **Select Next.js Framework**
   - Vercel will automatically identify the project as **Next.js**.

3. **Configure Production Environment Secrets**
   Add the variables under **Project Settings** &rarr; **Environment Variables**:
   - `DATABASE_URL`: Pointing to your Supabase Transaction Pooler (Port `6543`) with `?sslmode=require`.
   - `NEXTAUTH_URL`: Your custom production domain (e.g., `https://nihongobridge.com`).
   - `NEXTAUTH_SECRET` & `JWT_SECRET`: Random 32-character keys (e.g. `openssl rand -base64 32`).

4. **Trigger Deployment**
   - Click **Deploy**. Vercel will bundle static assets, compile routes, and push the project to the Edge.

*(Expected Vercel Build Success Screenshot Placeholder: [vercel_deployment_successful_dashboard.png])*

---

## 2. Compile-Time Build Guardrails (Important)

- **Do Not Run Migrations inside Vercel Build**:
  Vercel is a stateless, serverless build sandbox. Running database migrations (`drizzle-kit push` or `migrate.ts`) during `next build` is highly discouraged as it triggers build locks and connection errors.
- **Dynamic Database Fallbacks**:
  Our platform uses smart compile-time fallbacks in `src/db/index.ts`. Next.js page data and route typegen compile flawlessly even when production variables are absent in CI/CD sandboxes.
