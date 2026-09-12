# API INVENTORY — Phase 00, Prompt 03

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit — API Forensic Audit
**Auditor:** Integration Team (Arena AI)
**Status:** COMPLETE
**Mode:** READ-ONLY — No modifications made

---

## 1. Executive Summary

A complete forensic audit of all API routes, server actions, middleware, external service calls, and server-side data-fetching patterns was performed across the entire codebase.

**Repository A contains exactly 2 API route handlers.** Both are GET-only. Neither requires authentication. Neither reads from or writes to any application table. There are zero server actions, zero middleware, zero external API calls, zero v1 routes, and zero domain endpoints.

There are zero API route conflicts because Repository A's API surface is trivially minimal.

---

## 2. Audit Methodology

### 2.1 Artifacts Inspected

| Artifact Type | Search Method | Files Found |
|---|---|---|
| Route handlers (`route.ts`) | `glob **/route.{ts,tsx,js}` | 2 |
| Server actions (`"use server"`) | `grep "use server"` across `src/` | 0 |
| Middleware (`middleware.ts`) | `glob **/middleware.{ts,tsx,js}` at root + `src/` | 0 |
| HTTP method exports | `grep export.*(GET\|POST\|PUT\|...)` | 2 (both GET) |
| `fetch()` calls | `grep fetch\(` across `src/` | 0 |
| External API imports (axios, etc.) | `grep axios\|got\|ky\|node-fetch` | 0 |
| Auth helpers (headers, cookies) | `grep headers\(\)\|cookies\(\)` | 0 |
| Environment variables | `grep process\.env\.` | 2 (`DATABASE_URL`, `NODE_ENV`) |
| Next.js route manifest | `.next/app-path-routes-manifest.json` | 2 API routes registered |
| Next.js routes manifest | `.next/routes-manifest.json` | 0 headers, 0 rewrites |

### 2.2 Server-Side Data Fetching (Server Components)

| Page | Data Source | Query | Purpose |
|---|---|---|---|
| `src/app/page.tsx` | PostgreSQL via Drizzle | `sql\`select 1\`` | Health verification |
| `src/app/page.tsx` | File system (`fs`) | `readdirSync`, `accessSync` | Count masterplan files |
| `src/app/docs/[slug]/page.tsx` | File system (`fs`) | `readFileSync` | Read markdown documents |
| `src/app/docs/page.tsx` | None (static data) | — | Hardcoded doc list |

None of these Server Components access external APIs, application database tables, or authenticated user data.

---

## 3. Repository A — Complete Route Inventory

### ROUTE-001: GET /api/health

| Property | Value |
|---|---|
| **HTTP Method** | GET |
| **Route** | `/api/health` |
| **Source File** | `src/app/api/health/route.ts` |
| **Lines** | 14 |
| **Category** | Infrastructure |
| **Authentication** | None required |
| **Authorization** | None required |
| **Rate Limiting** | None implemented |
| **Request Schema** | None (no query params, no body) |
| **Response Schema (200)** | `{ ok: true }` |
| **Response Schema (500)** | `{ ok: false }` |
| **Database Tables** | None (executes `SELECT 1` only) |
| **External Services** | None |
| **Frontend Consumers** | None (used by infrastructure/monitoring) |
| **Mobile Consumers** | None |
| **Server Actions** | None |
| **Middleware** | None |
| **Caching** | `force-dynamic` (no caching) |
| **Duplicate** | No |
| **Breaking-Change Risk** | **NONE** — must be preserved exactly as-is |
| **Classification** | **KEEP** |

**Full Source:**
```typescript
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
```

**Notes:**
- Standard infrastructure health check
- Tests database connectivity only
- Used by platform build/deploy systems for readiness probing
- Response shape `{ ok: boolean }` is a platform contract — do not change
- Does NOT follow API_CONTRACT.md `{ success, data }` format — acceptable for health check

---

### ROUTE-002: GET /api/masterplan

| Property | Value |
|---|---|
| **HTTP Method** | GET |
| **Route** | `/api/masterplan` |
| **Source File** | `src/app/api/masterplan/route.ts` |
| **Lines** | 96 |
| **Category** | Control Tower (non-production) |
| **Authentication** | None required |
| **Authorization** | None required |
| **Rate Limiting** | None implemented |
| **Request Schema** | None |
| **Response Schema (200)** | `{ success: true, data: { tree, docs, phases, checklistCount, reports } }` |
| **Database Tables** | None |
| **External Services** | None |
| **Frontend Consumers** | Control tower dashboard (development only) |
| **Mobile Consumers** | None |
| **Duplicate** | No |
| **Breaking-Change Risk** | **NONE** — non-production scaffolding |
| **Classification** | **ARCHIVE** |

**Behavior:**
- Reads the `nihongobridge-integration-masterplan/` directory tree via `fs`
- Reads all 7 core markdown documents
- Counts files in prompt phase directories
- Counts checklists and reports
- Returns aggregated metadata

**Notes:**
- This is control tower scaffolding, NOT production API code
- Uses `NextResponse.json()` (consistent with control tower pattern)
- Reads file system — not appropriate for production deployment
- Will be archived when real API routes are built
- Does not conflict with any planned production route path

---

## 4. Missing API Infrastructure

### 4.1 Absent Infrastructure Components

| Component | Status | Impact | Phase |
|---|---|---|---|
| Authentication middleware | **MISSING** | No routes can be auth-gated | Phase 01 |
| Authorization middleware | **MISSING** | No RBAC enforcement | Phase 01 |
| Rate limiting | **MISSING** | No abuse protection | Phase 01 or 09 |
| Request validation | **MISSING** | No input sanitization | Phase 01 |
| Error handling wrapper | **MISSING** | No consistent error format | Phase 01 |
| CORS configuration | **MISSING** | Mobile client may be blocked | Phase 01 |
| API versioning structure | **MISSING** | No `/api/v1/` or `/api/v2/` dirs | Phase 01+ |
| Response helpers | **MISSING** | No `{ success, data, meta }` helpers | Phase 01 |
| Logging middleware | **MISSING** | No request/response logging | Phase 09 |
| API documentation (OpenAPI) | **MISSING** | No machine-readable API spec | Phase 09 |

### 4.2 Absent Server Actions

Zero server actions exist. No `"use server"` directive found in any file.

### 4.3 Absent Middleware

No `middleware.ts` file exists at the project root or in `src/`. Next.js middleware (for auth checks, redirects, headers) must be created in Phase 01.

---

## 5. Planned Routes vs. Existing Routes

### 5.1 Gap Analysis (API_CONTRACT.md vs. Reality)

| Category | Planned (API_CONTRACT.md) | Existing | Gap |
|---|---|---|---|
| Health | 1 route | 1 route | **0 — Complete** |
| V1 (Legacy) | Unknown (to be audited) | 0 routes | **0 — None exist** |
| V2 Dictionary | 6 routes | 0 routes | **6 routes to build** |
| V2 Kanji | 6 routes | 0 routes | **6 routes to build** |
| V2 Grammar | 4 routes | 0 routes | **4 routes to build** |
| V2 Radicals | 3 routes | 0 routes | **3 routes to build** |
| V2 Courses | 4 routes | 0 routes | **4 routes to build** |
| V2 Modules | 2 routes | 0 routes | **2 routes to build** |
| V2 Lessons | 3 routes | 0 routes | **3 routes to build** |
| V2 Progress | 3 routes | 0 routes | **3 routes to build** |
| V2 SRS | 10 routes | 0 routes | **10 routes to build** |
| V2 Gamification | 5 routes | 0 routes | **5 routes to build** |
| AI | 7 routes | 0 routes | **7 routes to build** |
| Admin | 6 routes | 0 routes | **6 routes to build** |
| Auth | Not yet specified | 0 routes | **TBD (DEC-0005)** |
| **TOTAL** | **60+ routes** | **1 route** | **59+ routes to build** |

### 5.2 Routes by Implementation Phase

| Phase | Routes to Create | Methods | Auth Required |
|---|---|---|---|
| Phase 01 | Auth routes (TBD: 3–5 routes) | GET, POST | Mixed |
| Phase 02 | None (ETL is backend scripts) | — | — |
| Phase 03 | Dictionary (6), Kanji (6), Grammar (4), Radicals (3) | GET | Optional |
| Phase 04 | Courses (4), Modules (2), Lessons (3), Progress (3) | GET, POST | Yes |
| Phase 05 | SRS (10) | GET, POST, PUT, DELETE | Yes |
| Phase 06 | AI (7) | GET, POST | Yes |
| Phase 07 | Gamification (5) | GET | Yes |
| Phase 08 | None (Flutter consumes existing routes) | — | — |
| Phase 09 | Admin (6) | GET, POST | Admin |

### 5.3 HTTP Methods Distribution (Planned)

| Method | Count | Notes |
|---|---|---|
| GET | ~45 | Majority — read operations |
| POST | ~12 | Create, submit, action operations |
| PUT | ~2 | Update operations (SRS deck) |
| DELETE | ~1 | Delete operations (SRS deck) |
| PATCH | 0 | Not currently planned |
| HEAD | 0 | Not currently planned |
| OPTIONS | 0 | Handled by Next.js/CORS config |

---

## 6. Repository B — API Expectations

### 6.1 Access Status

Repository B is not available for direct inspection. Expected API patterns are derived from the master instruction.

### 6.2 Expected Repo B Endpoints (Speculative)

Based on the master instruction's description of Repository B capabilities:

| Category | Expected Endpoints | Confidence | Integration Action |
|---|---|---|---|
| Dictionary search | GET endpoints for word lookup | HIGH | EVALUATE → Map to V2 dictionary routes |
| Kanji lookup | GET endpoints for kanji data | HIGH | EVALUATE → Map to V2 kanji routes |
| Grammar reference | GET endpoints for grammar | MEDIUM | EVALUATE → Map to V2 grammar routes |
| Learning/courses | CRUD endpoints for courses, lessons | MEDIUM | EVALUATE → Map to V2 learning routes |
| SRS/review | Endpoints for deck, card, review management | MEDIUM | EVALUATE → Map to V2 SRS routes |
| AI/chat | POST endpoints for AI tutor | MEDIUM | EVALUATE → Map to AI routes |
| Auth | Auth endpoints (login, register, session) | HIGH | DEPRECATE — use Repo A auth (DEC-0005) |
| Admin | Admin CRUD endpoints | LOW | EVALUATE → Map to admin routes |

### 6.3 Key Unknowns

1. Does Repo B use REST, GraphQL, tRPC, or another pattern?
2. What response format does Repo B use?
3. Does Repo B have API versioning?
4. What auth tokens/headers does Repo B expect?
5. Does Repo B have rate limiting?
6. Are Repo B endpoints documented (OpenAPI/Swagger)?

---

## 7. Response Format Analysis

### 7.1 Current Response Formats

| Route | Format | Matches API_CONTRACT.md? |
|---|---|---|
| `GET /api/health` | `{ ok: boolean }` | **NO** — health check is exempt |
| `GET /api/masterplan` | `{ success: true, data: {...} }` | **PARTIAL** — uses `success` + `data`, no `meta` |

### 7.2 API_CONTRACT.md Standard

```json
// Success
{ "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 150, "totalPages": 8 } }

// Error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": { ... } } }
```

### 7.3 Recommendation

Create response helper utilities in Phase 01:
```
src/lib/api-response.ts
  ├── successResponse(data, meta?)
  ├── errorResponse(code, message, details?, status?)
  ├── paginatedResponse(data, page, pageSize, total)
  └── Standard error codes enum
```

---

## 8. Security Analysis

### 8.1 Current Security Posture

| Control | Status | Risk |
|---|---|---|
| Authentication | **ABSENT** | CRITICAL — no routes are auth-protected |
| Authorization (RBAC) | **ABSENT** | HIGH — no role-based access control |
| Input validation | **ABSENT** | HIGH — no request body/param validation |
| Rate limiting | **ABSENT** | MEDIUM — no abuse protection |
| CORS | **DEFAULT** | MEDIUM — Next.js defaults; may block mobile |
| CSRF | **DEFAULT** | LOW — Next.js has built-in SameSite cookies |
| Security headers | **DEFAULT** | MEDIUM — no custom security headers |
| API keys | **ABSENT** | HIGH — no programmatic access support |
| Request logging | **ABSENT** | MEDIUM — no audit trail |

### 8.2 Existing Routes Security Assessment

| Route | Auth Risk | Data Risk | Injection Risk |
|---|---|---|---|
| `GET /api/health` | NONE (public is correct) | NONE (no user data) | NONE (no input) |
| `GET /api/masterplan` | LOW (reads masterplan files, no secrets) | LOW (public docs) | NONE (no input) |

### 8.3 Note on /api/masterplan Security

`GET /api/masterplan` reads files from disk and returns their content. In the current state this is safe because:
- It only reads the `nihongobridge-integration-masterplan/` directory (hardcoded path)
- No user input influences the file paths read
- The masterplan files contain no secrets
- The route will be archived before production

However, this pattern (reading arbitrary files via API) should NOT be replicated in production routes.

---

## 9. External Service Dependencies

### 9.1 Current External Dependencies

**NONE.** No API route makes calls to any external service. No `fetch()`, `axios`, or HTTP client calls exist in any route handler or server component.

### 9.2 Planned External Dependencies

| Service | Phase | Routes | Env Variable |
|---|---|---|---|
| AI Provider (OpenAI/Anthropic) | Phase 06 | `/api/ai/*` | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| OAuth Providers | Phase 01 | `/api/auth/*` | Provider-specific keys |
| File/Media Storage | Phase 04+ | `/api/admin/media` | Storage credentials |

---

## 10. API Directory Structure (Planned)

Based on API_CONTRACT.md, the target directory structure for API routes:

```
src/app/api/
├── health/
│   └── route.ts                    ✅ EXISTS (KEEP)
├── auth/                           ❌ TO CREATE (Phase 01)
│   ├── [...nextauth]/route.ts      (if NextAuth.js)
│   ├── register/route.ts
│   └── me/route.ts
├── v2/
│   ├── dictionary/
│   │   ├── search/route.ts         ❌ TO CREATE (Phase 03)
│   │   └── entries/
│   │       └── [id]/
│   │           ├── route.ts        ❌ TO CREATE (Phase 03)
│   │           ├── senses/route.ts
│   │           ├── readings/route.ts
│   │           ├── kanji/route.ts
│   │           └── examples/route.ts
│   ├── kanji/
│   │   ├── search/route.ts         ❌ TO CREATE (Phase 03)
│   │   ├── [character]/route.ts
│   │   ├── by-radical/[radicalId]/route.ts
│   │   ├── by-grade/[grade]/route.ts
│   │   └── by-jlpt/[level]/route.ts
│   ├── grammar/
│   │   ├── search/route.ts         ❌ TO CREATE (Phase 03)
│   │   ├── [id]/route.ts
│   │   └── by-jlpt/[level]/route.ts
│   ├── radicals/
│   │   ├── route.ts                ❌ TO CREATE (Phase 03)
│   │   └── [id]/route.ts
│   ├── courses/
│   │   ├── route.ts                ❌ TO CREATE (Phase 04)
│   │   └── [id]/
│   │       ├── route.ts
│   │       ├── modules/route.ts
│   │       └── enroll/route.ts
│   ├── modules/[id]/
│   │   ├── route.ts                ❌ TO CREATE (Phase 04)
│   │   └── lessons/route.ts
│   ├── lessons/[id]/
│   │   ├── route.ts                ❌ TO CREATE (Phase 04)
│   │   ├── complete/route.ts
│   │   └── submit/route.ts
│   ├── progress/
│   │   ├── route.ts                ❌ TO CREATE (Phase 04)
│   │   ├── stats/route.ts
│   │   └── courses/[courseId]/route.ts
│   ├── srs/
│   │   ├── decks/
│   │   │   ├── route.ts            ❌ TO CREATE (Phase 05)
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       ├── cards/route.ts
│   │   │       └── due/route.ts
│   │   ├── review/route.ts
│   │   └── stats/route.ts
│   └── gamification/
│       ├── xp/route.ts             ❌ TO CREATE (Phase 07)
│       ├── streak/route.ts
│       ├── achievements/
│       │   ├── route.ts
│       │   └── unlocked/route.ts
│       └── leaderboard/route.ts
├── ai/
│   ├── chat/route.ts               ❌ TO CREATE (Phase 06)
│   ├── conversations/
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   ├── explain/
│   │   ├── grammar/[id]/route.ts
│   │   └── vocabulary/[id]/route.ts
│   ├── translate/route.ts
│   └── correct/route.ts
└── admin/
    ├── users/route.ts               ❌ TO CREATE (Phase 09)
    ├── analytics/route.ts
    ├── etl/
    │   ├── import/route.ts
    │   └── jobs/route.ts
    └── content/
        ├── publish/route.ts
        └── review/route.ts
```

**Total planned route files: ~50+**

---

## 11. Conclusion

The API forensic audit confirms:

1. **2 routes exist** — `GET /api/health` (KEEP) and `GET /api/masterplan` (ARCHIVE)
2. **Zero v1 routes** — backward compatibility constraint is vacuously satisfied
3. **Zero domain routes** — entire API surface must be built from API_CONTRACT.md
4. **Zero auth infrastructure** — middleware, helpers, and auth routes needed
5. **Zero external service calls** — clean starting point
6. **Zero server actions** — can be introduced as needed
7. **59+ routes to build** across Phases 01–09
8. **Zero conflicts** with Repository B (nothing to conflict with)

The API surface is a clean slate. Phase 01 should establish the foundational API infrastructure (auth, response helpers, error handling, middleware) before domain routes are built in subsequent phases.
