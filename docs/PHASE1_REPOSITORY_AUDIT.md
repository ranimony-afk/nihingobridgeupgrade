# Phase 1 — NihongoBridge Repository Audit

**Version:** 1.0.0  
**Scope:** Working tree currently deployed as the Duolingo-style LMS (Next.js App Router + Drizzle + PostgreSQL).  
**Constraint honored:** working lesson modules were not rewritten. Existing routes and `/api/game`, `/api/me`, `/api/health` remain.

## Executive summary

The repository is a **complete, playable Japanese LMS MVP**, not the full enterprise platform described in the NihongoBridge target architecture. The skill path, hearts, XP, streaks, stories, practice, shop, and leagues work end-to-end against PostgreSQL.

What is missing is the enterprise shell: signed identity, versioned REST, CMS/DAM, JMdict-family data, kanji/grammar/conversation products, i18n, AI streaming, Flutter, CI, and security hardening.

Readiness is computed live from persisted findings (`GET /api/v1/audit`). Open critical items (unsigned learner cookie, client-trusted scoring) dominate the score.

## Architecture

```
Browser LMS  →  App Router pages  →  src/lib/{learner,game,seed}
                                 →  POST /api/game  (compatibility facade)
                                 →  Drizzle  →  PostgreSQL

New in Phase 1
  GET  /api/v1/audit
  GET  /api/v1/audit/findings
  PATCH /api/v1/audit/findings/:id   (staff)
  POST /api/v1/admin/login|logout
  GET  /api/v1/admin/session
  /audit  public report
  /admin  staff CMS
```

### What exists and must be preserved

| Route | Role |
| --- | --- |
| `/` | Marketing landing |
| `/onboarding` | Create learner cookie |
| `/learn`, `/learn/[slug]` | Path + lesson player |
| `/practice` | SRS / review |
| `/stories`, `/stories/[slug]` | Illustrated stories |
| `/kana` | Gojūon chart |
| `/quests` | Daily/weekly missions |
| `/leaderboard` | Weekly league |
| `/shop` | Gem store |
| `/profile` | Stats + achievements |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/me` | Current learner |
| `POST /api/game` | All LMS mutations |

### Target vs actual

| Capability | Target | Actual |
| --- | --- | --- |
| Next.js App Router + TS | Yes | Yes |
| Drizzle + PostgreSQL | Yes | Yes |
| Duolingo LMS loop | Implied | Yes |
| NextAuth / JWT | Yes | No (unsigned `nb_learner`) |
| `/api/v1` REST + OpenAPI | Yes | Audit/admin only (this phase) |
| shadcn / TanStack / Motion | Yes | Not installed (deliberate) |
| Supabase | Yes | Compatible Postgres URL only |
| JMdict / KANJIDIC2 / … | Yes | Absent |
| Flutter + SQLite | Yes | Absent |
| Claude / OpenAI streaming | Yes | Absent |
| CMS / DAM / i18n | Yes | Audit CMS only |

## Technical debt

1. `src/lib/learner.ts` and `src/lib/game.ts` are god modules.
2. Curriculum seed is insert-once; it cannot repair partial data.
3. `lessons.xpReward` / `kind` and `review_cards.ease` are unused.
4. Quests fabricate weekly lesson progress (`lessonsCompleted + 2`).
5. Schema history was `drizzle-kit push` only until `drizzle/migrations/0001_phase1_audit.sql`.
6. Dates are UTC, not learner-local.

## Missing features

Dictionary, Kanji Explorer, Grammar engine, Conversation Lab, CAT exams, CMS editorial workflow, DAM, localization (EN/TA/ML/JA), NextAuth, middleware, SEO artifacts, payments, Flutter client, AI provider abstraction.

## Code smells

- Stringly-typed `GameAction` dispatcher.
- Client-sent `correct/total` / `xp` / `score`.
- UTC `todayKey()`.
- Empty `alt` attributes and emoji-only path nodes.
- `seedReady` imported in `game.ts` but layout is what seeds.

## Duplicate components

- Heart decrement in `check` and `reviewResult`.
- Achievement unlock special-case in `buy` vs `unlockAchievements`.
- Repeated `.press` / `.card` markup instead of a primitive library.

## Unused code

- `hasCurriculum()`
- `lessons.xpReward` at award time
- `reviewCards.ease`
- Target libraries that are not (and should not yet be) installed

## Dependency issues

`package.json` is intentionally minimal. Adding NextAuth, Radix, TanStack, Framer, and AI SDKs in this phase would create unused dependencies. Add them when a phase imports them.

## Security risks

| ID | Risk |
| --- | --- |
| f-auth-unsigned-cookie | Forgeable learner impersonation |
| f-quiz-client-trusted | XP/gem/crown farming |
| f-sec-no-ratelimit | Unbounded POST /api/game |
| Staff cookie | HMAC interim (better than raw id), still not NextAuth |

Default staff: `sensei@nihongobridge.local` / `bridge-audit` (override with `ADMIN_BOOTSTRAP_PASSWORD` before production).

## Performance bottlenecks

- `seedReady()` from root layout (mitigated by in-memory flag).
- `toPublic` extra queries.
- `getLeaderboard` full scans.
- Serial bot inserts.
- All routes `force-dynamic`.
- Remote Pexels images without `next/image`.

## Prioritized roadmap

See `docs/ROADMAP.md` and the `audit_roadmap` table. Phase 2 is identity dual-stack + server-side quiz ledger. LMS routes stay.

## How to review this audit in the product

1. Open `/audit` for the public report.
2. Sign in at `/admin/login` to change finding workflow.
3. `GET /api/v1/audit` for the machine-readable bundle.
