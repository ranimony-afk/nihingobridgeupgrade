# RISK REGISTER — NihongoBridge Integration

## Format

Each risk follows this template:

```
### RISK-NNNN — [Title]

**Date Identified:** YYYY-MM-DD
**Phase:** Phase NN
**Status:** OPEN | MITIGATED | CLOSED | ACCEPTED
**Severity:** LOW | MEDIUM | HIGH | CRITICAL
**Probability:** LOW | MEDIUM | HIGH
**Impact:** LOW | MEDIUM | HIGH | CRITICAL

**Description:**
[What the risk is]

**Trigger:**
[What would cause this risk to materialize]

**Impact Description:**
[What happens if the risk materializes]

**Mitigation:**
[How to prevent or reduce the risk]

**Contingency:**
[What to do if the risk materializes]

**Owner:**
[Who is responsible for monitoring this risk]

**Related Decisions:**
[Links to decision log entries]
```

---

## Active Risks

### RISK-0001 — Schema Conflicts Between Repositories

**Date Identified:** 2025-01-01
**Phase:** Phase 00, Phase 01
**Status:** OPEN
**Severity:** HIGH
**Probability:** HIGH
**Impact:** HIGH

**Description:**
Both repositories may define database schemas for overlapping entities (e.g., users, dictionary, lessons). Merging these schemas may create conflicts in column names, types, constraints, or relationships.

**Trigger:**
Attempting to apply Repository 2 schema definitions alongside Repository 1 schema.

**Impact Description:**
Data model inconsistencies, broken queries, data loss during migration, incompatible entity definitions.

**Mitigation:**
- Full schema audit during Phase 00
- Schema comparison report before any migration
- Non-destructive migration approach (additive only)
- Compatibility layers where needed

**Contingency:**
- Rollback to Repository 1 schema
- Manual schema reconciliation
- Phased migration with validation checkpoints

**Owner:** Integration Team
**Related Decisions:** DEC-0002, DEC-0004

---

### RISK-0002 — Authentication Incompatibility

**Date Identified:** 2025-01-01
**Phase:** Phase 00
**Status:** OPEN
**Severity:** CRITICAL
**Probability:** MEDIUM
**Impact:** CRITICAL

**Description:**
Repository 2 components may have hard-coded dependencies on a different authentication system. Integrating them may require significant adaptation.

**Trigger:**
Attempting to use Repository 2 components that expect different auth tokens, session formats, or user models.

**Impact Description:**
Security vulnerabilities, broken access control, user data exposure, session hijacking potential.

**Mitigation:**
- Auth audit during Phase 00
- Auth adapter pattern for integrated components
- Repository 1 auth is authoritative (DEC-0003)
- No Repository 2 auth code in production

**Contingency:**
- Reject Repository 2 components that cannot be adapted
- Create auth compatibility wrapper
- Manual security review of all integrated auth-dependent components

**Owner:** Integration Team
**Related Decisions:** DEC-0003

---

### RISK-0003 — Data Loss During ETL

**Date Identified:** 2025-01-01
**Phase:** Phase 02
**Status:** OPEN
**Severity:** HIGH
**Probability:** MEDIUM
**Impact:** HIGH

**Description:**
ETL pipelines importing knowledge data (dictionary, kanji, grammar) may overwrite, corrupt, or lose existing data if not carefully designed.

**Trigger:**
Running ETL import on a database with existing knowledge data without proper conflict resolution.

**Impact Description:**
Loss of manually curated data, broken references, duplicate entries, incorrect data.

**Mitigation:**
- Idempotent import pipelines
- Conflict resolution strategy (upsert with version comparison)
- Backup before every import
- Validation checks after import
- Provenance tracking on all imported data

**Contingency:**
- Restore from pre-import backup
- Re-run import with corrected pipeline
- Manual data reconciliation

**Owner:** Integration Team
**Related Decisions:** DEC-0002

---

### RISK-0004 — API Breaking Changes

**Date Identified:** 2025-01-01
**Phase:** All phases
**Status:** OPEN
**Severity:** HIGH
**Probability:** MEDIUM
**Impact:** HIGH

**Description:**
Integration work may inadvertently change existing API behavior, breaking clients that depend on V1 endpoints.

**Trigger:**
Modifying shared code (middleware, utilities, types) that affects V1 route behavior.

**Impact Description:**
Mobile app breaks, third-party integrations fail, user-facing features malfunction.

**Mitigation:**
- V1 API integration tests
- API response shape validation
- Separate V2 routes for new functionality
- V1 backward compatibility rule

**Contingency:**
- Revert API changes
- Hotfix V1 routes
- Version-specific API documentation

**Owner:** Integration Team
**Related Decisions:** DEC-0001

---

### RISK-0005 — Knowledge Data Licensing

**Date Identified:** 2025-01-01
**Phase:** Phase 02
**Status:** OPEN
**Severity:** MEDIUM
**Probability:** MEDIUM
**Impact:** MEDIUM

**Description:**
Knowledge data sources (JMdict, KANJIDIC2, Tatoeba, etc.) have specific licensing requirements. Failing to comply may create legal issues.

**Trigger:**
Using data without proper attribution or in violation of license terms.

**Impact Description:**
Legal liability, requirement to remove data, reputation damage.

**Mitigation:**
- Document license for every data source
- Include attribution in application
- Track provenance for all imported data
- Legal review of licenses before import

**Contingency:**
- Remove non-compliant data
- Replace with alternatively-licensed data
- Add missing attribution

**Owner:** Integration Team
**Related Decisions:** DEC-0004

---

### RISK-0006 — AI Cost Overrun

**Date Identified:** 2025-01-01
**Phase:** Phase 06
**Status:** OPEN
**Severity:** MEDIUM
**Probability:** HIGH
**Impact:** MEDIUM

**Description:**
AI tutor features using external API providers (OpenAI, Anthropic) may incur significant costs if not properly rate-limited and optimized.

**Trigger:**
High user engagement with AI features without cost controls.

**Impact Description:**
Unexpectedly high API bills, service degradation if limits are hit, potential service suspension.

**Mitigation:**
- Rate limiting on AI endpoints
- Token budgets per user/day
- Caching common responses
- RAG to reduce token usage
- Cost monitoring and alerts
- Usage analytics

**Contingency:**
- Reduce rate limits
- Implement stricter token budgets
- Temporarily disable high-cost features
- Switch to more cost-effective models

**Owner:** Integration Team

---

### RISK-0007 — Mobile Sync Data Corruption

**Date Identified:** 2025-01-01
**Phase:** Phase 08
**Status:** OPEN
**Severity:** HIGH
**Probability:** MEDIUM
**Impact:** HIGH

**Description:**
Offline-first mobile sync may create data conflicts between local and server state, especially for SRS reviews and progress data.

**Trigger:**
User completes reviews offline, then syncs when online with conflicting server state.

**Impact Description:**
Lost review data, incorrect SRS scheduling, progress regression, duplicate entries.

**Mitigation:**
- Last-write-wins with conflict detection
- Server-authoritative for computed state (SRS scheduling)
- Client-authoritative for review events (append-only)
- Conflict resolution UI for ambiguous cases
- Sync validation checks

**Contingency:**
- Manual conflict resolution
- Server-side state rebuild from review history
- Client cache reset with re-download

**Owner:** Integration Team

---

### RISK-0008 — Performance Degradation with Knowledge Data

**Date Identified:** 2025-01-01
**Phase:** Phase 02, Phase 03
**Status:** OPEN
**Severity:** MEDIUM
**Probability:** HIGH
**Impact:** MEDIUM

**Description:**
Importing millions of dictionary entries, kanji, and sentences may degrade database query performance if indexes are not properly designed.

**Trigger:**
Full knowledge data import without proper indexing strategy.

**Impact Description:**
Slow search, slow page loads, timeout errors, poor user experience.

**Mitigation:**
- Index strategy defined before import
- Query performance benchmarks
- Progressive loading and pagination
- Search result caching
- Database monitoring

**Contingency:**
- Add missing indexes
- Implement query caching layer
- Optimize slow queries
- Consider read replicas for search workload

**Owner:** Integration Team

---

### RISK-0009 — Repository B Unavailable for Inspection

**Date Identified:** 2025-07-16
**Phase:** Phase 00
**Status:** OPEN
**Severity:** HIGH
**Probability:** MEDIUM
**Impact:** CRITICAL

**Description:**
Repository B (`Knowledge-base-NihongoBridge`) is not present in the current sandbox environment and cannot be directly inspected. This prevents file-level inventory, schema comparison, auth analysis, dependency comparison, and code quality assessment.

**Trigger:**
Attempting to access or read files from Repository B in the sandbox.

**Impact Description:**
Cannot perform complete Phase 00 audit. Integration decisions may be made without full information about Repo B components. May require rework when Repo B becomes available.

**Mitigation:**
- Proceed with Phase 01 using DOMAIN_MODEL.md and masterplan specs as source of truth
- Document all Repo B assumptions explicitly
- Design for adaptability (modular architecture that can accommodate Repo B patterns)
- Request Repo B access as a parallel workstream
- Conduct supplementary audit when Repo B is available

**Contingency:**
- Build all features from specifications, adapt Repo B components when available
- Maintain a re-classification checklist for when Repo B is inspected
- Accept that some rework may be needed

**Owner:** Integration Team
**Related Decisions:** DEC-0007

---

### RISK-0010 — Auth Implementation Without Repo B Reference

**Date Identified:** 2025-07-16
**Phase:** Phase 00 / Phase 01
**Status:** OPEN
**Severity:** HIGH
**Probability:** MEDIUM
**Impact:** HIGH

**Description:**
Auth must be implemented in Phase 01 to support authenticated API endpoints and user management. However, Repo B's auth implementation cannot be inspected, creating a risk that the chosen auth strategy may conflict with Repo B patterns when integration happens.

**Trigger:**
Implementing auth in Phase 01 and later discovering Repo B uses a fundamentally different approach.

**Impact Description:**
Potential rework of auth layer, session management, or user model. Mobile (Flutter) auth integration may need significant adaptation.

**Mitigation:**
- Choose a widely-adopted, flexible auth library (NextAuth.js / Auth.js recommended)
- Design auth interface to be modular and replaceable
- Support multiple auth strategies (OAuth, credentials, API keys)
- Document auth interface contracts clearly

**Contingency:**
- Auth libraries can be swapped if decision is made early (within Phase 01-02)
- Late-stage auth changes are expensive and should be avoided
- If Repo B auth is superior, adapt its patterns to the chosen framework

**Owner:** Integration Team
**Related Decisions:** DEC-0005

---

### RISK-0011 — Control Tower Code Mixed with Application Code

**Date Identified:** 2025-07-16
**Phase:** Phase 00
**Status:** OPEN
**Severity:** MEDIUM
**Probability:** MEDIUM
**Impact:** MEDIUM

**Description:**
The integration control tower dashboard (Phase 00 deliverable) occupies the same `src/app/` directory where production application code will be built. Control tower pages (page.tsx, docs/, api/masterplan/) may be confused with real application code or cause routing conflicts.

**Trigger:**
Building real application pages that conflict with control tower routes (e.g., a real /docs page).

**Impact Description:**
Route conflicts, confusion about what is production code, potential inclusion of control tower code in production builds.

**Mitigation:**
- Control tower files are explicitly classified as ARCHIVE in the decision matrix
- When building real pages, replace control tower pages explicitly
- Control tower API route (/api/masterplan) does not conflict with any planned API route
- Control tower pages are clearly identifiable by their content

**Contingency:**
- Delete control tower files when no longer needed
- Move control tower to a separate route prefix if conflicts arise

**Owner:** Integration Team

---

*Add new risks below this line.*

