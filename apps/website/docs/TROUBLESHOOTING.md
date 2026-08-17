# Platform Operations & Maintenance Manual

**Document Version:** 4.0.0  
**Target Runtime:** Node.js 22 LTS  
**System:** Nihongo Bridge Unified Learning Ecosystem  

---

## 1. System Administration & Commands

This manual outlines standard maintenance, troubleshooting, and operational instructions for developers, system administrators, and content editors on the Nihongo Bridge platform.

### 1.1 Command Cheat Sheet

The following commands are configured inside `package.json` for rapid execution:

- **Local Development Server**
  ```bash
  npm run dev
  ```
- **Static Analysis & Type Checking**
  ```bash
  npm run typecheck
  ```
- **Automated Tests Execution**
  ```bash
  npm run test
  ```
- **Drizzle SQL Migration Generation**
  ```bash
  npm run db:generate
  ```
- **Programmatic Database Migration Run**
  ```bash
  # Sets target DB URL and executes migrations
  DATABASE_URL="postgresql://[user]:[password]@[host]:5432/app_db?sslmode=require" npm run db:migrate
  ```
- **Idempotent Seeding Run**
  ```bash
  DATABASE_URL="postgresql://[user]:[password]@[host]:5432/app_db?sslmode=require" npm run db:seed
  ```
- **Next.js Production Compilation**
  ```bash
  npm run build
  ```

---

## 2. Troubleshooting & Diagnostic Guide

### 2.1 "connect ECONNREFUSED 127.0.0.1:5432" Error
- **Cause**: The PostgreSQL database service is either stopped or blocked.
- **Remediation**:
  1. Verify the service status on the hosting server:
     ```bash
     sudo service postgresql status
     ```
  2. If stopped, start the service:
     ```bash
     sudo service postgresql start
     ```
  3. Ensure that credentials (username, password, host, port, database name) match the `DATABASE_URL` exactly.

### 2.2 Next.js Build Fails on Missing Database
- **Cause**: The build compiler tries to pre-render static pages, but database connections fail or evaluate locks.
- **Remediation**:
  - We patched `src/db/index.ts` to fall back gracefully to a mock local database connection string when `DATABASE_URL` is missing during build compile-time. If compiling fails on Vercel, verify that standard environment credentials are added inside Project settings, or trigger a clean redeploy.

### 2.3 JWT Signature Verification Fails on Mobile
- **Cause**: The `JWT_SECRET` key on the serverless edge is different from the key used to sign the client token, or the token has expired.
- **Remediation**:
  - Check that `JWT_SECRET` and `NEXTAUTH_SECRET` are identical across all deployed serverless environments. If expired, prompt the mobile client to re-authenticate on `/api/v1/mobile/auth` with their email address.

---

## 3. Administrative Content Editing

The Headless CMS Admin Workspace is live at `/admin` (or `/admin/nihongo` for Nihongo Bridge). Editors can perform the following actions:

1. **Select Page Workspace**: Toggle page selectors (e.g. `home`, `about`, `privacy_policy`, `maintenance`) to load associated content sections.
2. **Reorder Sections**: Click the ↑ and ↓ arrow buttons to swap section priorities instantly.
3. **Duplicate Section**: Click the "Duplicate" button to create a draft copy of any section with randomized unique keys.
4. **Publishing Status Controls**: Use the action buttons to move sections across publishing life-cycles:
   - **Draft**: Saved, visible only to admin creators.
   - **Preview**: Rendered with high-contrast alert tags inside the live `/preview` canvas.
   - **Publish**: Active, served dynamically to all public students.
   - **Archive**: Soft-deleted from public view, retrievable.
5. **JSONB Content Editing**: Expand "Edit content", adjust metadata values or titles, and click "Save changes" to synchronize database records instantly.
6. **One-Click Versions Restore**: Click "Versions", browse prior manual or autosave snapshots, and click "Restore" to revert to a prior state.
