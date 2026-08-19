# API CONSUMER MAP — Phase 00, Prompt 03

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit — API Forensic Audit
**Auditor:** Integration Team (Arena AI)
**Status:** COMPLETE
**Mode:** READ-ONLY — No modifications made

---

## 1. Overview

This document maps every consumer (current and planned) of every API endpoint, tracking which clients call which routes, with what authentication, and identifying data flow dependencies.

---

## 2. Current Consumer Map

### 2.1 Active Consumers

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSUMERS (Current)                        │
│                                                               │
│  ┌─────────────────────┐    ┌──────────────────────────────┐ │
│  │ Platform Infra      │    │ Control Tower Dashboard      │ │
│  │ (health probing)    │    │ (Server Components)          │ │
│  │                     │    │                              │ │
│  │ Type: Automated     │    │ Type: Web UI                 │ │
│  │ Auth: None          │    │ Auth: None                   │ │
│  │ Format: JSON        │    │ Format: Direct fs reads      │ │
│  └─────────┬───────────┘    └──────────────┬───────────────┘ │
│            │                               │                  │
└────────────┼───────────────────────────────┼──────────────────┘
             │                               │
             ▼                               ▼
    GET /api/health               GET /api/masterplan
    { ok: boolean }               { success, data: {...} }
             │                               │
             ▼                               ▼
    PostgreSQL (SELECT 1)         File system (fs.readdir/readFile)
```

### 2.2 Consumer Detail: Platform Infrastructure

| Property | Value |
|---|---|
| Consumer ID | CONSUMER-001 |
| Consumer Type | Automated health probe |
| Platform | Server infrastructure / build system |
| Route | `GET /api/health` |
| Frequency | Every build/deploy + periodic checks |
| Auth | None |
| Expected Response | `{ ok: true }` with status 200 |
| Failure Behavior | Blocks deployment if unhealthy |
| Breaking Change Impact | **CRITICAL** — would break platform deployment |

### 2.3 Consumer Detail: Control Tower Dashboard

| Property | Value |
|---|---|
| Consumer ID | CONSUMER-002 |
| Consumer Type | Server Components (SSR page rendering) |
| Platform | Next.js web (this application) |
| Route | `GET /api/masterplan` (registered but consumed indirectly via Server Components) |
| Frequency | On page load |
| Auth | None |
| Data Flow | Server Components read fs directly; API route is secondary |
| Breaking Change Impact | **NONE** — scaffolding code, will be archived |

**Note:** The control tower dashboard primarily uses Server Component data fetching (direct `fs` calls in `page.tsx` and `[slug]/page.tsx`) rather than the `/api/masterplan` route. The API route exists but the dashboard doesn't `fetch()` it — the pages read files directly during SSR.

---

## 3. Planned Consumer Map

### 3.1 Full Consumer-Route Matrix (Planned)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CONSUMERS (Planned)                             │
│                                                                       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────┐ │
│  │ Web App   │  │ Flutter   │  │ Admin     │  │ ETL / External    │ │
│  │ (Next.js) │  │ (Mobile)  │  │ Dashboard │  │ (Scripts/3rd pty) │ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────────┬──────────┘ │
└────────┼──────────────┼──────────────┼──────────────────┼────────────┘
         │              │              │                  │
         ▼              ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       API ROUTES                                     │
│                                                                       │
│  /api/health ◄────────────────── Platform Infra (CONSUMER-001)       │
│                                                                       │
│  /api/auth/* ◄────── Web, Mobile, Admin                              │
│                                                                       │
│  /api/v2/dictionary/* ◄────── Web, Mobile                            │
│  /api/v2/kanji/*      ◄────── Web, Mobile                            │
│  /api/v2/grammar/*    ◄────── Web, Mobile                            │
│  /api/v2/radicals/*   ◄────── Web, Mobile                            │
│                                                                       │
│  /api/v2/courses/*    ◄────── Web, Mobile                            │
│  /api/v2/modules/*    ◄────── Web, Mobile                            │
│  /api/v2/lessons/*    ◄────── Web, Mobile                            │
│  /api/v2/progress/*   ◄────── Web, Mobile                            │
│                                                                       │
│  /api/v2/srs/*        ◄────── Web, Mobile                            │
│                                                                       │
│  /api/v2/gamification/* ◄───── Web, Mobile                           │
│                                                                       │
│  /api/ai/*            ◄────── Web, Mobile                            │
│                                                                       │
│  /api/admin/*         ◄────── Admin Dashboard, ETL Scripts           │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Consumer Profiles

#### CONSUMER-003: Web Application (Next.js)

| Property | Value |
|---|---|
| Platform | Next.js (Browser + Server Components) |
| Auth Method | Session cookie (httpOnly) |
| Request Format | JSON |
| Response Format | `{ success, data, meta }` |
| Routes Used | ALL routes |
| Special Needs | Server Components can bypass API and query DB directly |
| CORS | Same-origin — no CORS issues |
| Offline | No offline support |
| Phase | Phase 01+ |

**Data Flow Patterns:**

| Pattern | Usage | Example |
|---|---|---|
| Server Component → DB (direct) | Page rendering | Course listing page |
| Server Component → Service → DB | Complex data | Dashboard with aggregations |
| Client Component → `fetch()` → API Route | Interactive features | SRS review session, AI chat |
| Server Action → Service → DB | Form submissions | Quiz answer submission |

#### CONSUMER-004: Flutter Mobile App

| Property | Value |
|---|---|
| Platform | Flutter (iOS + Android) |
| Auth Method | Bearer token (stored securely on device) |
| Request Format | JSON |
| Response Format | `{ success, data, meta }` |
| HTTP Client | Dio (expected) |
| Routes Used | All v2, AI routes (NOT admin) |
| Special Needs | Offline cache, sync, auth token refresh |
| CORS | Cross-origin — MUST configure CORS headers |
| Offline | Yes — cache + queue reviews for sync |
| Phase | Phase 08 |

**Data Flow Patterns:**

| Pattern | Usage | Example |
|---|---|---|
| `dio.get('/api/v2/...')` | Read operations | Dictionary search, deck listing |
| `dio.post('/api/v2/...')` | Write operations | Submit review, create card |
| `dio.post('/api/ai/...')` | AI operations | Send chat message |
| Local SQLite → Sync → API | Offline reviews | Queue reviews, sync on reconnect |

**Critical Mobile API Requirements:**

| Requirement | API Impact |
|---|---|
| Token-based auth | Auth routes must issue + refresh Bearer tokens |
| Pagination | All list endpoints must support `page` + `pageSize` |
| Conditional GET | ETag/If-None-Match for cache validation |
| Delta sync | Sync endpoints for incremental data transfer |
| Error codes | Standardized error format for client-side handling |
| Response compression | gzip/br support for bandwidth efficiency |

#### CONSUMER-005: Admin Dashboard

| Property | Value |
|---|---|
| Platform | Web (Next.js, same app or separate) |
| Auth Method | Session cookie + RBAC (admin/editor role) |
| Routes Used | Admin routes + all v2 routes |
| Special Needs | Bulk operations, analytics queries |
| CORS | Same-origin |
| Phase | Phase 04+ |

#### CONSUMER-006: ETL Scripts

| Property | Value |
|---|---|
| Platform | CLI / Node.js scripts |
| Auth Method | API key (header-based) |
| Routes Used | `/api/admin/etl/*` |
| Special Needs | Long-running operations, progress reporting |
| CORS | N/A (server-to-server) |
| Phase | Phase 02 |

**Note:** ETL scripts may also access the database directly (bypassing the API) for bulk imports. API access is primarily for triggering and monitoring ETL jobs.

---

## 4. Route-to-Consumer Matrix

### 4.1 Infrastructure Routes

| Route | Web | Mobile | Admin | ETL | Infra |
|---|---|---|---|---|---|
| `GET /api/health` | — | — | — | — | ✅ |

### 4.2 Auth Routes (Phase 01)

| Route | Web | Mobile | Admin | ETL | Infra |
|---|---|---|---|---|---|
| `POST /api/auth/register` | ✅ | ✅ | — | — | — |
| `POST /api/auth/login` | ✅ | ✅ | ✅ | — | — |
| `POST /api/auth/logout` | ✅ | ✅ | ✅ | — | — |
| `GET /api/auth/me` | ✅ | ✅ | ✅ | — | — |
| `POST /api/auth/refresh` | — | ✅ | — | — | — |

### 4.3 Knowledge Routes (Phase 03)

| Route | Web | Mobile | Admin | ETL | Infra |
|---|---|---|---|---|---|
| `GET /api/v2/dictionary/search` | ✅ | ✅ | ✅ | — | — |
| `GET /api/v2/dictionary/entries/:id` | ✅ | ✅ | ✅ | — | — |
| `GET /api/v2/dictionary/entries/:id/senses` | ✅ | ✅ | — | — | — |
| `GET /api/v2/dictionary/entries/:id/readings` | ✅ | ✅ | — | — | — |
| `GET /api/v2/dictionary/entries/:id/kanji` | ✅ | ✅ | — | — | — |
| `GET /api/v2/dictionary/entries/:id/examples` | ✅ | ✅ | — | — | — |
| `GET /api/v2/kanji/search` | ✅ | ✅ | ✅ | — | — |
| `GET /api/v2/kanji/:character` | ✅ | ✅ | — | — | — |
| `GET /api/v2/kanji/:character/examples` | ✅ | ✅ | — | — | — |
| `GET /api/v2/kanji/by-radical/:id` | ✅ | ✅ | — | — | — |
| `GET /api/v2/kanji/by-grade/:grade` | ✅ | ✅ | — | — | — |
| `GET /api/v2/kanji/by-jlpt/:level` | ✅ | ✅ | — | — | — |
| `GET /api/v2/grammar/search` | ✅ | ✅ | ✅ | — | — |
| `GET /api/v2/grammar/:id` | ✅ | ✅ | — | — | — |
| `GET /api/v2/grammar/:id/examples` | ✅ | ✅ | — | — | — |
| `GET /api/v2/grammar/by-jlpt/:level` | ✅ | ✅ | — | — | — |
| `GET /api/v2/radicals` | ✅ | ✅ | — | — | — |
| `GET /api/v2/radicals/:id` | ✅ | ✅ | — | — | — |
| `GET /api/v2/radicals/:id/kanji` | ✅ | ✅ | — | — | — |

### 4.4 Learning Routes (Phase 04)

| Route | Web | Mobile | Admin | ETL | Infra |
|---|---|---|---|---|---|
| `GET /api/v2/courses` | ✅ | ✅ | ✅ | — | — |
| `GET /api/v2/courses/:id` | ✅ | ✅ | ✅ | — | — |
| `GET /api/v2/courses/:id/modules` | ✅ | ✅ | — | — | — |
| `POST /api/v2/courses/:id/enroll` | ✅ | ✅ | — | — | — |
| `GET /api/v2/modules/:id` | ✅ | ✅ | — | — | — |
| `GET /api/v2/modules/:id/lessons` | ✅ | ✅ | — | — | — |
| `GET /api/v2/lessons/:id` | ✅ | ✅ | — | — | — |
| `POST /api/v2/lessons/:id/complete` | ✅ | ✅ | — | — | — |
| `POST /api/v2/lessons/:id/submit` | ✅ | ✅ | — | — | — |
| `GET /api/v2/progress` | ✅ | ✅ | — | — | — |
| `GET /api/v2/progress/courses/:id` | ✅ | ✅ | — | — | — |
| `GET /api/v2/progress/stats` | ✅ | ✅ | — | — | — |

### 4.5 SRS Routes (Phase 05)

| Route | Web | Mobile | Admin | ETL | Infra |
|---|---|---|---|---|---|
| `GET /api/v2/srs/decks` | ✅ | ✅ | — | — | — |
| `POST /api/v2/srs/decks` | ✅ | ✅ | — | — | — |
| `GET /api/v2/srs/decks/:id` | ✅ | ✅ | — | — | — |
| `PUT /api/v2/srs/decks/:id` | ✅ | ✅ | — | — | — |
| `DELETE /api/v2/srs/decks/:id` | ✅ | ✅ | — | — | — |
| `GET /api/v2/srs/decks/:id/cards` | ✅ | ✅ | — | — | — |
| `POST /api/v2/srs/decks/:id/cards` | ✅ | ✅ | — | — | — |
| `GET /api/v2/srs/decks/:id/due` | ✅ | ✅ | — | — | — |
| `POST /api/v2/srs/review` | ✅ | ✅ | — | — | — |
| `GET /api/v2/srs/stats` | ✅ | ✅ | — | — | — |

### 4.6 AI Routes (Phase 06)

| Route | Web | Mobile | Admin | ETL | Infra |
|---|---|---|---|---|---|
| `POST /api/ai/chat` | ✅ | ✅ | — | — | — |
| `GET /api/ai/conversations` | ✅ | ✅ | — | — | — |
| `GET /api/ai/conversations/:id` | ✅ | ✅ | — | — | — |
| `POST /api/ai/explain/grammar/:id` | ✅ | ✅ | — | — | — |
| `POST /api/ai/explain/vocabulary/:id` | ✅ | ✅ | — | — | — |
| `POST /api/ai/translate` | ✅ | ✅ | — | — | — |
| `POST /api/ai/correct` | ✅ | ✅ | — | — | — |

### 4.7 Gamification Routes (Phase 07)

| Route | Web | Mobile | Admin | ETL | Infra |
|---|---|---|---|---|---|
| `GET /api/v2/gamification/xp` | ✅ | ✅ | — | — | — |
| `GET /api/v2/gamification/streak` | ✅ | ✅ | — | — | — |
| `GET /api/v2/gamification/achievements` | ✅ | ✅ | — | — | — |
| `GET /api/v2/gamification/achievements/unlocked` | ✅ | ✅ | — | — | — |
| `GET /api/v2/gamification/leaderboard` | ✅ | ✅ | — | — | — |

### 4.8 Admin Routes (Phase 09)

| Route | Web | Mobile | Admin | ETL | Infra |
|---|---|---|---|---|---|
| `GET /api/admin/users` | — | — | ✅ | — | — |
| `GET /api/admin/analytics` | — | — | ✅ | — | — |
| `POST /api/admin/etl/import` | — | — | ✅ | ✅ | — |
| `GET /api/admin/etl/jobs` | — | — | ✅ | ✅ | — |
| `POST /api/admin/content/publish` | — | — | ✅ | — | — |
| `GET /api/admin/content/review` | — | — | ✅ | — | — |

---

## 5. Auth Flow by Consumer

### 5.1 Web Application Auth Flow

```
User ──► Login Page ──► POST /api/auth/login
                              │
                              ▼
                        Set httpOnly session cookie
                              │
                              ▼
                        Redirect to dashboard
                              │
                              ▼
            Server Component reads session cookie
                              │
                              ▼
                    Auth middleware validates session
                              │
                              ▼
                    Route handler returns user-scoped data
```

### 5.2 Flutter Mobile Auth Flow

```
User ──► Login Screen ──► POST /api/auth/login
                               │
                               ▼
                         Response: { token, refreshToken }
                               │
                               ▼
                    Store tokens in secure storage
                               │
                               ▼
                All API calls: Authorization: Bearer <token>
                               │
                               ▼
                    If 401: POST /api/auth/refresh
                               │
                               ▼
                    If refresh fails: redirect to login
```

### 5.3 ETL Script Auth Flow

```
Script ──► Read API key from env
                │
                ▼
     All API calls: X-API-Key: <key>
                │
                ▼
     Auth middleware validates API key
                │
                ▼
     Route handler returns admin-scoped data
```

---

## 6. Data Flow Topology

### 6.1 End-to-End Data Flow

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  ETL Sources │   │ User Input   │   │ AI Provider  │
│  (JMdict,    │   │ (Reviews,    │   │ (OpenAI,     │
│   KANJIDIC)  │   │  Answers)    │   │  Anthropic)  │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                   │
       ▼                  ▼                   ▼
┌──────────────────────────────────────────────────────┐
│                    API LAYER                          │
│                                                       │
│  ETL Import ──► Knowledge Tables                     │
│  User Actions ──► Progress/SRS/Gamification Tables   │
│  AI Chat ──► AI Tables + External Provider           │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                  PostgreSQL                           │
│                                                       │
│  Knowledge ◄── ETL (write) + Search/AI (read)        │
│  Users ◄── Auth (write) + All services (read)        │
│  Progress ◄── Learning (write) + Gamification (read) │
│  SRS ◄── Reviews (write) + Scheduling (read)         │
│  AI ◄── Chat (write) + Conversation (read)           │
│  Gamification ◄── XP/Streaks (write) + Dashboard (r) │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                    CLIENTS                            │
│                                                       │
│  Web App ◄── Server Components + Client fetch        │
│  Mobile ◄── REST API + local cache + sync            │
│  Admin ◄── Admin API + RBAC                          │
└──────────────────────────────────────────────────────┘
```

### 6.2 Critical Data Flow Paths

| Path | Direction | Volume | Latency Requirement |
|---|---|---|---|
| Dictionary search → results | Read | HIGH | < 200ms |
| SRS review submit → card update | Write | HIGH | < 100ms |
| AI chat → AI provider → response | Read/Write | MEDIUM | < 3s (streaming preferred) |
| ETL import → knowledge tables | Write | BULK | Minutes (background) |
| Progress update → XP award | Write | MEDIUM | < 500ms |
| Mobile sync → server state | Read/Write | VARIABLE | < 5s |

---

## 7. Consumer-Driven API Requirements

### 7.1 Requirements from Web Consumer

| Requirement | Affected Routes | Priority |
|---|---|---|
| Session-based auth | All authenticated routes | HIGH |
| Server Component compatibility | All read routes | HIGH |
| Form validation errors | All write routes | MEDIUM |
| Optimistic updates | SRS review, progress | MEDIUM |
| Real-time feel | AI chat | MEDIUM |

### 7.2 Requirements from Mobile Consumer

| Requirement | Affected Routes | Priority |
|---|---|---|
| Bearer token auth | All authenticated routes | CRITICAL |
| Token refresh endpoint | Auth routes | CRITICAL |
| CORS headers | All routes | CRITICAL |
| Consistent error format | All routes | HIGH |
| Pagination support | All list routes | HIGH |
| Offline sync endpoint | SRS, progress | HIGH |
| Conditional GET (ETag) | Knowledge routes | MEDIUM |
| Response compression | All routes | MEDIUM |

### 7.3 Requirements from Admin Consumer

| Requirement | Affected Routes | Priority |
|---|---|---|
| RBAC enforcement | Admin routes | CRITICAL |
| Bulk operations | ETL, user management | HIGH |
| Analytics queries | Analytics routes | MEDIUM |
| Audit logging | All admin write routes | MEDIUM |

---

## 8. Conclusion

The consumer map reveals:

1. **2 current consumers** — both trivial (health probe + control tower)
2. **4 planned consumer categories** — Web, Mobile, Admin, ETL
3. **Every planned route has at least 1 consumer** — no orphan routes in the API contract
4. **Mobile is the most demanding consumer** — requires CORS, Bearer auth, token refresh, pagination, compression, conditional GET, and sync support
5. **Web consumer benefits from Server Components** — can bypass API for read operations
6. **Admin consumer needs RBAC** — role-based access control is critical
7. **ETL consumer needs API key auth** — separate from user session auth

**Critical Phase 01 decision:** The auth system must support BOTH session cookies (web) AND Bearer tokens (mobile) from day one. This affects the auth library choice (DEC-0005).
