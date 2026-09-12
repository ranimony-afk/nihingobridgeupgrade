# INTEGRATION BOUNDARIES — NihongoBridge

**Version:** 1.0 — Architecture Freeze
**Date:** 2025-07-16
**Phase:** Phase 01 — Architecture Freeze (informed by Phase 00 audit)
**Status:** FROZEN — Changes require DEC-NNNN decision entry

---

## 1. Purpose

This document defines the boundaries, interfaces, ownership rules, and integration contracts between all major system components. It answers: "What owns what? What talks to what? What is allowed to touch what?"

These boundaries are **enforced by code structure** (directory layout, imports, module exports) — not just by convention.

---

## 2. Repository Boundaries

### 2.1 Repository Authority Map

| Repository | Authority | What It Owns | What It Does NOT Own |
|---|---|---|---|
| `nihingobridgeupgrade` (Repo A) | **PRIMARY** | Application code, schema, API, auth, services, UI | Raw knowledge data files, Flutter project |
| `Knowledge-base-NihongoBridge` (Repo B) | **SOURCE** | Raw data, ETL source scripts, Flutter project | Application schema, auth, API contracts |
| `integration-masterplan` (this) | **CONTROL** | Plans, decisions, checklists, reports | Any executable code |

### 2.2 Repo B Integration Rules

Per Phase 00 audit (DEC-0006), Repo A is a clean starter. When Repo B components become available:

| Rule | Detail |
|---|---|
| **NO bulk copy** | Never copy Repo B directories wholesale into Repo A |
| **File-by-file evaluation** | Each Repo B file must be inspected, classified, and adapted |
| **Schema authority is Repo A** | Repo B data adapts to DOMAIN_MODEL.md, not the reverse |
| **Auth authority is Repo A** | Repo B auth code is classified DEPRECATE (DEC-0003) |
| **API authority is Repo A** | Repo B routes are mapped to API_CONTRACT.md patterns |
| **ETL adapts data** | Repo B raw data flows through ETL into Repo A schema |
| **Tests are welcome** | Repo B test logic can be adapted to Repo A test framework |
| **Flutter is a client** | Repo B Flutter code consumes Repo A API — no server logic in Flutter |

---

## 3. Code Boundary Map

### 3.1 Layer Boundaries

```
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER (src/app/)                                    │
│                                                                    │
│  Pages, layouts, components, API route handlers                   │
│                                                                    │
│  ALLOWED: import from services/, lib/, types/, components/, db/   │
│  FORBIDDEN: direct SQL queries, direct external API calls         │
│  RULE: API route handlers are thin — delegate to services         │
├──────────────────────────────────────────────────────────────────┤
│  SERVICE LAYER (src/services/)                                    │
│                                                                    │
│  Domain logic, business rules, data access                       │
│                                                                    │
│  ALLOWED: import from db/, lib/, types/, other services           │
│  FORBIDDEN: import from app/, components/, React                  │
│  RULE: Services are pure TypeScript — no HTTP, no framework      │
├──────────────────────────────────────────────────────────────────┤
│  DATA LAYER (src/db/)                                             │
│                                                                    │
│  Schema definitions, connection, Drizzle instance                │
│                                                                    │
│  ALLOWED: import from drizzle-orm, pg                             │
│  FORBIDDEN: import from services/, app/, components/              │
│  RULE: Schema is the single source of truth for table structure  │
├──────────────────────────────────────────────────────────────────┤
│  SHARED LAYER (src/lib/, src/types/)                              │
│                                                                    │
│  Utilities, type definitions, constants                          │
│                                                                    │
│  ALLOWED: import from external packages only                      │
│  FORBIDDEN: import from app/, services/, db/, components/         │
│  RULE: Shared code has zero upward dependencies                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Import Direction Rules

```
app/ ──→ services/ ──→ db/
  │         │
  ├──→ lib/ ←──┘
  ├──→ types/ ←──┘
  └──→ components/

ETL scripts (etl/) ──→ db/ (directly, bypassing services for bulk ops)
                   ──→ lib/
```

**Forbidden import directions:**
- `db/` → `services/` (data layer must not know about business logic)
- `services/` → `app/` (services must not know about HTTP or React)
- `lib/` → anything above it (shared utils are dependency-free)
- `components/` → `services/` or `db/` (UI must not access data directly)

---

## 4. Domain Service Boundaries

### 4.1 Service Ownership

Each service owns its domain tables exclusively. Cross-domain reads are allowed; cross-domain writes require explicit justification.

| Service | Owns (read/write) | Reads From (read-only) | Never Touches |
|---|---|---|---|
| `auth` | users, sessions, accounts | — | knowledge, learning, SRS, AI |
| `knowledge` | dictionary_*, kanji, radicals, grammar_points, example_sentences | — | users, learning, SRS |
| `learning` | courses, modules, lessons, questions, user_progress | users (read user_id) | knowledge (except linking), SRS |
| `srs` | decks, cards, reviews | users (read), knowledge tables (for card source) | learning, gamification |
| `search` | — (read-only service) | dictionary_*, kanji, grammar_points | users, SRS, AI |
| `ai` | ai_conversations, ai_messages | users (read), knowledge (via search) | learning, SRS, gamification |
| `gamification` | user_xp, xp_events, streaks, achievements, user_achievements | users (read), user_progress (read), reviews (read) | knowledge, AI |
| `admin` | — (orchestrator) | ALL tables (read) | — |

### 4.2 Cross-Domain Interaction Rules

| Interaction | Allowed? | Mechanism |
|---|---|---|
| Learning awards XP | YES | Learning service calls `gamification.awardXP()` |
| SRS review awards XP | YES | SRS service calls `gamification.awardXP()` |
| AI reads knowledge | YES | AI service calls `search.query()` |
| AI reads user progress | YES | AI service reads `user_progress` for context |
| SRS creates cards from knowledge | YES | SRS service reads `dictionary_entries`, `kanji`, etc. |
| Knowledge writes to user tables | **NO** | Knowledge is reference data — no user awareness |
| Learning modifies SRS cards | **NO** | Different domains; user explicitly adds cards |
| Gamification modifies progress | **NO** | Gamification reads progress; doesn't write it |

### 4.3 Event-Driven Cross-Domain Communication (Future)

When cross-domain side effects are needed (e.g., "lesson completed → award XP → check achievements → update streak"), the calling service invokes the target service's function directly. There is no event bus or message queue at this scale.

```typescript
// In learning service, after marking lesson complete:
async function completeLesson(userId: string, lessonId: string) {
  // 1. Own domain: update progress
  await updateProgress(userId, lessonId, "completed");
  
  // 2. Cross-domain: award XP (direct call)
  await gamificationService.awardXP(userId, 10, "lesson_complete", lessonId);
  
  // 3. Cross-domain: check streak (direct call)
  await gamificationService.recordActivity(userId);
}
```

If the system grows to need asynchronous processing, this can be refactored to an event pattern. YAGNI until proven otherwise.

---

## 5. API Boundary Rules

### 5.1 Route Handler Boundary

API route handlers (`src/app/api/`) are **thin orchestrators**. They:

1. Parse and validate the request (Zod)
2. Extract auth context (session/token)
3. Call the appropriate service function
4. Format the response using standard envelope
5. Handle errors with standard error codes

They do **NOT**:
- Contain business logic
- Execute SQL queries directly
- Call external APIs directly
- Import from other route handlers

### 5.2 Server Component Boundary

Server Components (`src/app/(app)/*/page.tsx`) may:
- Call service functions directly (bypassing API routes)
- Read auth session from cookies
- Pass data to client components via props

Server Components do **NOT**:
- Execute raw SQL
- Call external APIs directly
- Mutate data (use Server Actions or API routes for writes)

### 5.3 Client Component Boundary

Client Components (`"use client"` files) may:
- Call API routes via `fetch()`
- Use client-side state (React state, URL params)
- Handle user interactions

Client Components do **NOT**:
- Import from `@/db`
- Import from `@/services/`
- Access `process.env` (only `NEXT_PUBLIC_*`)

---

## 6. Database Boundaries

### 6.1 Access Control

| Accessor | Access Level | Mechanism |
|---|---|---|
| Service layer | Full CRUD via Drizzle | `import { db } from "@/db"` |
| API route handlers | Via services only | Call service functions |
| Server Components | Via services only | Call service functions |
| Client Components | None | Must use API routes |
| ETL scripts | Full CRUD via Drizzle | Direct `db` import (bulk ops) |
| Flutter mobile | None | Must use API endpoints |

### 6.2 Schema Modification Rules

| Action | Allowed By | Process |
|---|---|---|
| Add table | Any phase | Define in `schema.ts`, run `drizzle-kit push`, log in DEC |
| Add column | Any phase | Add to table in `schema.ts`, run push, log |
| Rename column | Carefully | Add new column, backfill, deprecate old, log in DEC |
| Drop column | Only with DEC-NNNN | Must document reason, verify no consumers, add `_deprecated` first |
| Drop table | Only with DEC-NNNN | Extreme caution; archive data first |
| Add index | Any phase | Define in schema or raw SQL |
| Add extension | Phase-specific | Document in TARGET_ARCHITECTURE.md |

### 6.3 Connection Boundary

`src/db/index.ts` exports:
- `db` — Drizzle instance (primary access)
- `pool` — Raw pg Pool (restricted to auth adapter + emergency raw SQL)

In Phase 01, the connection file will be updated to bind schema:
```typescript
import * as schema from "./schema";
export const db = drizzle(pool, { schema });
```

---

## 7. External Service Boundaries

### 7.1 AI Provider

| Rule | Detail |
|---|---|
| Access point | `src/services/ai/` only |
| API key location | `process.env.OPENAI_API_KEY` (server-side only) |
| Proxy pattern | Client → `/api/ai/*` → AI service → OpenAI API |
| Never in client | AI API keys never appear in client bundle |
| Cost boundary | Rate limit (30/min/user) + token budget per request |
| Fallback | Graceful degradation if AI provider is down |

### 7.2 OAuth Providers

| Rule | Detail |
|---|---|
| Access point | Auth library callback routes |
| Secrets | Provider-specific env vars (server-side only) |
| User creation | OAuth login creates user in `users` table with `accounts` link |
| Token storage | OAuth tokens encrypted in `accounts` table |

### 7.3 No Other External Services

Phase 00 audit confirmed zero external API calls exist. No additional external services are planned until Phase 06 (AI) and Phase 08 (mobile push notifications, if needed).

---

## 8. Mobile Integration Boundaries

### 8.1 Flutter as API Client

| Rule | Detail |
|---|---|
| Auth | Bearer token via `/api/auth/login` → token in secure storage |
| Data access | REST API only — no direct database access |
| Domain logic | Server-side only — Flutter does NOT implement SRS scheduling, XP calculation, etc. |
| Offline | Local SQLite cache for dictionary/SRS cards; queue reviews for sync |
| Sync | POST queued reviews on reconnection; server is authoritative |
| State | Server state is authoritative; client cache is secondary |

### 8.2 What Flutter Can Cache Locally

| Data | Cache Strategy | Invalidation |
|---|---|---|
| Dictionary entries | Cache on first view; TTL 7 days | Manual refresh or version check |
| Kanji data | Cache on first view; TTL 7 days | Manual refresh |
| SRS due cards | Pre-fetch for offline review | Sync on reconnect |
| User profile | Cache; refresh on app open | Session refresh |
| AI conversations | Do not cache | Always fetch |

### 8.3 What Flutter Must NOT Do

- Implement FSRS/SM-2 scheduling algorithm (server computes next interval)
- Store unencrypted auth tokens
- Cache admin data
- Duplicate progress calculation logic
- Make direct database connections

---

## 9. ETL Boundaries

### 9.1 ETL Pipeline Rules

| Rule | Detail |
|---|---|
| Location | `etl/` directory — separate from application code |
| Database access | Direct Drizzle `db` import (bulk operations need it) |
| Schema authority | ETL imports data INTO the Repo A schema — does not define its own tables |
| Idempotency | All imports are idempotent (upsert by `source` + `source_id`) |
| Provenance | Every imported row carries source, version, and timestamp |
| Validation | ETL validates data before commit; rejects invalid records |
| Atomicity | Each import runs in a transaction; all-or-nothing |
| Scheduling | Admin-triggered via `/api/admin/etl/import` or CLI script |

### 9.2 ETL Data Flow

```
External Data Source (JMdict XML, KANJIDIC2 XML, etc.)
         │
         ▼
  etl/pipelines/parser.ts  ──  Parse raw format
         │
         ▼
  etl/pipelines/transform.ts  ──  Map to DOMAIN_MODEL schema
         │
         ▼
  etl/pipelines/load.ts  ──  Upsert via Drizzle into app_db
         │                    (within transaction)
         ▼
  Validation report  ──  Record counts, errors, provenance
```

### 9.3 ETL Must NOT

- Create its own tables (schema is in `src/db/schema.ts`)
- Bypass provenance columns (every row needs source metadata)
- Delete existing knowledge data without DEC-NNNN authorization
- Run without logging/reporting results
- Import data from unknown/unlicensed sources

---

## 10. Testing Boundaries

### 10.1 Test Types and Locations

| Type | Location | What It Tests | Database |
|---|---|---|---|
| Unit | `tests/unit/` | Service functions, utilities, pure logic | Mocked |
| Integration | `tests/integration/` | Service + database, API routes | Test database |
| E2E | `tests/e2e/` | Full user flows through UI | Test database |
| ETL | `tests/etl/` | Import pipeline correctness | Test database |

### 10.2 Test Database Rules

- Tests use a separate database or schema (not `app_db` in production)
- Tests clean up after themselves (transaction rollback or truncate)
- Test fixtures live in `tests/fixtures/`
- No test depends on production data

---

## 11. Security Boundaries

Per security-baseline.md:

| Boundary | Rule |
|---|---|
| Secrets | Server-side only via `process.env`; never `NEXT_PUBLIC_*` for secrets |
| User data | Users see only their own data; service layer enforces `WHERE user_id = ?` |
| Admin data | Admin routes require `role === 'admin'` in middleware |
| AI keys | Proxied through `/api/ai/*`; never sent to client |
| Database | No direct external access; application-only via Drizzle |
| File system | No `fs` access in production API routes (SEC-014) |
| Input | Zod validation on every write endpoint |
| Output | Error responses never leak stack traces in production |

---

## 12. Boundary Enforcement

These boundaries are enforced through:

1. **Directory structure** — code physically lives in the correct layer
2. **Import restrictions** — ESLint rules can enforce import direction (future)
3. **TypeScript types** — service functions accept/return typed DTOs, not raw SQL results
4. **Code review** — boundaries are checked during review against this document
5. **Test isolation** — tests mock the layer below, proving boundary is respected
6. **This document** — canonical reference for "is this import/call allowed?"

---

## 13. Boundary Violations — How to Handle

If a boundary must be crossed in a way not covered here:

1. **Document the need** in a DEC-NNNN entry
2. **Justify why** the boundary cannot be respected
3. **Propose an alternative** that respects boundaries
4. **If no alternative**, document the exception explicitly
5. **Never silently violate** — undocumented boundary violations become tech debt
