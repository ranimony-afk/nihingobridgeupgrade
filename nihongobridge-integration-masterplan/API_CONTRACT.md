# API CONTRACT — NihongoBridge

**Version:** 2.0 — Architecture Freeze
**Date:** 2025-07-16
**Phase:** Phase 01 — Architecture Freeze (informed by Phase 00 audit)
**Status:** FROZEN — Changes require DEC-NNNN decision entry

---

## 1. Audit-Informed Context

Phase 00 API forensic audit (api-inventory.md) confirmed:
- 2 routes exist: `GET /api/health` (KEEP) and `GET /api/masterplan` (ARCHIVE)
- 0 v1 routes — `/api/v1/` is reserved but empty
- 0 authenticated routes — auth must be built first
- 59+ routes to build across Phases 01–09
- 4 consumer types: Web (session cookie), Mobile/Flutter (Bearer token), Admin (RBAC), ETL (API key)

---

## 2. Versioning Strategy

| Namespace | Purpose | Auth | Status |
|---|---|---|---|
| `/api/health` | Infrastructure health check | None | ✅ EXISTS — KEEP |
| `/api/auth/*` | Authentication flows | Mixed | Phase 01 |
| `/api/v2/*` | All domain endpoints | Per-route | Phase 01+ |
| `/api/ai/*` | AI tutor services | Required | Phase 06 |
| `/api/admin/*` | Administration | Admin role | Phase 04+ |
| `/api/v1/*` | **RESERVED** — empty until Repo B audit reveals existing contracts | — | — |

### Why v2, Not v1

Phase 00 audit confirmed zero v1 routes exist. New routes go directly into `/api/v2/` because:
1. If Repo B reveals v1 contracts, those will be preserved under `/api/v1/`
2. Starting at v2 avoids version collision
3. If no Repo B v1 routes exist, v1 remains unused — no harm done

---

## 3. Standard Response Envelope

Every API response (except `/api/health`) follows this format.

### Success (200, 201)
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

`meta` is included only on paginated list endpoints. Non-list endpoints omit it.

### Error (4xx, 5xx)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": { "field": "email", "issue": "already exists" }
  }
}
```

### Error Code Registry

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/params fail Zod validation |
| `UNAUTHORIZED` | 401 | No valid session/token |
| `FORBIDDEN` | 403 | Valid session but insufficient role |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate resource (e.g., email taken) |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error (details omitted in prod) |

### Health Check (Exception)

`GET /api/health` returns `{ ok: true }` / `{ ok: false }` — this is a platform contract and does NOT follow the standard envelope.

---

## 4. Authentication

### 4.1 Auth Modes

| Mode | Mechanism | Consumer | Header |
|---|---|---|---|
| Session | httpOnly cookie | Web app | Cookie (automatic) |
| Bearer | Token in header | Mobile, scripts | `Authorization: Bearer <token>` |
| API Key | Key in header | ETL, integrations | `X-API-Key: <key>` |
| None | Public | Health check, public search | — |

### 4.2 Auth Endpoints (Phase 01)

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Create account | None |
| POST | `/api/auth/login` | Login (returns session + token) | None |
| POST | `/api/auth/logout` | End session | Required |
| GET | `/api/auth/me` | Current user profile | Required |
| POST | `/api/auth/refresh` | Refresh Bearer token | Bearer |

### 4.3 RBAC

| Role | Access |
|---|---|
| `user` | All v2 endpoints, AI endpoints, own data only |
| `editor` | User access + content publish/review |
| `admin` | Editor access + admin endpoints + all user data |

---

## 5. Pagination

All list endpoints support:

| Parameter | Type | Default | Max | In |
|---|---|---|---|---|
| `page` | integer | 1 | — | query |
| `pageSize` | integer | 20 | 100 | query |

Response includes `meta` with `page`, `pageSize`, `total`, `totalPages`.

---

## 6. Rate Limiting

| Tier | Limit | Window | Applied To |
|---|---|---|---|
| Public | 60 req | per minute per IP | Unauthenticated routes |
| Authenticated | 300 req | per minute per user | Authenticated routes |
| AI | 30 req | per minute per user | `/api/ai/*` |
| Admin | 120 req | per minute per user | `/api/admin/*` |

Rate limit headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

## 7. Endpoint Catalog

### 7.1 Knowledge — Dictionary

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/dictionary/search` | Optional | Search entries by headword, reading, or meaning | 03 |
| GET | `/api/v2/dictionary/entries/[id]` | Optional | Get single entry with senses, readings, kanji forms | 03 |
| GET | `/api/v2/dictionary/entries/[id]/examples` | Optional | Get example sentences for entry | 03 |

**Search query params:** `q` (string), `lang` (string, default "en"), `jlpt` (1–5), `common` (boolean), `page`, `pageSize`

### 7.2 Knowledge — Kanji

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/kanji/search` | Optional | Search kanji by reading, meaning, stroke count | 03 |
| GET | `/api/v2/kanji/[character]` | Optional | Get kanji details | 03 |
| GET | `/api/v2/kanji/[character]/words` | Optional | Dictionary entries containing this kanji | 03 |
| GET | `/api/v2/kanji/by-radical/[radicalId]` | Optional | Kanji with this radical | 03 |
| GET | `/api/v2/kanji/by-jlpt/[level]` | Optional | Kanji at JLPT level | 03 |

### 7.3 Knowledge — Grammar

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/grammar/search` | Optional | Search grammar points | 03 |
| GET | `/api/v2/grammar/[id]` | Optional | Get grammar point with examples | 03 |
| GET | `/api/v2/grammar/by-jlpt/[level]` | Optional | Grammar at JLPT level | 03 |

### 7.4 Knowledge — Radicals

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/radicals` | Optional | List all radicals | 03 |
| GET | `/api/v2/radicals/[id]` | Optional | Get radical + kanji using it | 03 |

### 7.5 Learning — Courses

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/courses` | Required | List published courses | 04 |
| GET | `/api/v2/courses/[id]` | Required | Get course with modules | 04 |
| POST | `/api/v2/courses/[id]/enroll` | Required | Enroll in course | 04 |

### 7.6 Learning — Lessons

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/lessons/[id]` | Required | Get lesson content | 04 |
| POST | `/api/v2/lessons/[id]/complete` | Required | Mark lesson complete | 04 |
| POST | `/api/v2/lessons/[id]/submit` | Required | Submit quiz answers | 04 |

### 7.7 Learning — Progress

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/progress` | Required | Get all user progress | 04 |
| GET | `/api/v2/progress/courses/[courseId]` | Required | Progress for one course | 04 |
| GET | `/api/v2/progress/stats` | Required | Aggregate learning stats | 04 |

### 7.8 SRS

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/srs/decks` | Required | List user's decks | 05 |
| POST | `/api/v2/srs/decks` | Required | Create deck | 05 |
| GET | `/api/v2/srs/decks/[id]` | Required | Get deck details | 05 |
| PUT | `/api/v2/srs/decks/[id]` | Required | Update deck | 05 |
| DELETE | `/api/v2/srs/decks/[id]` | Required | Delete deck | 05 |
| GET | `/api/v2/srs/decks/[id]/cards` | Required | List cards in deck | 05 |
| POST | `/api/v2/srs/decks/[id]/cards` | Required | Add card to deck | 05 |
| GET | `/api/v2/srs/decks/[id]/due` | Required | Get due cards for review | 05 |
| POST | `/api/v2/srs/review` | Required | Submit review result | 05 |
| GET | `/api/v2/srs/stats` | Required | SRS statistics | 05 |

### 7.9 Gamification

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/v2/gamification/xp` | Required | User XP and level | 07 |
| GET | `/api/v2/gamification/streak` | Required | Current/longest streak | 07 |
| GET | `/api/v2/gamification/achievements` | Required | All achievements + unlock status | 07 |
| GET | `/api/v2/gamification/leaderboard` | Required | Top users by XP | 07 |

### 7.10 AI

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| POST | `/api/ai/chat` | Required | Send message, get AI response | 06 |
| GET | `/api/ai/conversations` | Required | List user's conversations | 06 |
| GET | `/api/ai/conversations/[id]` | Required | Get conversation messages | 06 |
| POST | `/api/ai/explain/grammar/[id]` | Required | AI grammar explanation | 06 |
| POST | `/api/ai/explain/vocabulary/[id]` | Required | AI vocabulary explanation | 06 |
| POST | `/api/ai/translate` | Required | Translate text | 06 |
| POST | `/api/ai/correct` | Required | Correct Japanese text | 06 |

### 7.11 Admin

| Method | Path | Auth | Description | Phase |
|---|---|---|---|---|
| GET | `/api/admin/users` | Admin | List all users | 04+ |
| GET | `/api/admin/analytics` | Admin | Platform analytics | 09 |
| POST | `/api/admin/etl/import` | Admin | Trigger ETL import | 02 |
| GET | `/api/admin/etl/jobs` | Admin | List ETL jobs | 02 |
| POST | `/api/admin/content/publish` | Editor | Publish content | 04+ |
| GET | `/api/admin/content/review` | Editor | Content review queue | 04+ |

---

## 8. Request Validation

Every POST/PUT/PATCH endpoint validates the request body using Zod schemas.

**Pattern:**
```typescript
import { z } from "zod";

const CreateDeckSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().default(false),
  newCardsPerDay: z.number().int().min(1).max(100).default(20),
});
```

Validation errors return `VALIDATION_ERROR` with field-level details.

---

## 9. CORS Policy

Configured in `next.config.ts`:

| Header | Value |
|---|---|
| `Access-Control-Allow-Origin` | `ALLOWED_ORIGINS` env var (comma-separated) |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization, X-API-Key` |
| `Access-Control-Max-Age` | `86400` (24 hours) |

---

## 10. Backward Compatibility Contract

| Route | Contract | Breaking Change Allowed? |
|---|---|---|
| `GET /api/health` | `{ ok: boolean }` + 200/500 | **NO** — infrastructure contract |
| Everything in `/api/v2/*` | This document | Only via versioned migration |
| Everything in `/api/v1/*` | TBD (Repo B audit) | **NO** — if routes are discovered |
