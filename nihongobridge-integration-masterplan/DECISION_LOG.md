# DECISION LOG — NihongoBridge Integration

## Format

Each decision follows this template:

```
### DEC-NNNN — [Title]

**Date:** YYYY-MM-DD
**Phase:** Phase NN
**Status:** PROPOSED | ACCEPTED | REJECTED | SUPERSEDED
**Author:** [Who made the decision]

**Context:**
[Why this decision was needed]

**Options Considered:**
1. [Option A] — [Pros/Cons]
2. [Option B] — [Pros/Cons]
3. [Option C] — [Pros/Cons]

**Decision:**
[What was decided]

**Rationale:**
[Why this option was chosen]

**Consequences:**
[What this means for the project]

**Dependencies:**
[What this affects or depends on]

**File(s):**
[Relevant file paths]

**Confidence:** HIGH | MEDIUM | LOW
**Migration Risk:** LOW | MEDIUM | HIGH | CRITICAL
**Reversible:** YES | NO | PARTIAL
```

---

## Decisions

### DEC-0001 — Repository 1 Is Authoritative

**Date:** 2025-01-01
**Phase:** Pre-Phase
**Status:** ACCEPTED
**Author:** Integration Team

**Context:**
Two repositories exist. The project must determine which is canonical.

**Options Considered:**
1. Repository 1 (`nihingobridgeupgrade`) is authoritative — extend and improve
2. Repository 2 (`Knowledge-base-NihongoBridge`) is authoritative — rebuild around it
3. Start fresh from neither — new clean implementation

**Decision:**
Repository 1 is authoritative. Repository 2 is a source of verified functionality to be selectively integrated.

**Rationale:**
Repository 1 contains the active application with authentication, API routes, and production infrastructure. Replacing it would destroy existing value. Repository 2 contains specialized knowledge and features that should enhance, not replace, the existing platform.

**Consequences:**
- All changes extend Repository 1
- Repository 2 components must be adapted to Repository 1 patterns
- No bulk replacement of Repository 1 code

**Dependencies:**
- All subsequent phases

**File(s):**
- N/A (architectural decision)

**Confidence:** HIGH
**Migration Risk:** LOW
**Reversible:** NO

---

### DEC-0002 — Non-Destructive Database Operations Only

**Date:** 2025-01-01
**Phase:** Pre-Phase
**Status:** ACCEPTED
**Author:** Integration Team

**Context:**
Database schema changes are needed throughout the integration. The approach to schema migration must be defined.

**Decision:**
All database operations must be non-destructive. No DROP TABLE, TRUNCATE, or destructive schema replacement without explicit authorization.

**Rationale:**
Existing data may include user accounts, learning progress, and configuration that cannot be recreated. Destructive operations create irreversible data loss risk.

**Consequences:**
- Schema changes must use CREATE, ADD, BACKFILL, MIGRATE patterns
- Deprecated tables/columns must be archived, not dropped
- Compatibility layers may be needed during transition
- Migrations must be reversible where possible

**Dependencies:**
- Phase 01 (Foundation & Schema)
- All subsequent phases with database changes

**File(s):**
- `src/db/schema.ts`

**Confidence:** HIGH
**Migration Risk:** LOW
**Reversible:** YES

---

### DEC-0003 — Repository 1 Authentication Is Authoritative

**Date:** 2025-01-01
**Phase:** Pre-Phase
**Status:** ACCEPTED
**Author:** Integration Team

**Context:**
Both repositories may contain authentication implementations. A single authoritative auth system is needed.

**Decision:**
Repository 1 authentication (identity, sessions, RBAC) is authoritative. Repository 2 auth must not be introduced. All integrated components must adapt to Repository 1 auth.

**Rationale:**
Replacing authentication mid-integration risks session invalidation, data orphaning, and security gaps. Repository 1 auth is established and functional.

**Consequences:**
- Repository 2 auth code is classified as DEPRECATE
- Integrated components must use Repository 1 auth patterns
- Mobile client (Flutter) must authenticate via Repository 1 auth

**Dependencies:**
- Phase 08 (Mobile)
- All authenticated API endpoints

**File(s):**
- *To be identified during Phase 00 audit*

**Confidence:** HIGH
**Migration Risk:** LOW
**Reversible:** NO

---

### DEC-0004 — PostgreSQL + Drizzle ORM Is the Canonical Data Layer

**Date:** 2025-01-01
**Phase:** Pre-Phase
**Status:** ACCEPTED
**Author:** Integration Team

**Decision:**
PostgreSQL with Drizzle ORM is the canonical data layer. All domain data resides in PostgreSQL. Drizzle ORM is the exclusive ORM.

**Rationale:**
Repository 1 already uses this stack. Introducing alternative ORMs or databases would create maintenance burden and inconsistency.

**Consequences:**
- No alternative databases for core data
- All schema definitions in Drizzle
- Knowledge data imported into PostgreSQL
- Vector/embedding data via pgvector extension

**Dependencies:**
- Phase 01, Phase 02, Phase 06

**File(s):**
- `src/db/schema.ts`
- `src/db/index.ts`
- `drizzle.config.json`

**Confidence:** HIGH
**Migration Risk:** LOW
**Reversible:** NO

---

### DEC-0005 — Authentication Implementation Strategy (PENDING)

**Date:** 2025-07-16
**Phase:** Phase 00
**Status:** PROPOSED
**Author:** Integration Team

**Context:**
The Phase 00 audit reveals that Repository A has **zero** authentication infrastructure — no auth provider, no session management, no user table, no RBAC, no middleware. The master instruction states "Repository 1 authentication is authoritative," but since no auth exists in Repository 1, auth must be built rather than preserved. Repository B's auth implementation cannot be inspected because Repo B is not available in the sandbox.

**Options Considered:**
1. **NextAuth.js v5 (Auth.js)** — Most popular Next.js auth library. Supports multiple providers (OAuth, credentials, magic link). Built for App Router. Session management included. Pros: ecosystem, community, docs. Cons: opinionated, migration complexity if needs change.
2. **Lucia Auth** — Lightweight, flexible auth library. Full control over session management. Pros: flexibility, no vendor lock-in. Cons: more manual setup, smaller community.
3. **Custom implementation** — Build auth from scratch using jose/iron-session. Pros: full control. Cons: high effort, security risks if not done carefully.
4. **Adopt Repo B auth** — Use Repository B's auth implementation. Pros: may be well-tested. Cons: cannot inspect it, may not fit Next.js App Router.

**Decision:**
PENDING — Requires further evaluation. Recommend NextAuth.js v5 (Auth.js) as primary candidate due to ecosystem maturity, App Router support, and flexibility. Final decision in Phase 01.

**Rationale:**
Without Repo B access, we cannot evaluate option 4. Among options 1-3, NextAuth.js v5 provides the best balance of ecosystem support, security defaults, and flexibility for the required features (OAuth, credentials, RBAC, API tokens, mobile auth).

**Consequences:**
- Phase 01 will implement auth using the chosen library
- All subsequent phases will use this auth system
- Flutter mobile client (Phase 08) must authenticate via this system
- Decision is partially reversible if made early

**Dependencies:**
- Phase 01 (schema includes user tables)
- Phase 08 (mobile auth)
- All authenticated API endpoints

**File(s):**
- `src/db/schema.ts` (user tables)
- `src/app/api/auth/` (auth routes)
- `src/middleware.ts` (auth middleware)

**Confidence:** MEDIUM (pending Repo B inspection)
**Migration Risk:** MEDIUM
**Reversible:** PARTIAL (early switch is feasible, late switch is expensive)

---

### DEC-0006 — Repo A Is a Clean Starter (Audit Finding)

**Date:** 2025-07-16
**Phase:** Phase 00
**Status:** ACCEPTED
**Author:** Integration Team

**Context:**
The Phase 00 audit reveals that Repository A (`nihingobridgeupgrade`) is a clean Next.js + PostgreSQL + Drizzle starter template with zero domain implementation: no tables, no auth, no API routes (except /api/health), no domain types, no tests, no services.

**Decision:**
Acknowledge Repository A as a clean foundation rather than an established application. The master instruction's "preservation" principle applies to the **technology choices** (Next.js, PostgreSQL, Drizzle, Tailwind, TypeScript) and **project structure** (src/app, src/db), not to domain implementations that don't exist.

**Rationale:**
This finding significantly changes the integration approach:
- There are zero conflicts between repos (nothing to conflict with)
- There is zero data at risk (empty database)
- There are zero API contracts to honor (only /api/health)
- The "backward compatibility" constraint is vacuously satisfied
- Integration can proceed as green-field development on a pre-configured stack

**Consequences:**
- Phase 01 can build schema from DOMAIN_MODEL.md without migration concerns
- All phases can implement features directly without adapting existing code
- Risk levels for RISK-0001 through RISK-0004 are significantly reduced
- The primary value of Repo A is its technology stack configuration, not its code

**Dependencies:**
- All subsequent phases

**File(s):**
- All Repo A source files (see repo-a-inventory.csv)

**Confidence:** HIGH
**Migration Risk:** NONE
**Reversible:** N/A (observational finding)

---

### DEC-0007 — Conditional Phase 00 Gate Approval

**Date:** 2025-07-16
**Phase:** Phase 00
**Status:** ACCEPTED
**Author:** Integration Team

**Context:**
Phase 00 audit is complete for Repository A but Repository B is not available for inspection. The gate criteria require inventories of both repositories.

**Decision:**
Grant CONDITIONAL gate approval to proceed to Phase 01. Repository A audit is complete and reveals a clean starting position with no blockers. Repository B audit will be completed as a parallel workstream when access is available.

**Rationale:**
- Repo A is a clean slate — Phase 01 can proceed safely without Repo B inspection
- The DOMAIN_MODEL.md, API_CONTRACT.md, and TARGET_ARCHITECTURE.md provide sufficient specification for Phase 01
- Waiting for Repo B access would block all progress unnecessarily
- Any Repo B components integrated later can be adapted to the schema built in Phase 01

**Consequences:**
- Phase 01 proceeds using masterplan specifications as source of truth
- Repo B audit is documented as a parallel open workstream
- When Repo B becomes available, a supplementary audit will be conducted
- Phase 02+ may require re-evaluation if Repo B reveals unexpected patterns

**Dependencies:**
- RISK-0009 (Repo B unavailable) remains open

**File(s):**
- reports/audits/repo-audit.md
- reports/audits/decision-matrix-draft.md
- reports/audits/risk-analysis.md

**Confidence:** HIGH
**Migration Risk:** LOW
**Reversible:** YES (Repo B audit can trigger re-classification)

---

*Add new decisions below this line.*

