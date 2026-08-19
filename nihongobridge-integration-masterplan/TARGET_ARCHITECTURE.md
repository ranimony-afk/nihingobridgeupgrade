# TARGET ARCHITECTURE — NihongoBridge

**Version:** 2.0 — Architecture Freeze
**Date:** 2025-07-16
**Phase:** Phase 01 — Architecture Freeze (informed by Phase 00 audit)
**Status:** FROZEN — Changes require DEC-NNNN decision entry

---

## 1. Audit-Informed Context

Phase 00 audit (DEC-0006) established that Repository A is a clean Next.js + PostgreSQL + Drizzle starter template with zero domain implementation. This architecture is therefore a **green-field specification on a pre-configured stack**, not a retrofit of existing systems.

| Audit Finding | Architectural Implication |
|---|---|
| 0 tables in database | Schema is built from this document, not migrated |
| 0 auth infrastructure | Auth is designed fresh; library choice per DEC-0005 |
| 0 API routes (except /api/health) | API surface is designed from API_CONTRACT.md |
| 0 tests | Test infrastructure is designed as a first-class concern |
| 4 HIGH npm CVEs (SEC-013) | Next.js must be updated to 16.3.1 before Phase 01 work |
| No .gitignore (SEC-009) | Must be created before any code is committed |
| Repo B not available | Architecture must be modular enough to absorb Repo B components later |

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                     │
│                                                                        │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐          │
│  │  Web          │     │  Mobile       │     │  Admin        │          │
│  │  Next.js SSR  │     │  Flutter      │     │  (Web, RBAC)  │          │
│  │  + Client     │     │  iOS/Android  │     │               │          │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘          │
└─────────┼────────────────────┼────────────────────┼──────────────────┘
          │ same-origin        │ cross-origin        │ same-origin
          │ session cookie     │ Bearer token        │ session + RBAC
          ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         EDGE / MIDDLEWARE                              │
│                                                                        │
│  middleware.ts                                                        │
│  ├── Auth session validation (cookie or Bearer)                       │
│  ├── CORS headers for mobile origins                                  │
│  ├── Security headers (X-Frame-Options, CSP, etc.)                   │
│  └── Rate limiting check                                              │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        API LAYER (Next.js App Router)                  │
│                                                                        │
│  /api/health ──── Infrastructure health (KEEP — already exists)       │
│  /api/auth/* ──── Authentication (Phase 01)                           │
│  /api/v2/*   ──── Domain API: knowledge, learning, SRS, gamification │
│  /api/ai/*   ──── AI tutor services (Phase 06)                       │
│  /api/admin/* ─── Admin services, RBAC-gated (Phase 04+)             │
│                                                                        │
│  Note: /api/v1/* namespace is RESERVED but currently empty.           │
│  If Repo B v1 routes are discovered, they will be mapped here.        │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      DOMAIN SERVICE LAYER                             │
│   (src/services/ — pure TypeScript, no HTTP, no framework coupling)   │
│                                                                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │ auth       │ │ knowledge  │ │ learning   │ │ srs        │        │
│  │            │ │            │ │            │ │            │        │
│  │ register   │ │ dictionary │ │ courses    │ │ decks      │        │
│  │ login      │ │ kanji      │ │ modules    │ │ cards      │        │
│  │ session    │ │ grammar    │ │ lessons    │ │ reviews    │        │
│  │ rbac       │ │ sentences  │ │ quizzes    │ │ scheduler  │        │
│  │ apiKeys    │ │ radicals   │ │ progress   │ │ fsrs       │        │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │
│                                                                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │ search     │ │ ai         │ │ gamtic.    │ │ admin      │        │
│  │            │ │            │ │            │ │            │        │
│  │ fullText   │ │ chat       │ │ xp         │ │ etlJobs    │        │
│  │ kanji      │ │ rag        │ │ streaks    │ │ content    │        │
│  │ grammar    │ │ explain    │ │ achieve.   │ │ users      │        │
│  │ crossDom.  │ │ translate  │ │ goals      │ │ analytics  │        │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                    │
│                                                                        │
│  ┌─────────────────────────┐    ┌──────────────────────────┐         │
│  │  PostgreSQL 15.16        │    │  External APIs            │         │
│  │  via Drizzle ORM 0.45.2  │    │  (server-side only)       │         │
│  │                          │    │                           │         │
│  │  Database: app_db        │    │  ┌─────────────────────┐ │         │
│  │  Schema: public          │    │  │ OpenAI / Anthropic  │ │         │
│  │                          │    │  │ (AI tutor, Phase 06)│ │         │
│  │  Extensions required:    │    │  └─────────────────────┘ │         │
│  │  • pgcrypto (UUIDs)      │    │                           │         │
│  │  • pg_trgm  (search)     │    │  ┌─────────────────────┐ │         │
│  │  • pgvector (RAG, opt.)  │    │  │ OAuth Providers     │ │         │
│  │                          │    │  │ (auth, Phase 01)    │ │         │
│  └─────────────────────────┘    │  └─────────────────────┘ │         │
│                                  └──────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack (Verified)

All versions confirmed by Phase 00 audit against actual `package.json` and runtime.

### 3.1 Locked (Repo A — authoritative)

| Layer | Technology | Version | Audit Status |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 → **16.3.1** (SEC-013 fix required) | ⚠️ Update needed |
| Language | TypeScript | 5.9.3 | ✅ strict mode confirmed |
| React | React + ReactDOM | 19.2.6 | ✅ |
| Database | PostgreSQL | 15.16 | ✅ running, empty, UTF-8 |
| ORM | Drizzle ORM | 0.45.2 | ✅ |
| DB Driver | pg (node-postgres) | 8.20.0 | ✅ Pool singleton verified |
| Styling | Tailwind CSS v4 | 4.1.17 | ✅ |
| Build | Turbopack (via Next.js) | bundled | ✅ |
| Linting | ESLint 9 (flat config) | 9.39.4 | ✅ |

### 3.2 To Be Added (Phase 01)

| Layer | Technology | Purpose | Decision |
|---|---|---|---|
| Auth | Auth.js (NextAuth v5) *recommended* | Authentication + sessions | DEC-0005 (PENDING) |
| Validation | Zod | Request/response schema validation | Phase 01 |
| Testing | Vitest + Testing Library | Unit + integration tests | Phase 01 |
| Rate Limiting | @upstash/ratelimit or custom | Abuse protection | Phase 01 |

### 3.3 Future Phases

| Layer | Technology | Purpose | Phase |
|---|---|---|---|
| Search | PostgreSQL FTS + pg_trgm | Dictionary/kanji/grammar search | Phase 03 |
| AI Provider | OpenAI API (server-side proxy) | AI tutor, RAG | Phase 06 |
| Embeddings | pgvector (optional) | RAG vector search | Phase 06 |
| Mobile | Flutter + Dio | iOS/Android client | Phase 08 |
| Monitoring | TBD | Application performance + errors | Phase 09 |

---

## 4. Directory Structure (Canonical)

```
nihingobridgeupgrade/
├── .env                        # Environment variables (SECRET — .gitignore'd)
├── .gitignore                  # SEC-009: MUST CREATE in Phase 01
├── drizzle.config.json         # Drizzle Kit config (KEEP)
├── eslint.config.mjs           # ESLint flat config (KEEP)
├── next.config.ts              # Next.js config (MODIFY — add headers, CORS)
├── package.json                # Dependencies (MODIFY per phase)
├── postcss.config.mjs          # Tailwind PostCSS (KEEP)
├── tsconfig.json               # TypeScript strict (KEEP)
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout (MODIFY — add auth provider)
│   │   ├── globals.css         # Tailwind + design tokens
│   │   ├── page.tsx            # Home page (REPLACE control tower)
│   │   │
│   │   ├── (auth)/             # Auth route group (Phase 01)
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   │
│   │   ├── (app)/              # Authenticated app route group
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── dictionary/     # Dictionary browser
│   │   │   ├── kanji/          # Kanji browser
│   │   │   ├── grammar/        # Grammar reference
│   │   │   ├── learn/          # Course/lesson viewer
│   │   │   ├── review/         # SRS review session
│   │   │   └── settings/       # User settings
│   │   │
│   │   ├── (admin)/            # Admin route group (RBAC-gated)
│   │   │   └── admin/          # Admin dashboard
│   │   │
│   │   └── api/                # API routes
│   │       ├── health/route.ts # Health check (KEEP)
│   │       ├── auth/           # Auth endpoints
│   │       ├── v2/             # Domain API
│   │       ├── ai/             # AI services
│   │       └── admin/          # Admin API
│   │
│   ├── middleware.ts           # Auth + CORS + headers + rate limiting
│   │
│   ├── db/
│   │   ├── index.ts            # Connection pool + drizzle(pool, { schema })
│   │   └── schema.ts           # ALL Drizzle table definitions
│   │
│   ├── services/               # Domain service layer (pure TypeScript)
│   │   ├── auth/
│   │   ├── knowledge/
│   │   ├── learning/
│   │   ├── srs/
│   │   ├── search/
│   │   ├── ai/
│   │   ├── gamification/
│   │   └── admin/
│   │
│   ├── lib/                    # Shared utilities
│   │   ├── api-response.ts     # Standard response helpers
│   │   ├── validation.ts       # Zod schema helpers
│   │   └── errors.ts           # Error classes
│   │
│   ├── types/                  # Shared TypeScript types
│   │   └── index.ts
│   │
│   └── components/             # Shared UI components
│       ├── ui/                 # Base UI primitives
│       └── layout/             # Layout components
│
├── etl/                        # ETL scripts (Phase 02)
│   ├── sources/                # Raw data files
│   └── pipelines/              # Import scripts
│
└── tests/                      # Test suites
    ├── unit/
    ├── integration/
    └── fixtures/
```

---

## 5. Key Architectural Decisions

### ADR-01: Single PostgreSQL Database

All domains share one PostgreSQL database (`app_db`) via one Drizzle ORM instance. No microservice databases. Table prefixes or schema-level separation is NOT used — all tables live in the `public` schema with descriptive names.

**Rationale:** Simplicity, transactional consistency, single deployment. The data volume (hundreds of thousands of dictionary entries, not billions) does not warrant distributed databases.

### ADR-02: Server-Side Domain Logic

All business logic (SRS scheduling, XP calculation, progress tracking, streak computation) lives in `src/services/`. API routes are thin wrappers. Server Components query services directly. No domain logic in the client or in Flutter.

**Rationale:** Single source of truth. Mobile client gets correct behavior without duplicating algorithms. Testing is simpler (test services, not API routes).

### ADR-03: Dual Auth (Cookie + Bearer)

Authentication supports two token delivery mechanisms from day one:
- **httpOnly session cookie** — for the web application (same-origin)
- **Bearer token** — for the Flutter mobile client (cross-origin) and API keys

**Rationale:** API consumer map (api-consumer-map.md) identifies 4 consumer types. Mobile and ETL scripts cannot use cookies. Designing both from the start avoids costly retrofits.

### ADR-04: Knowledge Provenance

Every row in knowledge tables (dictionary, kanji, grammar, sentences) carries provenance columns: `source`, `source_id`, `source_version`, `import_version`, `imported_at`. Knowledge is never anonymous.

**Rationale:** Licensing compliance, data traceability, idempotent re-imports, audit trail.

### ADR-05: Additive-Only Schema Changes

Schema changes are additive. No `DROP TABLE`, `TRUNCATE`, or destructive column removal without a DEC-NNNN decision. Deprecated columns are kept but marked with `_deprecated` suffix.

**Rationale:** Master instruction non-destructive database rule. Currently the database is empty (Phase 00 audit), but this rule protects against data loss once data exists.

### ADR-06: No /api/v1/ Routes Unless Discovered

Phase 00 audit confirmed zero v1 routes exist. The `/api/v1/` namespace is reserved but will remain empty unless Repo B inspection reveals existing v1 routes that must be preserved for backward compatibility. All new routes go into `/api/v2/`.

**Rationale:** Master instruction says v1 must be backward-compatible, but there's nothing to be compatible with. Building into v2 from the start avoids confusion.

---

## 6. Security Architecture

Based on security-baseline.md findings (OWASP score 1.75/10), the following must be in place before any authenticated feature ships:

| Layer | Implementation | Phase |
|---|---|---|
| Authentication | Auth library (DEC-0005) with session + Bearer | Phase 01 |
| Authorization | Role enum (user, editor, admin) checked in middleware + route handlers | Phase 01 |
| Session Security | httpOnly, Secure, SameSite=lax cookies; server-side session storage | Phase 01 |
| Input Validation | Zod schemas on every POST/PUT/PATCH route handler | Phase 01 |
| CORS | Explicit allowlist in `next.config.ts` `headers()` | Phase 01 |
| Security Headers | X-Frame-Options, X-Content-Type-Options, Referrer-Policy in `next.config.ts` | Phase 01 |
| Rate Limiting | Per-IP + per-user limits in middleware | Phase 01 |
| Secrets | All secrets via `process.env`; `.gitignore` for `.env`; no `NEXT_PUBLIC_` secrets | Phase 01 |
| SQL Injection | Drizzle ORM parameterized queries (already safe) | ✅ Verified |
| XSS | No `dangerouslySetInnerHTML` on user content; sanitized markdown rendering | Phase 01+ |
| Logging | Structured security event logging | Phase 09 |

---

## 7. Data Flow Constraints

| Constraint | Enforced By |
|---|---|
| AI provider API keys never reach the client | Server-side proxy in `/api/ai/*`; no `NEXT_PUBLIC_` prefix |
| User data is scoped — users see only their own data | Service layer filters by `user_id` from session |
| Admin data requires admin role | Middleware + route-level RBAC check |
| Knowledge data is read-only in the app | Only ETL scripts write to knowledge tables |
| SRS scheduling is server-authoritative | Mobile client submits reviews; server computes next interval |
| File uploads are sanitized | Allowlist file types; unique filenames; store outside web root |
| ETL imports are idempotent | Upsert by `source` + `source_id`; version comparison |

---

## 8. Scalability Boundaries

| Domain | Expected Volume | Strategy |
|---|---|---|
| Dictionary entries | ~200,000 | B-tree + GIN indexes; paginated API |
| Dictionary senses | ~500,000 | FK index on `entry_id` |
| Kanji | ~13,000 | Small table; in-memory caching acceptable |
| Grammar points | ~800 | Small table |
| Example sentences | ~100,000+ | FK indexes; full-text search |
| Users | Thousands | Standard indexing |
| SRS cards | Tens of thousands per user | Composite index (user_id, state, due) |
| Reviews | Append-only, growing | Partitioning if needed at scale |
| AI messages | Append-only, growing | Archival strategy for old conversations |
