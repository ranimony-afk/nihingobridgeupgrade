# Release Notes

## v5.1.0 — Roadmap Phase 1: Complete Headless CMS

**Highlights**
- New **Admin Dashboard** (`/admin`) — every visible section of both brands is
  editable: hero, featured courses, JLPT sections, daily vocabulary & kanji,
  news, downloads, testimonials, contact, social links, CTA banners.
- New Nihongo Bridge CMS pages: `/nihongo/study-japan`, `/nihongo/jobs`,
  `/nihongo/conversation` — composed entirely of reusable CMS sections.
- Reusable section registry (`SECTION_TYPES`) and one shared renderer
  (`CmsSection`) consumed by live pages, preview, and editor.
- Lifecycle: Draft → Preview → Published → Archived with version history,
  restore, reorder, and duplicate from the dashboard.
- No UI redesign, no route changes; existing branding preserved.

## v5.0.0 — Enterprise Platform Completion (Phases 1–10)

- Unified backend: CMS, i18n (EN/TA/ML/JA), DAM, editorial workflow, LMS,
  mobile REST APIs (JWT, pagination, rate limiting, OpenAPI/Swagger).
- Comprehensive enterprise audit docs in `/docs`.

## v1.0.0 — Unified Backend, Phase 1

**Highlights**
- One Next.js + PostgreSQL backend now powers **Ascend Academy** and
  **Nihongo Bridge**.
- New public **REST API v1** at `/api/v1/*` (brands, pages, courses,
  assets, translations, editorial transitions).
- **CMS** with editorial workflow (`draft → in_review → published →
  archived`) and full audit trail in `editorial_events`.
- **LMS** with courses → modules → lessons and ordered playback.
- **DAM** with `assets` referenceable by pages, courses, lessons.
- **Multilingual** via a locale-overlay `translations` table.
- **Brand-aware web UI** at `/`, `/ascend`, `/nihongo`,
  `/[brand]/courses/[slug]`.
- **Idempotent seed** — safe to call on every cold start.
- **Automated tests** (`npm test`) covering API helpers, brand
  registry, and editorial workflow guardrails.

**Backwards compatibility**
- `/api/health` still returns `{ ok: true }` (now with extra metadata).
- `src/db/index.ts` unchanged — existing consumers keep working.
- No columns were dropped or renamed; all schema changes are additive.

**Migrations**
- Applied via `npx drizzle-kit push` after `build_and_start`.

## Roadmap (future phases)
- Phase 2 — AuthN/AuthZ, learner progress tracking, quizzes.
- Phase 3 — Marketplace (paid courses, coupons).
- Phase 4 — Community (threads, replies, moderation).
- Phase 5 — AI Tutor microservice consuming `/api/v1/courses/*`.
- Phase 6 — Native Android + iOS clients (same REST API).
