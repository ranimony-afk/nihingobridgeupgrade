# API CONFLICTS REPORT — Phase 00, Prompt 03

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit — API Forensic Audit
**Auditor:** Integration Team (Arena AI)
**Status:** COMPLETE
**Mode:** READ-ONLY — No modifications made

---

## 1. Conflict Summary

### Current State: ZERO CONFLICTS

| Conflict Type | Count | Explanation |
|---|---|---|
| Route path collisions | **0** | Repo A has 2 routes; neither is a domain route |
| HTTP method conflicts | **0** | Both existing routes are GET-only |
| Response format conflicts | **0** | No domain responses exist to conflict |
| Auth scheme conflicts | **0** | No auth exists in Repo A |
| Naming convention conflicts | **0** | No v1/v2 routes exist |
| Breaking changes | **0** | No consumers depend on non-existent routes |

---

## 2. Existing Route Conflict Analysis

### 2.1 /api/health — No Conflicts

| Dimension | Analysis |
|---|---|
| Path conflict with Repo B | **NONE** — `/api/health` is a standard infrastructure endpoint |
| Path conflict with planned routes | **NONE** — not in v1/v2/ai/admin namespace |
| Response format conflict | **NONE** — health check is exempt from API_CONTRACT.md format |
| Consumer conflict | **NONE** — consumed only by infrastructure tooling |

**Verdict: KEEP as-is. Zero risk.**

### 2.2 /api/masterplan — No Conflicts

| Dimension | Analysis |
|---|---|
| Path conflict with Repo B | **NONE** — unique control-tower route |
| Path conflict with planned routes | **NONE** — no planned `/api/masterplan` in API_CONTRACT.md |
| Response format conflict | **NONE** — non-production route |
| Consumer conflict | **NONE** — consumed only by control tower dashboard |

**Verdict: ARCHIVE when building real routes. Zero risk.**

---

## 3. Anticipated Cross-Repository Conflicts

When Repository B is inspected, the following conflict categories must be evaluated:

### 3.1 Route Path Collision Potential

**Risk Level: LOW-MEDIUM**

| Collision Scenario | Probability | Severity | Resolution |
|---|---|---|---|
| Repo B defines `/api/health` | LOW | LOW | Keep Repo A version; it's simpler |
| Repo B defines `/api/v1/*` routes | MEDIUM | MEDIUM | Evaluate; if real v1 routes exist, they become backward-compat contracts |
| Repo B defines `/api/dictionary/*` | HIGH | LOW | Repo A uses `/api/v2/dictionary/*`; no collision if versioned |
| Repo B defines `/api/kanji/*` | HIGH | LOW | Repo A uses `/api/v2/kanji/*`; no collision if versioned |
| Repo B defines `/api/auth/*` | HIGH | HIGH | Must evaluate; Repo A auth is authoritative (DEC-0003/0005) |
| Repo B defines `/api/ai/*` | MEDIUM | LOW | Evaluate; adapt to Repo A AI route contract |
| Repo B defines `/api/srs/*` | MEDIUM | LOW | Evaluate; Repo A uses `/api/v2/srs/*` |

### 3.2 Response Format Conflicts

**Risk Level: MEDIUM**

| Scenario | Impact | Resolution |
|---|---|---|
| Repo B uses `{ data, error }` format | LOW | Adapt to `{ success, data, error }` |
| Repo B uses `{ result, message }` format | LOW | Adapt to API_CONTRACT.md format |
| Repo B uses bare data (no wrapper) | MEDIUM | Wrap in API_CONTRACT.md format |
| Repo B uses GraphQL | HIGH | Must bridge or deprecate; Repo A is REST |
| Repo B uses tRPC | MEDIUM | Must bridge or deprecate; Repo A is REST |

### 3.3 Authentication Contract Conflicts

**Risk Level: HIGH**

This is the highest-risk conflict area because auth affects every authenticated endpoint.

| Scenario | Impact | Resolution |
|---|---|---|
| Repo B expects Bearer token | MEDIUM | Repo A auth must support Bearer tokens |
| Repo B expects session cookie | LOW | Standard for NextAuth.js |
| Repo B expects API key in header | MEDIUM | Must add API key auth support |
| Repo B expects custom auth header | HIGH | Must adapt or reject |
| Repo B uses different user ID format | HIGH | Must normalize user identification |

### 3.4 API Version Namespace Conflicts

**Risk Level: LOW**

| Scenario | Impact | Resolution |
|---|---|---|
| Repo B uses `/api/v1/*` | MEDIUM | These become the backward-compat contract |
| Repo B uses unversioned `/api/*` | LOW | Map to `/api/v2/*` in Repo A |
| Repo B uses `/api/v2/*` already | LOW | Compare contracts; merge or supersede |

---

## 4. Internal Conflict Analysis (Within Planned API)

### 4.1 Potential Self-Conflicts in API_CONTRACT.md

Review of API_CONTRACT.md reveals no internal conflicts:

| Check | Result |
|---|---|
| Duplicate route paths | NONE — all paths are unique |
| Inconsistent auth requirements | NONE — knowledge routes are Optional, user routes are Yes, admin routes are Admin |
| Missing CRUD operations | NOTED — some entities lack full CRUD (acceptable for MVP) |
| Inconsistent response formats | NONE — all follow standard format |
| Missing error codes | NONE — 7 standard codes defined |
| Overlapping query parameters | NONE — per-route parameters are distinct |

### 4.2 Noted API Design Gaps (Not Conflicts)

| Gap | Impact | Resolution |
|---|---|---|
| No `PATCH` methods planned | LOW | Use `PUT` for full updates; add `PATCH` if partial updates needed |
| No batch/bulk operations | MEDIUM | May need bulk card creation, bulk review submission |
| No WebSocket/SSE for AI streaming | MEDIUM | AI chat responses may benefit from streaming |
| No file upload endpoints | LOW | Media management may need multipart upload |
| No export/download endpoints | LOW | User data export may be needed (GDPR) |
| No webhook endpoints | LOW | May need for external service integration |

---

## 5. Backward Compatibility Analysis

### 5.1 Current Backward Compatibility Contracts

| Route | Contract | Breaking Change Possible? |
|---|---|---|
| `GET /api/health` | `{ ok: boolean }` + 200/500 status | **NO** — infrastructure contract |

That is the **complete** list. There are no other contracts to honor.

### 5.2 V1 Route Assessment

The master instruction states: "Existing `/api/v1/*` APIs must remain backward compatible."

**Audit Finding:** There are zero `/api/v1/*` routes in Repository A. This constraint is vacuously satisfied.

If Repository B is found to contain `/api/v1/*` routes, those would become the backward-compatibility baseline. Until Repo B is inspected, the v1 namespace is empty and available for use.

### 5.3 Breaking Change Risk Matrix

| Change Type | Risk | Affected Routes | Mitigation |
|---|---|---|---|
| Add new route | NONE | N/A | New routes don't break existing |
| Change /api/health response | LOW | Infrastructure tools | Don't change — KEEP |
| Remove /api/masterplan | NONE | Only control tower | ARCHIVE when appropriate |
| Add auth to existing routes | N/A | No routes need auth change | Build auth into new routes from start |
| Change response format | N/A | No domain routes exist | Design correctly from start |

---

## 6. Consumer Compatibility Analysis

### 6.1 Current Consumers

| Consumer | Routes Used | Platform | Status |
|---|---|---|---|
| Platform health probing | `GET /api/health` | Server infrastructure | Active |
| Control tower dashboard | `GET /api/masterplan` (via Server Components reading fs) | Web (this app) | Active (scaffolding) |

### 6.2 Planned Consumers

| Consumer | Routes | Platform | Phase | Compatibility Concern |
|---|---|---|---|---|
| Web app (Next.js) | All v2, AI, admin routes | Browser + Server Components | Phase 01+ | Direct access — no concern |
| Flutter mobile app | All v2, AI routes (not admin) | Flutter/Dio HTTP client | Phase 08 | CORS, auth token format, response format |
| Admin dashboard | Admin routes | Web | Phase 04+ | RBAC enforcement |
| ETL scripts | Admin ETL routes | CLI/scripts | Phase 02 | API key auth needed |
| External integrations | Potentially v2 knowledge routes | Third-party | Phase 09+ | API key auth, rate limiting |

### 6.3 Mobile-Specific Compatibility Concerns

When Flutter consumes the API (Phase 08):

| Concern | Risk | Mitigation |
|---|---|---|
| CORS headers | HIGH | Configure in `next.config.ts` or middleware |
| Auth token format | MEDIUM | Must support Bearer tokens (not just cookies) |
| Response size | LOW | Pagination limits prevent oversized responses |
| Offline-first patterns | MEDIUM | Conditional GET / ETag support may be needed |
| Upload from mobile | LOW | Multipart support in route handlers |
| Timeout handling | LOW | Mobile networks have variable latency |

---

## 7. Rate Limiting Conflict Analysis

### 7.1 Current State

No rate limiting exists. No rate limiting middleware or packages are installed.

### 7.2 Planned Rate Limits (from API_CONTRACT.md)

| Tier | Limit | Window | Conflict Risk |
|---|---|---|---|
| Public | 60 req/min | Per minute | NONE — not yet implemented |
| Authenticated | 300 req/min | Per minute | NONE — not yet implemented |
| AI | 30 req/min | Per minute | NONE — not yet implemented |
| Admin | 120 req/min | Per minute | NONE — not yet implemented |

### 7.3 Rate Limiting vs. Repo B

If Repo B has different rate limit expectations, the Repo A limits (from API_CONTRACT.md) take precedence. Mobile consumers must respect these limits.

---

## 8. Conclusion

The API conflicts report confirms an **absolutely clean state**:

1. **Zero route conflicts** — 2 routes exist, neither is a domain route
2. **Zero response format conflicts** — no domain responses to conflict
3. **Zero auth conflicts** — no auth exists
4. **Zero breaking changes possible** — only `/api/health` has a contract
5. **Zero v1 routes** — backward compatibility is trivially satisfied

The highest-risk area for **future** conflicts is **authentication** (when Repo B auth endpoints are inspected). All other potential conflicts are LOW-MEDIUM risk and can be resolved through consistent application of API_CONTRACT.md standards.

**Recommendation:** Proceed to Phase 01 with confidence. Establish API infrastructure (response helpers, error handling, auth middleware) before building domain routes.
