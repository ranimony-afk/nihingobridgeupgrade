# System Maintenance & Troubleshooting Manual

**Document Version:** 4.0.0  
**Target Platform:** Nihongo Bridge Unified Learning Platform  

---

## 1. Standard Error Indicators & Solutions

### 1.1 "Database Refused / ECONNREFUSED" Error
- **Indication**: Next.js servers cannot connect to your PostgreSQL database.
- **Troubleshooting**:
  1. Check if the database engine is running:
     ```bash
     sudo service postgresql status
     ```
  2. Start the service if stopped:
     ```bash
     sudo service postgresql start
     ```
  3. Verify that your `DATABASE_URL` matches connection credentials.

### 1.2 "NextAuth Signature Fails / JWT Expired" Error
- **Indication**: Users cannot authenticate or are kicked out of their dashboards.
- **Troubleshooting**:
  1. Ensure `NEXTAUTH_SECRET` and `JWT_SECRET` keys are identical across all deployed serverless instances.
  2. Confirm that `NEXTAUTH_URL` matches the custom production domain exactly (no trailing slash).

### 1.3 "Table Not Found / Schema Mismatch" Error
- **Indication**: Executing queries triggers database column or index failures.
- **Troubleshooting**:
  1. Re-run schema migrations to align the database to your Drizzle snapshot:
     ```bash
     npm run db:migrate
     ```
  2. Run setup to perform complete validation checks:
     ```bash
     npm run setup
     ```

---

## 2. Recovery & Rollbacks

In the event of a severe deployment regression:
1. In your Vercel Project Dashboard, navigate to **Deployments**.
2. Click the options menu next to the last known-stable deployment.
3. Select **Promote to Production** to instantly roll back edge routers.

*(Expected Vercel Deployments Screenshot Placeholder: [vercel_rollback_promote_to_production_action.png])*
