# DECISION LOG — NihongoBridge Integration

Local Phase 00 source of truth. GitHub A's copy remains historical; DEC-0008+ supersede stale conclusions.

## Format

### DEC-NNNN — Title

**Date:** YYYY-MM-DD  
**Phase:** Phase NN  
**Status:** PROPOSED | ACCEPTED | REJECTED | SUPERSEDED  
**Author:** Integration Team

---

## Decisions

### DEC-0001 — Repository A Is Authoritative

**Date:** 2025-01-01  
**Phase:** Pre-Phase  
**Status:** ACCEPTED  
**Decision:** `nihingobridgeupgrade` is canonical production. `Knowledge-base-NihongoBridge` is a source repository only.  
**Note:** Narrative that A "already has authentication" is **incorrect** (Phase 00 2026-03-25). The authority rule still stands.  
**Confidence:** HIGH  
**Reversible:** NO

### DEC-0002 — Non-Destructive Database Operations Only

**Date:** 2025-01-01  
**Status:** ACCEPTED  
**Decision:** No DROP TABLE / DROP COLUMN / TRUNCATE unless explicitly authorized. Prefer CREATE, ADD, BACKFILL, MIGRATE, DEPRECATE.  
**Confidence:** HIGH

### DEC-0003 — Repository A Authentication Is Authoritative

**Date:** 2025-01-01  
**Status:** ACCEPTED (vacuous until A has auth)  
**Decision:** Do not replace A's auth with B's. If A has no auth, design one deliberately (see DEC-0005, DEC-0011).  
**Confidence:** HIGH

### DEC-0004 — One PostgreSQL Schema

**Date:** 2025-01-01  
**Status:** ACCEPTED  
**Decision:** Single canonical Drizzle schema in A's `src/db/schema.ts`. No competing B schema in production.

### DEC-0005 — Authentication Library

**Date:** 2025-07-16  
**Phase:** Phase 00  
**Status:** PROPOSED (still open)  
**Decision:** Not taken. Candidate remains Auth.js v5 for web sessions, with a Bearer story for Flutter. Final choice is Phase 01.  
**Not chosen:** Repo B Supabase JWT (see DEC-0011).

### DEC-0006 — Repo A Was a Clean Starter (historical)

**Date:** 2025-07-16  
**Status:** SUPERSEDED by DEC-0008  
**Reason:** True of the *local sandbox* and of GitHub A at that time. False of current GitHub A `main` (39 tables, 31 routes).

### DEC-0007 — Conditional Phase 00 Pass Without Repo B

**Date:** 2025-07-16  
**Status:** SUPERSEDED by DEC-0008  
**Reason:** Repo B is now publicly available and has been audited.

---

### DEC-0008 — Phase 00 Re-Audit Supersedes 2025-07-16 Audits

**Date:** 2026-03-25  
**Phase:** Phase 00  
**Status:** ACCEPTED  
**Author:** Integration Team

**Context:** GitHub A masterplan audits claimed empty schema and unavailable Repo B. Both are false against clones of 2026-03-25.

**Decision:** `reports/audits/*` in this workspace are the Phase 00 source of truth. GitHub A `nihongobridge-integration-masterplan/reports/audits/*` is ARCHIVE.

**Confidence:** HIGH  
**Migration Risk:** LOW  
**Reversible:** YES (docs only)

---

### DEC-0009 — Three-Way Artifact Model

**Date:** 2026-03-25  
**Phase:** Phase 00  
**Status:** ACCEPTED

**Context:** Local sandbox ≠ GitHub A tree ≠ Repo B.

**Options:**
1. Ignore GitHub A domain code and treat local as green field — loses A work.
2. Replace local with a blind copy of GitHub A + B — out of Phase 00 scope; risky.
3. Document the split; Phase 01 additively ports GitHub A foundation into local; B stays source-only.

**Decision:** Option 3.

**Consequences:** Phase 01 starts with schema/foundation port from GitHub A, not with B packages.

**Confidence:** HIGH  
**Migration Risk:** MEDIUM  
**Reversible:** PARTIAL

---

### DEC-0010 — Canonical Data Model Is GitHub A's Text-PK Schema

**Date:** 2026-03-25  
**Phase:** Phase 00  
**Status:** ACCEPTED

**Context:** A and B both define `dictionary_entries` (and others) with incompatible PKs and columns.

**Options:**
1. Adopt B UUID schema — destroys A's 39-table design; requires DROP/rebuild.
2. Run both — competing schemas, forbidden.
3. Keep A's text PKs; merge missing B attributes additively later.

**Decision:** Option 3. Never apply B `drizzle/*.sql`.

**Confidence:** HIGH  
**Migration Risk:** CRITICAL if violated  
**Reversible:** NO if B migrations are applied

---

### DEC-0011 — Do Not Adopt Repo B Supabase JWT as Identity

**Date:** 2026-03-25  
**Phase:** Phase 00  
**Status:** ACCEPTED

**Context:** B implements jose+Supabase in three packages plus `x-user-id` bypass. A has no auth.

**Decision:** Reject B auth as A's system. Design A auth in Phase 01 (DEC-0005 still open for library). Profile fields from B `users` may be merged after A's identity table exists.

**Confidence:** HIGH  
**Migration Risk:** CRITICAL if B auth is copied  
**Reversible:** YES until copied

---

### DEC-0012 — Search v1 Is PostgreSQL FTS / pg_trgm

**Date:** 2026-03-25  
**Phase:** Phase 00  
**Status:** ACCEPTED

**Context:** Target architecture and GitHub A DictionaryService already specify pg_trgm. B has Meilisearch+Fastify.

**Decision:** Meilisearch is DEPRECATE for v1. Japanese query helpers in B may be merged into SQL search later. Semantic search is future.

**Confidence:** HIGH  
**Migration Risk:** LOW  
**Reversible:** YES

---

### DEC-0013 — One Deployable Next.js App

**Date:** 2026-03-25  
**Phase:** Phase 00  
**Status:** ACCEPTED

**Decision:** Production web is a single Next.js App Router app (A). Do not nest or deploy B's web/api/admin/ai Next 14 apps. Flutter remains a client. Python ETL is a source of algorithms, not a Vercel runtime.

**Confidence:** HIGH  
**Migration Risk:** HIGH if violated (ops complexity)

---

### DEC-0014 — Phase 00 Does Not Modify Production Code

**Date:** 2026-03-25  
**Phase:** Phase 00  
**Status:** ACCEPTED

**Decision:** This phase writes reports, checklists, and decision/risk logs only. `src/` is untouched.

**Confidence:** HIGH
