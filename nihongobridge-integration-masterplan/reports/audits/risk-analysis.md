# RISK ANALYSIS — Phase 00 Audit

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit
**Status:** COMPLETE (with caveats for Repo B access)

---

## 1. Risk Assessment Methodology

Each risk is evaluated on three dimensions:

- **Probability** (LOW / MEDIUM / HIGH) — How likely is this risk to materialize?
- **Impact** (LOW / MEDIUM / HIGH / CRITICAL) — What is the damage if it materializes?
- **Severity** = Probability × Impact — Overall risk severity rating

Additionally, each risk includes:
- **Detection** — How easily can we detect this risk before it causes damage?
- **Mitigation Cost** — How expensive is the mitigation strategy?
- **Residual Risk** — What risk remains after mitigation?

---

## 2. Risk Heat Map

```
              │ LOW Impact  │ MED Impact  │ HIGH Impact │ CRIT Impact │
──────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
HIGH Prob     │             │ RISK-0006   │             │             │
              │             │ RISK-0008   │             │             │
──────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
MEDIUM Prob   │             │ RISK-0005   │ RISK-0007   │ RISK-0009   │
              │             │ RISK-0011   │ RISK-0010   │             │
──────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
LOW Prob      │ RISK-0001r  │ RISK-0003r  │ RISK-0004r  │ RISK-0002r  │
              │             │             │             │             │
──────────────┴─────────────┴─────────────┴─────────────┴─────────────┘

Note: "r" suffix = revised severity from original RISK_REGISTER.md based on audit findings.
```

---

## 3. Revised Risk Register

### RISK-0001r — Schema Conflicts Between Repositories

**Original Severity:** HIGH → **Revised Severity: LOW**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | LOW | Repo A has zero tables — no schema to conflict with |
| Impact | LOW | Even if Repo B has conflicting schema, we start clean |
| Detection | EASY | Schema comparison is straightforward |
| Mitigation Cost | LOW | Build from DOMAIN_MODEL.md on clean database |

**Revision Rationale:** The original risk assumed both repos had established schemas that might conflict. The audit reveals Repo A has an empty database with zero tables. There is literally nothing to conflict with.

**Residual Risk:** If Repo B has a well-established schema with data already loaded, there may be pressure to adopt it directly rather than building from DOMAIN_MODEL.md. Resist this — build the canonical schema in Repo A per the domain model, then import data through ETL.

---

### RISK-0002r — Authentication Incompatibility

**Original Severity:** CRITICAL → **Revised Severity: MEDIUM**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | LOW | Repo A has no auth — nothing to be incompatible with |
| Impact | CRITICAL | Auth mistakes create security vulnerabilities |
| Detection | MEDIUM | Auth bugs may not be immediately visible |
| Mitigation Cost | MEDIUM | Auth implementation requires careful design |

**Revision Rationale:** The original risk assumed Repo A had auth that Repo B might conflict with. Since Repo A has no auth at all, the risk shifts from "incompatibility" to "implementation quality." The CRITICAL impact rating is preserved because auth mistakes are always high-impact.

**New Context:** Since Repo A has no auth, we need DEC-0005 to decide the auth strategy. Options:
1. Build fresh with NextAuth.js v5 / Auth.js
2. Build fresh with Lucia Auth
3. Evaluate and potentially adopt Repo B auth (if compatible with Next.js App Router)
4. Custom implementation

**Residual Risk:** Whichever auth is chosen, it must support: sessions, RBAC (user/admin/editor), OAuth providers, Flutter mobile auth tokens, and API key auth for programmatic access.

---

### RISK-0003r — Data Loss During ETL

**Original Severity:** HIGH → **Revised Severity: LOW**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | LOW | Database is empty — no data to lose |
| Impact | MEDIUM | First-time import has no existing data at risk |
| Detection | EASY | Validate counts and integrity after import |
| Mitigation Cost | LOW | Standard backup before import |

**Revision Rationale:** With an empty database, the first ETL run cannot cause data loss. This risk becomes relevant only after the first successful import, when subsequent imports must be idempotent.

**Residual Risk:** After Phase 02 imports data, this risk reverts to MEDIUM-HIGH. Subsequent ETL runs must:
- Be idempotent (upsert, not insert)
- Track provenance
- Validate before committing
- Allow rollback

---

### RISK-0004r — API Breaking Changes

**Original Severity:** HIGH → **Revised Severity: LOW**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | LOW | Only /api/health exists — minimal surface |
| Impact | LOW | No external consumers of non-existent APIs |
| Detection | EASY | /api/health is trivial to test |
| Mitigation Cost | NONE | Preserve /api/health response shape |

**Revision Rationale:** The original risk assumed established v1 API routes that clients depend on. With only /api/health, the backward compatibility constraint is trivially satisfied. All new API routes can be designed fresh.

**Residual Risk:** Once API routes are created in Phase 01+, this risk re-emerges for all future phases. Establish API versioning and contract testing early.

---

### RISK-0005 — Knowledge Data Licensing (Unchanged)

**Severity: MEDIUM**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | MEDIUM | Common data sources have clear licenses, but must verify |
| Impact | MEDIUM | Non-compliance requires data removal |
| Detection | EASY | License terms are published |
| Mitigation Cost | LOW | Document and attribute correctly |

**Relevant Licenses (Expected):**
| Data Source | License | Attribution Required |
|---|---|---|
| JMdict | Creative Commons BY-SA 4.0 | Yes — EDRDG |
| KANJIDIC2 | Creative Commons BY-SA 4.0 | Yes — EDRDG |
| Tatoeba | Creative Commons BY 2.0 | Yes — per sentence |
| RADKFILE | Custom (Jim Breen) | Yes |
| KanjiVG | Creative Commons BY-SA 3.0 | Yes (if stroke data used) |

**Action:** Verify actual data sources used in Repo B ETL during Phase 02. Ensure attribution is displayed in the application.

---

### RISK-0006 — AI Cost Overrun (Unchanged)

**Severity: MEDIUM**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | HIGH | AI features encourage heavy usage |
| Impact | MEDIUM | Unexpected bills, potential service disruption |
| Detection | MEDIUM | Requires cost monitoring |
| Mitigation Cost | LOW | Rate limiting and token budgets |

**Unchanged from original.** This risk applies at Phase 06 and beyond.

---

### RISK-0007 — Mobile Sync Data Corruption (Unchanged)

**Severity: HIGH**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | MEDIUM | Offline-first sync is inherently complex |
| Impact | HIGH | Lost reviews, incorrect SRS state, user frustration |
| Detection | MEDIUM | Sync conflicts may not be immediately visible |
| Mitigation Cost | HIGH | Robust conflict resolution is complex |

**Unchanged from original.** This risk applies at Phase 08.

---

### RISK-0008 — Performance Degradation with Knowledge Data (Unchanged)

**Severity: MEDIUM**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | HIGH | Millions of dictionary entries without indexing = slow |
| Impact | MEDIUM | Slow search, poor UX, timeout errors |
| Detection | EASY | Performance testing reveals issues |
| Mitigation Cost | MEDIUM | Index strategy + query optimization |

**Unchanged from original.** This risk applies at Phase 02-03.

---

## 4. New Risks Identified During Audit

### RISK-0009 — Repository B Unavailable for Inspection

**Severity: HIGH**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | MEDIUM | Repo B is not in the sandbox environment |
| Impact | CRITICAL | Cannot perform component-level inspection or diff |
| Detection | EASY | Already detected |
| Mitigation Cost | MEDIUM | Request access or file listing |

**Description:** Repository B (`Knowledge-base-NihongoBridge`) is not present in the current sandbox environment. This prevents:
- Direct file-by-file inspection
- Schema comparison
- Auth implementation analysis
- Dependency comparison
- Code quality assessment
- Test coverage evaluation

**Mitigation:**
1. Request Repo B to be added to the sandbox environment
2. OR request a file listing / tree output from Repo B
3. OR request specific file contents from Repo B as needed per phase
4. Proceed with Phase 01 using DOMAIN_MODEL.md as the schema source (safe — empty DB)

**Contingency:** If Repo B remains unavailable:
- Build all features from specifications in the masterplan documents
- When Repo B becomes available, perform a detailed comparison audit
- Selectively integrate verified Repo B components at that time

---

### RISK-0010 — Auth Implementation Without Reference

**Severity: HIGH**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | MEDIUM | Must choose auth strategy without seeing Repo B auth |
| Impact | HIGH | Wrong choice creates migration burden later |
| Detection | MEDIUM | May not know if choice is wrong until Repo B is inspected |
| Mitigation Cost | MEDIUM | Choose widely-compatible auth library |

**Description:** Auth must be implemented in Phase 01, but without seeing Repo B's auth implementation, there's a risk of choosing an incompatible approach that later requires rework when Repo B components need to authenticate.

**Mitigation:**
- Choose a widely-adopted, flexible auth library (NextAuth.js / Auth.js)
- Design auth to support multiple providers (credentials, OAuth, API keys)
- Ensure auth is modular and replaceable
- Document the auth interface so Repo B components can be adapted

---

### RISK-0011 — Control Tower Code Confused with Application Code

**Severity: MEDIUM**

| Dimension | Value | Rationale |
|---|---|---|
| Probability | MEDIUM | Dashboard UI is in src/app/ alongside real app code |
| Impact | MEDIUM | Control tower code may interfere with app development |
| Detection | EASY | Files are clearly identifiable |
| Mitigation Cost | LOW | Archive or separate when building real app |

**Description:** The current sandbox contains a control tower dashboard (Phase 0 deliverable) in the same src/app/ directory where real application code will go. This creates a risk of confusion about what is "real" application code vs. scaffolding.

**Mitigation:**
- Clearly label control tower files (already done via ARCHIVE classification)
- When building real app pages, replace control tower pages explicitly
- Document which files are control tower vs. application

---

## 5. Risk Disposition Summary

### Risks That Decreased (Due to Blank Slate)

| Risk | Original | Revised | Reason |
|---|---|---|---|
| RISK-0001 | HIGH | **LOW** | No schema to conflict with |
| RISK-0002 | CRITICAL | **MEDIUM** | No auth to be incompatible with |
| RISK-0003 | HIGH | **LOW** | No data to lose |
| RISK-0004 | HIGH | **LOW** | No API routes to break |

### Risks That Remained Unchanged

| Risk | Severity | Reason |
|---|---|---|
| RISK-0005 | MEDIUM | Licensing is independent of repo state |
| RISK-0006 | MEDIUM | AI costs are independent of repo state |
| RISK-0007 | HIGH | Mobile sync complexity is independent |
| RISK-0008 | MEDIUM | Performance concerns remain for knowledge data |

### New Risks Identified

| Risk | Severity | Reason |
|---|---|---|
| RISK-0009 | HIGH | Repo B not available for inspection |
| RISK-0010 | HIGH | Auth decision without Repo B reference |
| RISK-0011 | MEDIUM | Control tower code mixed with app code |

---

## 6. Risk-Adjusted Phase Recommendations

Based on the revised risk profile, here are the recommended priorities:

### Phase 01 — Safe to Proceed
- **Risk Level: LOW** — Empty database, no conflicts
- **Recommendation:** Build schema from DOMAIN_MODEL.md
- **Blocker:** None
- **Decision Required:** DEC-0005 (auth strategy), DEC-0006 (test framework)

### Phase 02 — Safe to Proceed (After Phase 01)
- **Risk Level: LOW-MEDIUM** — First-time import, no existing data
- **Recommendation:** Build ETL from specification; adapt Repo B ETL later if available
- **Key Concern:** Data source licensing (RISK-0005)

### Phase 03 — Safe to Proceed (After Phase 02)
- **Risk Level: MEDIUM** — Performance concerns (RISK-0008)
- **Recommendation:** Design indexes before import
- **Key Concern:** Query performance at scale

### Phase 04-07 — Manageable Risk
- **Risk Level: MEDIUM** — Standard feature development
- **Key Concern:** Growing codebase complexity

### Phase 08 — Elevated Risk
- **Risk Level: HIGH** — Mobile sync complexity (RISK-0007)
- **Recommendation:** Delay until API is stable
- **Key Concern:** Sync conflict resolution

### Phase 09 — Standard Risk
- **Risk Level: MEDIUM** — Production readiness checklist
- **Key Concern:** Security hardening, backup verification

---

## 7. Open Questions

1. When will Repository B be available for direct inspection?
2. Does Repository B use Drizzle ORM, Prisma, or something else for its schema?
3. What auth provider does Repository B use?
4. What is the total data volume expected (dictionary entries, kanji, etc.)?
5. Are there any existing users or production data that must be migrated?
6. What is the target deployment platform (Vercel, Docker, VPS)?
7. What AI provider API keys are available in the environment?
8. Is there a budget constraint for AI API costs?
9. What is the target audience size (affects performance requirements)?
10. Are there any regulatory requirements (GDPR, data residency)?

---

## 8. Conclusion

The audit reveals a fundamentally **low-risk starting position**. Repository A is a clean, modern Next.js + PostgreSQL + Drizzle starter with zero domain implementation. This means:

1. **No conflicts** — Nothing to reconcile between repos
2. **No data at risk** — Empty database
3. **No API contracts** — Free to design fresh
4. **No auth to break** — Free to choose best auth solution
5. **Modern stack** — All dependencies are current

The primary risk is the unavailability of Repository B for inspection (RISK-0009), but this is mitigated by the comprehensive specifications in the masterplan documents (DOMAIN_MODEL.md, API_CONTRACT.md, TARGET_ARCHITECTURE.md) which provide sufficient detail to begin implementation.

**Recommendation: Proceed to Phase 01 with confidence.**
