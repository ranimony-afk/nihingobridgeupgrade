# Phases 8–10 — Grammar engine, AI tutor, Flutter, CMS

All three ship as additive modules. `/learn`, `/api/game`, `/api/health`, dictionary, and kanji routes are unchanged.

## Phase 8 — Grammar engine

- 25 curated points with formation, nuance, difficulty (1–9), JLPT
- Grammar graph (`requires` / `unlocks`) rendered on each detail page
- Visual 4-step timeline, examples with TTS audio, AI explanation field
- Sentence builder with server-side checking (`POST /api/v1/grammar/:slug`)
- Scaffold generator toward the 10,000 capacity (`POST /api/v1/admin/grammar {action:"generate"}`)
- Pages `/grammar`, `/grammar/[slug]`, CMS `/admin/grammar`

## Phase 9 — AI tutor

- `POST /api/v1/tutor/stream` returns SSE (`analysis`, `token`, `done`)
- Provider abstraction: Claude → OpenAI → local sensei fallback
- Corrections (食べるたい → 食べたい, ですです, 私わ, ら-抜き …)
- Grammar + vocabulary detection against the knowledge graph
- Turn scoring, adaptive JLPT ladder, conversation history in Postgres
- Voice out via Web Speech, shadowing score `POST /api/v1/tutor/shadow`
- Pages `/conversation`, CMS `/admin/tutor`

Set `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`) or `OPENAI_API_KEY`.

## Phase 10 — Flutter

`apps/mobile` — Riverpod, Dio with refresh interceptor, sqflite offline cache + outbox,
workmanager background sync, local notifications, downloads, premium plan gate,
dictionary/kanji/grammar/quiz/conversation/progress/leaderboard/settings, dark mode,
EN·JA·TA·ML·HI localization, NavigationRail on tablet/desktop.

## Phase 10 — CMS

`/admin/content` adds blogs, courses, media, notifications, SEO, and links to the
dictionary, kanji, grammar, users, and payments desks. Public blog at `/blog`,
plus `sitemap.xml` and `robots.txt`.
