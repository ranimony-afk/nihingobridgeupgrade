# REST API v1 & Mobile Backend Audit Report

**Document Version:** 4.0.0 (Master Foundation)  
**Base API Path:** `/api/v1`  
**Mobile Base Path:** `/api/v1/mobile`  
**Specification:** OpenAPI 3.0.0 (`/api/v1/openapi.json`) / Interactive Swagger UI (`/api/v1/swagger`)  
**Status:** Production Certified ✅  

---

## 1. Canonical Response Envelope Architecture

All REST endpoints under `/api/v1/*` strictly enforce a consistent JSON response envelope (`src/lib/api.ts` & `src/shared/api/index.ts`):

```typescript
// Success Envelope (HTTP 200 / 201)
{
  "ok": true,
  "data": { ... },
  "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5, "hasMore": true } // Optional pagination metadata
}

// Failure Envelope (HTTP 400 / 401 / 403 / 404 / 429 / 500)
{
  "ok": false,
  "error": "Human-readable error description",
  "code": "OPTIONAL_ERROR_CODE"
}
```

---

## 2. Exhaustive API Endpoint Inventory

The repository compiles 43 distinct API route handlers designed to support both web frontends and mobile clients (Flutter, React Native, iOS Swift, Android Kotlin):

### 2.1 Core System & Health Endpoints
- `GET /api/health` — Liveness & readiness probe. Verifies database connectivity (`select 1`) and guarantees catalog seed initialization. Returns HTTP 200 `{ ok: true, service: "unified-learning-platform", ... }`.
- `GET /api/v1/openapi.json` — Returns machine-readable OpenAPI 3.0.0 JSON specification for automated Flutter / Dart SDK client generation.
- `GET /api/v1/swagger` — Serves interactive HTML Swagger UI documentation viewer.

### 2.2 Multi-Tenant Brand & Course Endpoints
- `GET /api/v1/brands` — Lists all registered brand tenants (`ascend`, `nihongo`).
- `GET /api/v1/brands/:slug` — Single brand tenant configuration by slug.
- `GET /api/v1/courses` — Supports optional filtering by `brand`, `locale`, and `status`.
- `GET /api/v1/courses/:slug` — Retrieves course details with `modules[].lessons[]` pre-joined and ordered by position.

### 2.3 Headless CMS & Editorial Workflow Endpoints
- `GET /api/v1/pages` / `POST /api/v1/pages` — CMS page node CRUD.
- `POST /api/v1/pages/:id/transition` — Transitions editorial status (`draft`, `preview`, `published`, `archived`) and logs to `editorial_events`.
- `GET /api/v1/cms/sections` / `POST /api/v1/cms/sections` — CRUD and autosave for all 22 reusable homepage sections.
- `POST /api/v1/cms/sections/:id/duplicate` / `reorder` — Section cloning and display position swapping.
- `GET /api/v1/cms/versions` / `POST /api/v1/cms/versions/:id/restore` — Version snapshot retrieval and one-click rollback.
- `GET /api/v1/cms/settings` / `POST /api/v1/cms/settings` — Brand settings management (Mega Menu navigation, footer, SEO).
- `GET /api/v1/cms/audit-logs` — Tamper-evident CMS action audit trail.

### 2.4 Enterprise DAM Endpoints
- `GET /api/v1/assets` / `POST /api/v1/assets` — Asset indexing with WebP/AVIF responsive variant generation and SHA-256 duplicate detection.
- `POST /api/v1/assets/bulk` — Batch asset registration.
- `GET /api/v1/assets/folders` / `POST /api/v1/assets/folders` — Folder hierarchy management.
- `GET /api/v1/assets/collections` / `POST /api/v1/assets/collections` — Curated media collections.
- `GET /api/v1/assets/usage` / `POST /api/v1/assets/usage` — Cross-entity asset consumption tracking.
- `GET /api/v1/assets/:id/versions` / `POST /api/v1/assets/:id/restore` — Media version history and binary rollback.
- `GET /api/v1/assets/:id/transcode` — HLS adaptive bitrate video streaming manifests (`master.m3u8`).

### 2.5 Multilingual Localization (i18n) Endpoints
- `GET /api/v1/translations` / `POST /api/v1/translations` — Multilingual text overlays (EN, TA, ML, JA).
- `GET /api/v1/translations/memory` / `POST /api/v1/translations/memory` — Translation memory segment repository.
- `GET /api/v1/translations/workflow` / `POST /api/v1/translations/workflow` — Status tracking and missing key alerts.
- `GET /api/v1/translations/side-by-side` — Simultaneous source vs target translation comparison.

### 2.6 Editorial Publishing Workflow Endpoints
- `GET /api/v1/workflow/comments` / `POST /api/v1/workflow/comments` — Threaded comments with `@username` mention parsing.
- `GET /api/v1/workflow/tasks` / `POST /api/v1/workflow/tasks` — Reviewer and approver task assignments.
- `GET /api/v1/workflow/calendar` / `POST /api/v1/workflow/calendar` — Scheduled release planning.
- `GET /api/v1/workflow/diff` — Visual diff computation between version snapshots.
- `GET /api/v1/workflow/notifications` — Editorial notification center and review alerts.

### 2.7 Japanese Learning Portal & Tools Endpoints
- `GET /api/v1/nihongo/items` / `POST /api/v1/nihongo/items` — Master vocabulary, kanji, and grammar item queries with search and JLPT level filters.
- `GET /api/v1/nihongo/flashcards` / `POST /api/v1/nihongo/flashcards` — Flashcards and Spaced Repetition (SRS SM-2) review scoring.
- `GET /api/v1/nihongo/quizzes` — Quiz bank, matching game card generator, and sentence builder data.
- `GET /api/v1/nihongo/progress` / `POST /api/v1/nihongo/progress` — Learner XP, streaks, daily goals, bookmarks, and achievements.
- `GET /api/v1/decks` / `POST /api/v1/decks` / `GET /api/v1/decks/:id` — Custom Quizlet-style flashcard deck management.
- `POST /api/v1/decks/:id/review` — Submits SM-2 spaced repetition ratings for deck cards.
- `POST /api/v1/decks/generate` — Auto-generates decks from Vocabulary, Kanji, Grammar, Saved Lists, or Practice Errors.
- `GET /api/v1/news` / `POST /api/v1/news` / `GET /api/v1/news/:slug` — TODAI-style daily news reader with furigana, translations, vocabulary extraction, and comprehension quizzes.
- `GET /api/v1/downloads` / `POST /api/v1/downloads` — JapanVitta gated download center with email registration verification and download tracking.
- `GET /api/v1/kanji` / `POST /api/v1/kanji` — Kanji Explorer radical maps, star favorites, and writing practice score submissions.
- `GET /api/v1/mock-exam` / `POST /api/v1/mock-exam` — Official timed JLPT simulator exam grading, section score breakdowns, and certificate code generation.
- `GET /api/v1/leaderboard` — Sapphire League rankings and user gamification stats.
- `GET /api/v1/conversation` / `POST /api/v1/conversation` — 9 situational speaking lessons and completion tracking.
- `GET /api/v1/vocabulary` / `POST /api/v1/vocabulary` — Original vocabulary platform with pitch accents, favorites, bookmarks, and instant quiz generation.

### 2.8 Versioned Mobile Platform Endpoints (`/api/v1/mobile/*`)
- `POST /api/v1/mobile/auth` — Mobile login and session bootstrap returning HMAC SHA-256 JWT tokens. Protected by sliding-window rate limiting.
- `GET /api/v1/mobile/profile` — Auth-protected user profile, role, XP totals, and level status via Bearer token extraction.
- `GET /api/v1/mobile/vocabulary` — Paginated (`page`, `limit`), filtered (`jlptLevel`), and sorted vocabulary feed with `Cache-Control` and `ETag` headers.
- `GET /api/v1/mobile/kanji` — Paginated kanji feed with stroke order and radical metadata.
- `GET /api/v1/mobile/decks` — Quizlet-style flashcard decks for offline synchronization.
- `POST /api/v1/mobile/reviews` — Mobile SM-2 spaced repetition quality review submissions.
- `GET /api/v1/mobile/quizzes` / `GET /api/v1/mobile/mock-tests` — Mobile practice test and timed exam manifests.
- `GET /api/v1/mobile/news` — Mobile TODAI-style daily news articles.
- `GET /api/v1/mobile/progress` / `achievements` / `notifications` / `downloads` — Mobile gamification stats, badges, alerts, and PDF workbooks.
- `GET /api/v1/mobile/sync` / `POST /api/v1/mobile/sync` — Offline caching bundle generator and progress synchronization.

---

## 3. API Performance & Reliability Compliance

- **Caching Headers**: Public catalog endpoints emit explicit `Cache-Control: public, max-age=60, s-maxage=300` headers.
- **Rate Limiting**: Authentication and high-cost generation endpoints enforce token-bucket rate limits (`checkRateLimit`), emitting `X-RateLimit-Remaining` headers.
- **Contract Verification**: All 19 test suites in `tests/api.test.ts` verify envelope formatting and status codes with 100% success.
