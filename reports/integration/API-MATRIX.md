# API MATRIX

**Prompt:** 00.1  
Methods taken from `export async function` in each `route.ts`. Auth taken from file body, not comments.

---

## 1. A-local (deployable)

| Method | Path | Auth | Class |
|---|---|---|---|
| GET | `/api/health` | none | KEEP |

Response: `{ ok: true }` after `select 1`; `{ ok: false }` status 500 on error.  
**SHA identical** to GitHub A health route.

---

## 2. A-github `/api/v2` and `/api/ai` (not in local src)

Envelope commonly `{ success, data, meta }` (dictionary search verified).

| Methods | Path | Auth in file | Class |
|---|---|---|---|
| GET | `/api/masterplan` | none | KEEP (control) |
| GET | `/api/v1/tutor/grammar-explain` | none | ADAPT (shim) |
| GET | `/api/v2/dictionary/search` | none | KEEP |
| GET | `/api/v2/dictionary/entries/[id]` | none | KEEP |
| GET, POST | `/api/v2/kanji` | none | KEEP |
| GET | `/api/v2/kanji/[character]` | none | KEEP |
| GET, POST | `/api/v2/grammar` | none | KEEP |
| GET | `/api/v2/grammar/[idOrSlug]` | none | KEEP |
| GET | `/api/v2/knowledge` | none | KEEP |
| GET, POST | `/api/v2/courses` | none | KEEP |
| GET, PUT, DELETE | `/api/v2/courses/[id]` | none | KEEP |
| GET | `/api/v2/lessons/[id]` | none | KEEP |
| GET | `/api/v2/lessons/[id]/play` | none | KEEP |
| POST | `/api/v2/lessons/[id]/submit` | none | KEEP (needs auth later) |
| GET, POST | `/api/v2/quiz/generate` | none | KEEP |
| GET, POST | `/api/v2/jlpt` | none | KEEP |
| GET, POST | `/api/v2/tests` | none | KEEP |
| GET, POST | `/api/v2/listening` | none | KEEP |
| GET, POST | `/api/v2/vocabulary` | none | KEEP |
| GET, POST | `/api/v2/progress` | none | KEEP (needs auth later) |
| GET, POST | `/api/v2/srs` | none | KEEP |
| POST | `/api/v2/srs/review` | none | KEEP (needs auth later) |
| GET, POST | `/api/v2/srs/sync` | none | KEEP |
| GET, POST | `/api/v2/xp` | none | KEEP |
| GET, POST | `/api/v2/streaks` | none | KEEP |
| GET, POST | `/api/v2/achievements` | none | KEEP |
| GET | `/api/v2/audio/tts` | none | UNVERIFIED provider |
| POST | `/api/ai/chat` | none | KEEP |
| GET, POST | `/api/ai/tutor` | none | KEEP |
| GET | `/api/ai/explain/grammar/[id]` | none | KEEP |

No `/api/auth/*`, `/api/admin/*`, `/api/mobile/*` on A.

---

## 3. B api (unversioned)

| Methods | Path | Auth / extras | Class vs A |
|---|---|---|---|
| GET | `/api/dictionary/search` | rate limit, cache, Meili/SQL | ADAPT → already have `/api/v2/dictionary/search` |
| GET | `/api/dictionary/autocomplete` | | INTEGRATE (missing on A) |
| POST | `/api/dictionary/bulk` | | INTEGRATE |
| GET | `/api/dictionary/random` | | INTEGRATE |
| GET | `/api/dictionary/[id]` | | ADAPT → entries/[id] |
| GET | `/api/kanji/search` | | ADAPT |
| GET | `/api/kanji/level/[level]` | | INTEGRATE |
| GET | `/api/kanji/by-radical/[radical]` | | INTEGRATE |
| GET | `/api/kanji/[character]` | | ADAPT |
| GET | `/api/kanji/[character]/quiz` | | INTEGRATE |
| GET | `/api/grammar/search` | | ADAPT |
| GET | `/api/grammar/level/[level]` | | INTEGRATE |
| GET | `/api/grammar/[id]` | | ADAPT |
| GET | `/api/grammar/[id]/quiz` | | INTEGRATE |
| GET | `/api/search` | Meilisearch | DEPRECATE |
| POST | `/api/srs/add` | JWT | ADAPT |
| GET | `/api/srs/due` | JWT | ADAPT |
| POST | `/api/srs/review` | JWT | ADAPT |
| GET | `/api/srs/stats/[userId]` | path userId | DEPRECATE path-id pattern |
| POST | `/api/tests/start` | | INTEGRATE session machine |
| GET/POST | `/api/tests/session/[sessionId]/*` | | INTEGRATE |
| GET | `/api/tests/history` | | INTEGRATE |
| GET | `/api/tests/analytics/[userId]` | | ADAPT |
| GET | `/api/tests/[testId]/questions` | | ADAPT |
| POST | `/api/listening/generate` | | ADAPT |
| GET | `/api/listening/[questionId]/audio` | | ADAPT |
| GET/POST/DELETE | `/api/user/[userId]/bookmark(s)` | path userId | ADAPT to session identity |
| GET | `/api/user/[userId]/dashboard` | path userId | ADAPT |

---

## 4. B AI / admin

| Methods | Path | Class |
|---|---|---|
| POST | `/api/ai/tutor/chat` | ADAPT into A's `/api/ai/*` |
| POST | `/api/ai/grammar-explain` | ADAPT |
| POST | `/api/ai/translate` | INTEGRATE later |
| POST | `/api/ai/generate-questions` | INTEGRATE later |
| (none) | `/api/ai/tutor` | IGNORE (no HTTP export) |
| GET | `/api/admin/dashboard` | INTEGRATE later |
| POST | `/api/admin/etl/run` | INTEGRATE later |
| GET | `/api/admin/etl/stream` | INTEGRATE later |
| POST | `/api/admin/ai/generate` | INTEGRATE later |
| POST | `/api/admin/audit` | INTEGRATE later |

---

## 5. B search service (Fastify, not Next)

| Method | Path | Class |
|---|---|---|
| GET | `/health` | IGNORE (A has `/api/health`) |
| GET | `/autocomplete` | ADAPT as Next `/api/v2/dictionary/autocomplete` using SQL |
| GET | `/search` | DEPRECATE Meili |

---

## 6. Flutter expected vs actual

From `nihongobridge-mobile/lib/core/api/api_endpoints.dart`:

| Client path | Exists on B API? | Exists on A? |
|---|---|---|
| `/api/dictionary/search` | yes | A has `/api/v2/dictionary/search` |
| `/api/kanji/search` | yes | A has `/api/v2/kanji` |
| `/api/srs/due` | yes | A has `/api/v2/srs` |
| `/api/srs/review` | yes | A has `/api/v2/srs/review` |
| `/api/tests/start` | yes | A has `/api/v2/tests` (shape **UNVERIFIED** match) |
| `/api/ai/tutor/chat` | B AI app, not B API | A has `/api/ai/tutor` |
| `/api/mobile/bootstrap/dictionary` | **NO** | **NO** — UNVERIFIED gap |
| `/api/mobile/sync` | **NO** | A has `/api/v2/srs/sync` only |

---

## 7. Consumer map

```
A-local: platform healthcheck, homepage select 1
A-github: no learner web; control tower + docs
B-web: api-client + demo fallback
B-mobile: api_endpoints.dart (partially unmatched)
B-admin: own /api/admin
B-ai: own /api/ai + calls B dictionary search as tool
```

**Compatibility lock:** `GET /api/health` JSON `{ ok: true }` must remain.

**Do not mount** B unversioned `/api/dictionary` next to A `/api/v2/dictionary` (duplicate systems).
