# PHASE 00 — Integration Classification Matrix

**Date:** 2026-03-25  
**Legend:** KEEP | MODIFY | MERGE | MOVE | DEPRECATE | REPLACE | ARCHIVE  
**Confidence:** HIGH / MEDIUM / LOW  
**Migration risk:** LOW / MEDIUM / HIGH / CRITICAL

This is a **plan**, not an implementation.

---

## Local sandbox (deployable A)

| Component | Path | Class | Reason | Conf | Risk |
|---|---|---|---|---|---|
| Health route | `src/app/api/health/route.ts` | KEEP | Platform + regression lock | HIGH | LOW |
| Drizzle client | `src/db/index.ts` | KEEP | Canonical DB access | HIGH | LOW |
| Empty schema | `src/db/schema.ts` | MODIFY | Additive tables from GitHub A in Phase 01 | HIGH | MEDIUM |
| Starter page | `src/app/page.tsx` | MODIFY | Replace with product/control UI later | HIGH | LOW |
| Layout | `src/app/layout.tsx` | MODIFY | Branding | HIGH | LOW |
| Stack config | `package.json` etc. | KEEP | Next 16 / Drizzle / pg | HIGH | LOW |
| `.env` | `.env` | KEEP | Never commit | HIGH | LOW |

---

## GitHub A domain (canonical candidate)

| Component | Path | Class | Reason | Conf | Risk |
|---|---|---|---|---|---|
| Canonical schema | `src/db/schema.ts` | KEEP | 39-table SoT | HIGH | HIGH* |
| Dictionary service | `src/services/knowledge/dictionary.ts` | KEEP | pg_trgm search | HIGH | MEDIUM |
| Kanji/grammar services | `src/services/knowledge/*` | KEEP | Domain | HIGH | MEDIUM |
| Learning engines | `src/services/learning/*` | KEEP | Courses/quiz/JLPT | HIGH | MEDIUM |
| SRS | `src/services/srs/*` | KEEP | One SRS only | HIGH | MEDIUM |
| Review session Map | `review-session.ts` | MODIFY | Needs durable store | HIGH | MEDIUM |
| Gamification | `src/services/gamification/*` | KEEP | XP/streaks | HIGH | LOW |
| AI services | `src/services/ai/*` | KEEP | Must use platform knowledge | HIGH | MEDIUM |
| `/api/v2/*` | `src/app/api/v2` | KEEP | Canonical HTTP | HIGH | MEDIUM |
| `/api/ai/*` | `src/app/api/ai` | KEEP | Later phase polish | HIGH | LOW |
| `/api/v1/*` | `src/app/api/v1` | MODIFY | Compatibility only | MEDIUM | LOW |
| ETL registry | `etl/sources/registry.ts` | KEEP | License-aware | HIGH | LOW |
| JMdict pipeline | `etl/pipelines/jmdict.ts` | MODIFY | Parser stub | HIGH | MEDIUM |
| Stale audits | `.../reports/audits/*` | ARCHIVE | Repo B was missing | HIGH | LOW |
| TARGET_ARCHITECTURE | masterplan | MODIFY | Frozen on empty-A myth | HIGH | MEDIUM |

\*Risk is "porting into local DB" not "keeping the design". Additive CREATE only.

---

## Repo B

| Component | Class | Reason | Conf | Risk |
|---|---|---|---|---|
| knowledge schema | MERGE concepts | Do not apply SQL | HIGH | CRITICAL if applied |
| knowledge drizzle SQL | ARCHIVE | Competing schema | HIGH | CRITICAL |
| knowledge `users` | MERGE ideas | After A identity exists | HIGH | HIGH |
| knowledge `media_assets` | MERGE later | Missing on A | HIGH | MEDIUM |
| API routes | MERGE contracts | Into `/api/v2`, not mount B | HIGH | HIGH |
| API `lib/auth.ts` | DEPRECATE | Supabase JWT | HIGH | CRITICAL |
| API Meilisearch | DEPRECATE v1 | pg_trgm first | HIGH | HIGH |
| API SRS lib | MERGE tests/ideas | A's SRS wins | HIGH | HIGH |
| API test engine | MERGE | Session state machine | HIGH | MEDIUM |
| web UI | MERGE later | Against A's API | MEDIUM | MEDIUM |
| web demo-*.ts | DEPRECATE | Fixtures | HIGH | LOW |
| admin schema | MERGE later | Admin phase | HIGH | MEDIUM |
| admin auth | DEPRECATE | Same Supabase JWT | HIGH | CRITICAL |
| AI routes | MERGE later | After knowledge | HIGH | MEDIUM |
| AI dictionary-tool | KEEP pattern | RAG must hit platform dict | HIGH | LOW |
| Python JMdict parser | MERGE | Port to TS | HIGH | MEDIUM |
| Python Tatoeba | MERGE | Port to TS | HIGH | MEDIUM |
| Question generators | MERGE | Quiz/JLPT later | HIGH | MEDIUM |
| MinIO client | DEPRECATE | Not A deploy model | HIGH | MEDIUM |
| Fastify search service | DEPRECATE v1 | Extra runtime | HIGH | HIGH |
| Japanese query helpers | MERGE | Into A's search | HIGH | LOW |
| Flutter app | KEEP | Phase 08 client | HIGH | MEDIUM |
| Flutter auth repo | MODIFY | A's tokens | HIGH | HIGH |
| platform docker-compose | ARCHIVE | Multi-service B | HIGH | HIGH |

---

## Explicit non-goals (never in Phase 00–01)

- Nested `nihongobridge-*` Next apps inside A
- Second PostgreSQL schema or second database
- Meilisearch requirement
- Supabase Auth requirement
- Python production runtime on Vercel
- Scraping proprietary dictionaries
- DROP TABLE of anything

---

## Recommended Phase 01 bounded work (not started)

1. Additive GitHub A schema → local `src/db/schema.ts` (CREATE only)
2. `.gitignore` + `.env.example`
3. Identity design DEC (auth library choice)
4. Update masterplan TARGET_ARCHITECTURE to admit GitHub A is no longer empty
5. Keep `/api/health` unchanged
6. **No Repo B file copies**
