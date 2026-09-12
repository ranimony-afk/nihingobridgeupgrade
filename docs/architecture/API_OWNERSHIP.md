# API OWNERSHIP

**Version:** 1.0 — Frozen with `ARCHITECTURE_FREEZE.md` v3.0  
**Date:** 2026-03-25  
**Surface:** one HTTP API, served by Repository A's Next.js App Router  
**Clients:** web (same origin), Flutter (cross origin), admin (same origin, RBAC)

---

## 1. Namespace map (frozen)

| Namespace | Owner | Auth | Stability |
|---|---|---|---|
| `/api/health` | Platform | public | **frozen contract** |
| `/api/auth/*` | Identity | mixed | stable from Phase 01 |
| `/api/v2/*` | Domain services | read public / write authenticated | stable, versioned |
| `/api/ai/*` | AI | authenticated + rate-limited | stable |
| `/api/admin/*` | Admin | RBAC | internal |
| `/api/v1/*` | legacy shims only | as-is | **closed** — no new routes |

Repository B's unversioned `/api/dictionary`, `/api/kanji`, `/api/srs`, `/api/tests`, `/api/user/...` are **not** mounted. Their capabilities are re-expressed under `/api/v2`.

---

## 2. Frozen response contract

Success:

```json
{ "success": true, "data": <payload>, "meta": { "page": 1, "pageSize": 20, "total": 0 } }
```

Error:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] } }
```

| Rule | Value |
|---|---|
| Envelope | A's `{ success, data, meta }` wins over B's `{ data, meta, error }` |
| Status codes | 200/201, 400, 401, 403, 404, 409, 422, 429, 500 |
| Pagination | `page` + `pageSize` (max 100), `total` in `meta` |
| Errors | machine-readable `code`; never leak SQL, stack traces, or provider messages |
| Dates | ISO-8601 UTC |
| JLPT over the wire | integer `5`…`1`; `"N5"` strings only in display layers |
| Content type | `application/json` (SSE permitted for admin log streams) |

---

## 3. Route ownership

### 3.1 Platform

| Method | Path | Owner | Notes |
|---|---|---|---|
| GET | `/api/health` | Platform | `{ ok: true }` after `select 1`. **Shape may never change** |

This is the one endpoint whose body is exempt from the standard envelope, because it is already depended upon.

### 3.2 Identity (Phase 01)

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/register` | public |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | session |
| GET | `/api/auth/session` | session |
| POST | `/api/auth/token/refresh` | refresh token (Flutter) |

Identity is resolved from the session or Bearer token **only**. A `userId` in a path or body is never authorization.

### 3.3 Knowledge

| Method | Path | Auth | Source |
|---|---|---|---|
| GET | `/api/v2/dictionary/search` | public | A (exists) |
| GET | `/api/v2/dictionary/entries/{id}` | public | A (exists) |
| GET | `/api/v2/dictionary/autocomplete` | public | **new**, adapted from B |
| POST | `/api/v2/dictionary/bulk` | public/limited | adapted from B |
| GET | `/api/v2/dictionary/random` | public | adapted from B |
| GET | `/api/v2/kanji` | public | A (exists) — gains `level`, `radical` filters |
| GET | `/api/v2/kanji/{character}` | public | A (exists) |
| GET | `/api/v2/grammar` | public | A (exists) — gains `level` filter |
| GET | `/api/v2/grammar/{idOrSlug}` | public | A (exists) |
| GET | `/api/v2/knowledge` | public | A (exists) |

Writes to knowledge move to `/api/admin/*` (they are editorial actions, not learner actions).

### 3.4 Learning

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v2/courses`, `/api/v2/courses/{id}` | public |
| POST/PUT/DELETE | `/api/v2/courses…` | **admin** (migrating off public) |
| GET | `/api/v2/lessons/{id}`, `/{id}/play` | public/session |
| POST | `/api/v2/lessons/{id}/submit` | **learner** |
| GET/POST | `/api/v2/quiz/generate` | session |
| GET | `/api/v2/vocabulary` | public |
| POST | `/api/v2/vocabulary` | **learner** |

### 3.5 Assessment / JLPT

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v2/jlpt` | public |
| POST | `/api/v2/jlpt` | learner (readiness, mock test) |
| GET | `/api/v2/tests` | public |
| POST | `/api/v2/tests` | learner (start) |
| POST | `/api/v2/tests/sessions/{id}/answer` | learner — **new**, adapted from B |
| POST | `/api/v2/tests/sessions/{id}/complete` | learner — **new** |
| GET | `/api/v2/tests/sessions/{id}/review` | learner — **new** |
| GET | `/api/v2/listening` | public |

Scoring is server-side. A client-submitted score is ignored.

### 3.6 SRS

| Method | Path | Auth |
|---|---|---|
| GET/POST | `/api/v2/srs` | learner |
| POST | `/api/v2/srs/review` | learner |
| GET/POST | `/api/v2/srs/sync` | learner (Flutter) |

Clients submit **ratings**, never due dates. The server returns authoritative scheduling.

### 3.7 Progress and gamification

| Method | Path | Auth |
|---|---|---|
| GET/POST | `/api/v2/progress` | learner |
| GET/POST | `/api/v2/xp` | learner |
| GET/POST | `/api/v2/streaks` | learner |
| GET/POST | `/api/v2/achievements` | learner |

XP mutations must be idempotent per source event.

### 3.8 Mobile support (new work)

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/api/v2/mobile/bootstrap` | learner | **does not exist in either repo** |
| POST | `/api/v2/mobile/sync` | learner | **does not exist**; `/api/v2/srs/sync` covers SRS only |

Flutter's `api_endpoints.dart` references `/api/mobile/bootstrap/dictionary` and `/api/mobile/sync`. These are frozen as **A-native new endpoints**, not ports.

### 3.9 AI

| Method | Path | Auth |
|---|---|---|
| POST | `/api/ai/chat` | learner + rate limit |
| GET/POST | `/api/ai/tutor` | learner + rate limit |
| GET | `/api/ai/explain/grammar/{id}` | learner + cache |
| POST | `/api/ai/correct` | learner — future |

AI endpoints must ground in Knowledge before generating.

### 3.10 Admin

| Method | Path | Role |
|---|---|---|
| GET | `/api/admin/dashboard` | admin |
| POST/PUT/DELETE | `/api/admin/knowledge/*` | content_editor+ |
| POST | `/api/admin/reviews/*` | reviewer+ |
| POST | `/api/admin/etl/run` | admin |
| GET | `/api/admin/etl/stream` | admin (SSE) |
| GET | `/api/admin/audit` | admin |

Roles come from the server session. **Inbound `x-admin-role` / `x-admin-user-id` headers are rejected** (B's pattern is banned).

---

## 4. Authorization matrix

| Class | Anonymous | Learner | Editor | Admin |
|---|---|---|---|---|
| Knowledge read | ✅ | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ |
| Own progress/SRS/XP | ❌ | ✅ | ✅ | ✅ |
| Another user's data | ❌ | ❌ | ❌ | audited |
| Knowledge write | ❌ | ❌ | ✅ | ✅ |
| ETL trigger | ❌ | ❌ | ❌ | ✅ |
| AI tutor | ❌ | ✅ | ✅ | ✅ |

Rule: a learner-scoped request derives its subject from the session. `/api/v2/...?learnerId=` is **not** an authorization mechanism.

---

## 5. Cross-cutting requirements

| Concern | Rule |
|---|---|
| Validation | schema-validated input at the boundary; reject unknown critical params |
| Rate limiting | required on AI, auth, and search; pluggable store (in-memory default) |
| Caching | public knowledge cacheable with ETag/`Cache-Control`; learner data `private, no-store` |
| CORS | same-origin by default; explicit allowlist for the Flutter origin |
| Security headers | set centrally in `src/middleware.ts` |
| Idempotency | mutating learner endpoints accept an idempotency key where replays are possible |
| Logging | never log tokens, passwords, or full prompts with PII |
| Errors | typed codes; 500 bodies carry no internals |

---

## 6. Versioning policy

| Change | Allowed in `/api/v2`? |
|---|---|
| Add an endpoint | ✅ |
| Add an optional field | ✅ |
| Add an optional query param | ✅ |
| Rename/remove a field | ❌ → `/api/v3` |
| Change a type or semantic | ❌ → `/api/v3` |
| Tighten auth on a route | ✅ (security fix, documented) |

`/api/v1` is closed: existing shims only, no additions.

---

## 7. Client contract

| Client | Consumes | Must not |
|---|---|---|
| Web | `/api/v2`, `/api/ai`, `/api/auth`, server components | grade, schedule, or score locally |
| Flutter | `/api/v2`, `/api/ai`, `/api/auth`, `/api/v2/mobile/*` | duplicate business rules; compute due dates |
| Admin UI | `/api/admin`, `/api/v2` reads | bypass RBAC via headers |

Both clients use the **same** contracts. Any client-specific behaviour belongs in presentation, not in a parallel API.

---

## 8. Deprecated / rejected API patterns

| Pattern | Origin | Status |
|---|---|---|
| Unversioned `/api/dictionary`, `/api/kanji`, `/api/grammar`, `/api/srs`, `/api/tests` | B api | rejected |
| `/api/user/{userId}/…` path-based authorization | B api | rejected |
| `{ data, meta, error }` envelope | B api | rejected |
| Standalone Fastify `/autocomplete`, `/search` | B search | deprecated → `/api/v2/dictionary/autocomplete` |
| `X-Search-Engine: meilisearch` | B api | deprecated (engine is PostgreSQL) |
| Separate origins for AI and admin | B ai/admin | rejected — merged into A |
| Header-injected admin identity | B admin | rejected |
| Demo/bypass auth switches | B api/admin | rejected |
