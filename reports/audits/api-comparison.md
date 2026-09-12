# PHASE 00 — API Route Comparison

**Date:** 2026-03-25

---

## 1. Local sandbox (deployable now)

| Method | Path | Auth | Shape | Classification |
|---|---|---|---|---|
| GET | `/api/health` | none | `{ ok: true }` after `select 1`; 500 `{ ok: false }` | KEEP — regression lock |

No other routes.

---

## 2. GitHub A (canonical API candidate)

Prefix strategy matches target architecture: `/api/v2/*` domain, `/api/ai/*` tutor, `/api/health` infra.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | none | KEEP |
| GET | `/api/masterplan` | none | Control tower |
| GET | `/api/v1/tutor/grammar-explain` | none | v1 leftover |
| GET | `/api/v2/dictionary/search` | none | `q,mode,jlpt,common,page,pageSize` → DictionaryService |
| GET | `/api/v2/dictionary/entries/[id]` | none | Detail |
| GET, POST | `/api/v2/kanji` | none | List/create |
| GET | `/api/v2/kanji/[character]` | none | Detail |
| GET, POST | `/api/v2/grammar` | none | List/create |
| GET | `/api/v2/grammar/[idOrSlug]` | none | Detail |
| GET | `/api/v2/knowledge` | none | Aggregate |
| GET, POST | `/api/v2/courses` | none | |
| GET, PUT, DELETE | `/api/v2/courses/[id]` | none | |
| GET | `/api/v2/lessons/[id]` | none | |
| GET | `/api/v2/lessons/[id]/play` | none | |
| POST | `/api/v2/lessons/[id]/submit` | none | Mutating |
| GET, POST | `/api/v2/quiz/generate` | none | |
| GET, POST | `/api/v2/jlpt` | none | |
| GET, POST | `/api/v2/tests` | none | |
| GET, POST | `/api/v2/listening` | none | |
| GET, POST | `/api/v2/vocabulary` | none | |
| GET, POST | `/api/v2/progress` | none | Mutating |
| GET, POST | `/api/v2/srs` | none | |
| POST | `/api/v2/srs/review` | none | Mutating |
| GET, POST | `/api/v2/srs/sync` | none | Mobile |
| GET, POST | `/api/v2/xp` | none | Mutating |
| GET, POST | `/api/v2/streaks` | none | Mutating |
| GET, POST | `/api/v2/achievements` | none | |
| GET | `/api/v2/audio/tts` | none | |
| POST | `/api/ai/chat` | none | |
| GET, POST | `/api/ai/tutor` | none | |
| GET | `/api/ai/explain/grammar/[id]` | none | |

**Evidence:** dictionary search imports `DictionaryService` from `@/services/knowledge/dictionary` and returns `{ success, data, meta }`.

**Gap:** no `/api/auth/*`, no `/api/admin/*`, no middleware.

---

## 3. Repo B APIs (three Next 14 apps)

### nihongobridge-api (unversioned `/api/...`)

Dictionary: `GET /api/dictionary/search|autocomplete|random|[id]`, `POST /api/dictionary/bulk`  
Kanji: `GET /api/kanji/search|level/[level]|by-radical/[radical]|[character]|[character]/quiz`  
Grammar: `GET /api/grammar/search|level/[level]|[id]|[id]/quiz`  
Search: `GET /api/search` (Meilisearch)  
SRS: `POST /api/srs/add`, `GET /api/srs/due`, `POST /api/srs/review`, `GET /api/srs/stats/[userId]`  
Tests: `POST /api/tests/start`, session get/answer/complete/review, history, analytics  
User: bookmarks + dashboard (path includes `:userId`)  
Listening: generate + audio

Auth: `jose` Supabase JWT on mutating/user routes (plus insecure header in non-prod).

### nihongobridge-ai

`POST /api/ai/tutor/chat`, `POST /api/ai/grammar-explain`, `POST /api/ai/translate`, `POST /api/ai/generate-questions`  
`app/api/ai/tutor/route.ts` exports no HTTP method (empty/placeholder).

### nihongobridge-admin

`GET /api/admin/dashboard`, `POST /api/admin/etl/run`, `GET /api/admin/etl/stream`, `POST /api/admin/ai/generate`, `POST /api/admin/audit`

---

## 4. Conflicts / overlaps

| Concern | A | B | Resolution |
|---|---|---|---|
| Dictionary search | `GET /api/v2/dictionary/search` | `GET /api/dictionary/search` | KEEP A path; adapt B query params if useful |
| Kanji detail | `/api/v2/kanji/[character]` | `/api/kanji/[character]` | KEEP A |
| Grammar | `/api/v2/grammar/...` | `/api/grammar/...` | KEEP A |
| SRS review | `POST /api/v2/srs/review` | `POST /api/srs/review` | KEEP A; merge algorithm ideas |
| AI tutor | `/api/ai/tutor` | `/api/ai/tutor/chat` | KEEP A namespace; merge chat body schema later |
| Global search | none (dict uses SQL) | `/api/search` + Meili | Do not add Meili in v1 |
| User id in path | learnerId in body/query | `/api/user/[userId]/...` | Prefer session identity; never trust path userId |
| Unversioned B routes | — | `/api/dictionary` etc. | Do not mount B routes alongside A |

---

## 5. Consumer map

```
Local sandbox
  └── GET /api/health          ← platform healthcheck, homepage

GitHub A (once ported)
  ├── Web (future App Router pages) → /api/v2/*, /api/ai/*
  ├── Flutter (Repo B mobile)       → must be retargeted to /api/v2 + /api/v2/srs/sync
  ├── Control tower UI              → /api/masterplan, /docs
  └── None of the routes are cookie/Bearer gated

Repo B today
  ├── nihongobridge-web api-client → unversioned /api/*
  ├── Flutter api_endpoints.dart   → unversioned /api/*
  └── Admin / AI                   → own Next apps
```

**Backward compatibility requirement:** `GET /api/health` JSON `{ ok: true }` must not change.

**Flutter:** Repo B mobile is the only existing native client. Phase 08 retargets it. Do not keep B's unversioned API as a second public surface.

---

## 6. Recommendation

- One API surface: GitHub A's `/api/v2` + `/api/ai` + `/api/health`.
- Do not deploy Repo B Next apps.
- Port useful B endpoints as **new** `/api/v2` routes when missing (autocomplete, by-radical, test session state machine) in later phases.
- Reserve `/api/v1` only as explicit compatibility shims.
- Add `/api/auth/*` in Phase 01 (auth), not by copying B.
