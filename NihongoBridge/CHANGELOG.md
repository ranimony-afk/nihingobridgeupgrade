# Changelog

All notable changes to the Nihongo Bridge Unified Learning Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.0.0] - 2026-07-27

### Added
- Integrated **11 unified dashboard managers** under the dynamic, multi-tenant Headless CMS Admin overview workspace (`/admin/nihongo`), with live, dynamic query search filters.
- Launched the **KANJI60 Semantic Mindmap Tree View** as the default landing view inside the interactive Kanji Explorer (`/kanji`), grouping exactly 64 iconic N5-N4 characters.
- Programmed a dynamic, on-the-fly **Takoboto-Style Japanese Dictionary Search Engine** `/dictionary` simulating access to 250,000+ words and 13,000+ kanji characters, with special hand-crafted idioms and onomatopoeia collection tags.
- Programmed native multicharacter speak explanations inside the **Conversation Dialogue Lab** (`/nihongo/conversation`), translating grammar notes and vocabulary definitions across English, Tamil, Malayalam, Vietnamese, Thai, Korean, and Chinese.
- Engineered 3 segment-specific active **Section Timers** (Vocabulary, Grammar, Reading) and a computerized adaptive testing (**Adaptive CAT Mode**) engine inside the graded Exam Simulator (`/jlpt/mock-exam`).
- Embedded NHK Easy audio shadowers, reading speed speedometer, dictionary lookups, and team discussion forums in dynamic daily articles (`/news/[slug]`).
- Programmed a dedicated, GDPR-compliant **Cookie Consent Banner** and privacy overlay choice-tracker.
- Programmed alternate **hreflang headers** for multilingual SEO crawl indexing across English, Tamil, Malayalam, and Japanese.
- Drafted a dynamic, database-driven XML RSS Feed at `/news/feed.xml`.
- Programmed 7 new multi-vector automated test suites inside `tests/enterprise.test.ts` verifying Accessibility, E2E Student Workflows, security signature checkers, and state-machine transitions.

### Changed
- Converted all hardcoded public hero sections to fully dynamic, CMS-managed components.
- Modularized global header navigation links and footers to load dynamically from `brand_settings` inside PostgreSQL.
- Overhauled dynamic dynamic catch-all route at `src/app/[brand]/[slug]/page.tsx` to serve custom sub-pages (About, Vision, Mission, etc.) directly from PostgreSQL.

### Fixed
- Fixed unescaped double-quoted straight single quote `'` in `schema.ts` causing database migration SQL syntax errors near `"s"`.
- Resolved build-crashing evaluation checks for missing `DATABASE_URL` in `src/db/index.ts` and missing secrets in `src/shared/mobile/index.ts` during Next.js builds.
