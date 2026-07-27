# Nihongo Bridge — Japanese Learning Platform

**Development focus: Nihongo Bridge only.**

Nihongo Bridge is a comprehensive Japanese learning platform running on a
unified Next.js + PostgreSQL backend (headless CMS, LMS, DAM, editorial
workflow, multilingual i18n, and mobile-ready REST APIs).

> The shared multi-brand backend and legacy `/ascend` routes remain intact
> for backwards compatibility, but all new development targets Nihongo Bridge.

## Key routes
- `/` → Nihongo Bridge home (redirects to `/nihongo`)
- `/nihongo` — Learning portal (JLPT N5–N1, vocab, kanji, grammar, quizzes, gamification)
- `/nihongo/study-japan` · `/nihongo/jobs` · `/nihongo/conversation` — CMS pages
- `/admin` — Headless CMS Admin Dashboard
- `/hub` — Multi-brand hub (preserved)
- `/api/v1/*` — Unified REST API (see `docs/API.md`, `/api/v1/swagger`)

## Stack
Next.js (App Router) · React 19 · TypeScript · TailwindCSS · PostgreSQL ·
Drizzle ORM · REST API · Headless CMS · LMS · DAM · Editorial workflow ·
Multilingual (EN / தமிழ் / മലയാളം / 日本語)

## Getting started
```
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm test             # unit tests (node:test)
npx drizzle-kit push # apply schema to Postgres
```

## Documentation (`docs/`)
ARCHITECTURE · API · CMS_ADMIN_GUIDE · ENTERPRISE_READINESS_REPORT ·
FEATURE_COMPLETION_MATRIX · SECURITY_AUDIT · PERFORMANCE_AUDIT ·
ACCESSIBILITY_AUDIT · DOCUMENTATION_AUDIT · VERSION_5_ROADMAP · RELEASE_NOTES
