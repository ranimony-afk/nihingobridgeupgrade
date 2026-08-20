# Changelog

## 1.14.0 — Phase 16 performance

- seedReady() memoised: 77 queries and ~250ms removed from every request
- Removed root-layout force-dynamic; ISR on blog, kanji, grammar (+ prerendering)
- 33 foreign-key indexes; toPublic and getLeaderboard collapsed to one query each
- Fixed leaderboard ordering, which sorted a ::text column lexicographically
- next/image across all 19 images, AVIF/WebP, immutable asset caching
- Lazy-loaded D3 and the tutor chat
- Edge-runtime /api/v1/ping alongside the Node /api/health

## 1.13.0 — Phase 15 SEO

- Canonical URLs that collapse query strings, fragments and trailing slashes
- Schema.org: Organization, WebSite, Article, DefinedTerm, LearningResource, Breadcrumb
- OpenGraph + Twitter cards with `max-image-preview:large` for Google Discover
- RSS 2.0 feed at `/feed.xml` with strict XML escaping
- Sitemap now spans dictionary, kanji, grammar and stories, and honours `noindex`
- Contextual internal linking drawn from the knowledge graph
- Idempotent daily blog generator at `/admin/seo`

## 1.12.0 — Phase 14 analytics

- Staff dashboard at `/admin/analytics` with learning, funnel, retention,
  revenue, and product sections
- Pure metrics library (MRR, churn, LTV, cohorts, funnels) with unit tests
- Annual plans normalised to monthly MRR; LTV capped instead of Infinity
- `eventCounts()` now aggregates in SQL instead of loading every row
- Opt-in demo dataset so a fresh install is explorable

## 1.11.0 — Phase 13 payments

- Affiliate codes now require an active partner row (any `AFFILIATE-*` string
  previously granted 15% off)
- Commission ledger and payouts, accrued on net revenue and reversed on refund
- Referral attribution written to the previously unused `referred_by` column
- Webhook idempotency keyed on the provider event id
- Subscription cancel, resume, and lapse expiry

## 1.10.0 — Phase 12 search

- Unified `search_index` across 8 content types with weighted tsvectors
- Fuzzy matching via pg_trgm with separate whole-string and word thresholds
- Autocomplete, facets, filters (`type:` `jlpt:` `pos:` `difficulty:` `-negation`)
- Kana→romaji transliteration so "taberu" and "tab" find 食べる
- "Did you mean" from titles plus Latin gloss words
- `/search` UI, `/admin/search` console with zero-result reporting

## 1.9.0 — Phase 11 Flutter client

- Android, iOS, macOS, Linux, Windows platform runners
- Repository layer with network-first + SQLite fallback
- True SSE streaming for the AI tutor
- Downloads manager and outbox sync UI
- Dart unit + widget tests and a Flutter CI workflow



## 1.8.0 — Phases 8–10

- Grammar engine: graph, difficulty, timeline, examples, AI explanation, sentence builder
- AI tutor: Claude/OpenAI streaming with local fallback, corrections, detection, scoring, shadowing
- Flutter client in `apps/mobile` (Riverpod, Dio, SQLite, sync, notifications, dark mode, 5 locales)
- CMS workspace: blogs, courses, media, notifications, SEO + `/blog`, sitemap, robots



## 1.7.0 — Phase 7 kanji explorer

- D3.js radial tree with zoom/pan at `/kanji/explore`
- Radicals, relations, compounds, nanori, history/origin/mnemonics
- RTK and WaniKani mappings, admin CMS, REST graph API



## 1.6.0 — Phase 6 dictionary

- Multilingual glosses (JA/EN/HI/TA/ML), keigo/casual, synonyms/antonyms
- Conjugation engine, grammar cross-links, bookmarks, offline pack
- SVG + GIF-style stroke animation and rare-kanji flags
- REST `/api/v1/dict/*` for Flutter/offline cache



## 1.5.0 — Phase 5 knowledge graph

- Normalized KG tables for lexemes, kanji, sentences, grammar, idioms, collocations, pitch, strokes, furigana, frequency, tags, audio, AI metadata, SRS
- Incremental ETL (`scripts/kg-etl.ts`) + admin import
- Full-text search APIs and `/dictionary` `/kanji` `/grammar`



## 1.4.0 — Phase 4 payments

- Stripe Checkout + Razorpay Orders when secrets exist; sandbox fulfill without keys
- Subscriptions, coupons, referral/affiliate codes, GST-inclusive INR invoices
- Billing portal, printable invoices, refunds, webhook inbox
- Premium path lock (`/premium`) and admin billing CMS
- Flutter restore via `GET /api/v1/billing/me`



## 1.3.0 — Phase 3 authentication

- Identity users, institutions, refresh tokens, challenges, TOTP, mail outbox
- REST `/api/v1/auth/*` for email, magic link, reset, verify, 2FA, sessions
- Google/GitHub OAuth hooks on Auth.js when secrets exist
- RBAC + subscription-aware middleware for `/teacher`, `/institution`, `/plus`
- CMS `/admin/identity` and Flutter bearer-token contract
- Unit, integration, and e2e identity tests



## 1.2.1 — Phase 2 pipeline close-out

- GitHub deploy workflow with a green-build gate and optional Vercel promotion
- Staff login rate limit (10/min)
- Local Supabase `config.toml` and production checklist
- Drizzle kit `out` directory for future generated migrations

## 1.2.0 — Phase 2 infrastructure

### Added

- Auth.js v5 staff JWT (`/api/auth/[...nextauth]`) dual-stacked with HMAC `nb_staff`
- Signed `nb_learner_sig` cookie while keeping `nb_learner`
- Zod environment validation, JSON logger, DB error tracking, analytics events
- Optional Redis rate limits and Supabase client
- Deep health at `/api/v1/health` (compat `/api/health` unchanged)
- Docker + Compose, GitHub Actions CI and scheduled backups
- In-app logical backups and `/admin/infra`
- Unit, integration, and smoke tests for infra

### Preserved

- All LMS routes and `/api/health` `{ ok: true }`, `/api/me`, `/api/game` action union

## 1.1.0 — Phase 1 repository audit

### Added

- Audit schema: `audit_reports`, `audit_findings`, `audit_roadmap`, `audit_events`, `staff_users`
- Public report at `/audit`
- Staff CMS at `/admin` with HMAC login
- REST: `/api/v1/audit`, `/api/v1/audit/findings`, `/api/v1/admin/*`
- Documentation under `docs/`
- Unit and integration tests under `tests/`
- SQL migration `drizzle/migrations/0001_phase1_audit.sql`

### Preserved

- All LMS routes and `/api/health`, `/api/me`, `/api/game`
- Curriculum, hearts, XP, streaks, stories, shop, leagues
