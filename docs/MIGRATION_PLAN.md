# Phase 1 — Database & Content Migration Plan

**Document Version:** 1.0.0  
**Principle:** Zero-downtime, backwards-compatible, incremental schema evolution.

---

## 1. Multi-Stage Migration Strategy

To guarantee continuous availability and prevent regression for existing users and API consumers, migrations follow a four-stage phased deployment:

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Additive Schema Provisioning                       │
│ Create tables: brands, users, assets, pages, courses,       │
│ modules, lessons, translations, editorial_events.           │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Dual-Writing & Idempotent Seeding                  │
│ Seed baseline tenant configurations for Ascend & Nihongo.    │
│ Enable REST API v1 for parallel ingest and verification.    │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Dynamic Read Cutover                               │
│ Point web UI frontends to PostgreSQL queries and REST API.  │
│ Verify health checks and response envelopes.                │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Legacy Deprecation & Cleanup                       │
│ Decommission static hardcoded files and unmanaged SDKs.      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Drizzle ORM Schema Migration Runbook

All database migrations are strictly **additive**. Columns are never dropped or destructively renamed in a single step.

### Command Execution:
```bash
# Push schema updates directly to PostgreSQL
npx drizzle-kit push
```

### Table Migration Mapping:
1. `brands`: Populated with `ascend` (Ascend Academy) and `nihongo` (Nihongo Bridge).
2. `users`: Seeded with initial administrator and author profiles.
3. `pages`: Migrated from hardcoded markdown/JSX home page blocks into structured CMS entries.
4. `courses`, `modules`, `lessons`: Extracted from static catalogs (`lib/data.ts` and React trees) into normalized relational hierarchies.
5. `assets`: Centralized media store capturing all image and video asset URLs with MIME types.
6. `translations`: Populates locale overrides for `en`, `ja`, `es`, `fr`.

---

## 3. Data Integrity & Verification

- **Cold Start Safety**: `ensureSeed()` in `src/lib/seed.ts` guarantees database consistency upon container boot without duplicate insertion.
- **Health Check Continuity**: `/api/health` queries `select 1` and verifies the seed status, returning HTTP 200 `{ ok: true }`.
