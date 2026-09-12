# PHASE 00 — Conflict Analysis

**Date:** 2026-03-25  
**Scope:** Local sandbox vs GitHub A vs Repo B. No merge performed.

Severity: CRITICAL > HIGH > MEDIUM > LOW

---

## C-001 — Two different Repository A trees

**Severity:** CRITICAL  
**Between:** A-local vs A-github  
**Description:** Local workspace is a blank starter. GitHub `nihingobridgeupgrade` already has schema, APIs, services, ETL, masterplan.  
**Risk:** Blindly copying Repo B into local would fork A and ignore existing GitHub A domain code.  
**Resolution:** Reconcile local with GitHub A in Phase 01 (additive port). Do not copy B first.  
**Decision:** DEC-0009

## C-002 — Stale Phase 00 on GitHub A

**Severity:** HIGH  
**Between:** GitHub A masterplan audits vs current GitHub A + B  
**Description:** Existing audits say 0 tables, 2 routes, Repo B unavailable. Current GitHub A has 39 tables and 31 routes; Repo B is public. TARGET_ARCHITECTURE is frozen on the stale premise.  
**Resolution:** This audit supersedes those reports (ARCHIVE). Update architecture docs in Phase 01; do not treat "green field" as still true for GitHub A.  
**Decision:** DEC-0008

## C-003 — Identical table names, incompatible PKs

**Severity:** CRITICAL  
**Between:** GitHub A schema vs B knowledge schema  
**Tables:** `dictionary_entries`, `kanji_entries`, `grammar_patterns`, `sentences`, `srs_decks`, `srs_cards`, `user_progress`, `user_bookmarks`, `practice_tests`, `questions`, `test_sessions`  
**A:** text PK. **B:** uuid PK + different columns.  
**Risk:** Running B migrations creates type conflicts or a second database.  
**Resolution:** GitHub A schema is canonical. Never apply B drizzle SQL. Merge missing *columns* additively later.  
**Decision:** DEC-0010

## C-004 — JLPT encoding

**Severity:** MEDIUM  
**A:** `smallint` 1–5 (N1=1 … N5=5 or undocumented direction — **STOP if implementing mapping** until confirmed).  
**B:** enum `N5`…`N1`/`NONE`.  
**Resolution:** Keep A's smallint; document mapping in Phase 01 schema freeze. Do not guess N1=1 vs N5=1 in code this phase.  
**Note:** GitHub A comments say "JLPT level 1-5". B uses labels. Confirm ordinal mapping before ETL.

## C-005 — Identity model

**Severity:** CRITICAL  
**A:** no users table; `learnerId` text  
**B:** `users` uuid + Supabase Auth  
**Resolution:** Design A's identity in Phase 01. Do not import B `users` as the auth source.  
**Decision:** DEC-0011

## C-006 — Competing auth systems if B is copied

**Severity:** CRITICAL  
**B:** three jose/Supabase verifiers + insecure header bypass  
**A:** none  
**Rule:** no authentication swap  
**Resolution:** Do not copy `lib/auth.ts` from any B package.

## C-007 — Competing API surfaces

**Severity:** HIGH  
**A:** `/api/v2/...`  
**B:** unversioned `/api/dictionary|kanji|grammar|srs|tests` plus separate AI and admin apps  
**Resolution:** One Next.js app, A's prefixes only.

## C-008 — Competing search engines

**Severity:** HIGH  
**A:** PostgreSQL exact/prefix/fuzzy (`pg_trgm`) in DictionaryService  
**B:** Meilisearch + Fastify + LISTEN/NOTIFY + API meilisearch client  
**Target architecture:** pg_trgm initially  
**Resolution:** DEPRECATE Meilisearch for v1. Reuse B `search/lib/japanese.ts` normalization later.  
**Decision:** DEC-0012

## C-009 — Competing SRS implementations

**Severity:** HIGH  
**A:** `src/services/srs/*` + 4 tables including algorithm state  
**B:** `lib/srs.ts` SM-2 + 3 tables  
**Resolution:** KEEP GitHub A SRS as the engine. Use B only for test vectors / UI.

## C-010 — Competing ETL stacks

**Severity:** MEDIUM  
**A:** TypeScript framework, parsers stubbed  
**B:** Python with real JMdict parser + tests  
**Resolution:** Keep A's TS ETL as the runtime in-repo. Port B parser algorithms (MERGE). Do not add Python as a production runtime on Vercel.

## C-011 — Competing web UIs

**Severity:** MEDIUM  
**A:** control-tower + docs  
**B:** learner web (dict/kanji/test/dashboard)  
**Resolution:** A's App Router remains the product web. Selectively reimplement B screens against `/api/v2` in later phases. No nested `nihongobridge-web` app.

## C-012 — Four Next.js versions/apps

**Severity:** HIGH  
**A:** Next 16 / React 19  
**B:** Next 14.2 / React 18 × (web, api, admin, ai)  
**Resolution:** Stay on A's Next 16. Do not install B apps.

## C-013 — Database drivers

**Severity:** MEDIUM  
**A:** `pg` Pool (node-postgres)  
**B:** `postgres` (postgres.js)  
**Resolution:** Keep `pg` as in `src/db/index.ts`.

## C-014 — MinIO / S3 / Redis assumptions in B

**Severity:** MEDIUM  
**B API:** AWS S3, ioredis, edge-tts  
**B ETL:** MinIO  
**A deploy model:** Vercel + PostgreSQL  
**Resolution:** Do not take these as required. TTS/audio later with explicit provider DEC.

## C-015 — DEC-0001 internal contradiction

**Severity:** LOW (docs)  
**DEC-0001** claims Repo 1 "contains authentication, API routes, and production infrastructure."  
**Audit:** local and GitHub A have no auth. GitHub A has APIs; local does not.  
**Resolution:** Correct the decision log narrative; keep "A is canonical".

## C-016 — In-memory SRS sessions on GitHub A

**Severity:** MEDIUM  
**Evidence:** `src/services/srs/review-session.ts` `Map` with comment to use Redis.  
**Resolution:** Durable store in SRS phase; do not add Redis just because B has ioredis.

## C-017 — Open mutating APIs

**Severity:** HIGH (once ported)  
**GitHub A** progress/SRS/XP/AI have no auth.  
**Resolution:** Do not expose those routes publicly until Phase 01 auth exists. Local currently safe (routes absent).

## C-018 — License / provenance

**Severity:** MEDIUM  
**A:** registry lists CC-BY-SA JMdict/KANJIDIC2 and Tatoeba; good.  
**B:** Python ETL + seeds; no LICENSE file at repo root of A or B.  
**Resolution:** Keep A's registry as SoT. Do not import unlicensed seed dumps without provenance. Never scrape Takoboto/Duolingo/WaniKani.

---

## Summary counts

| Severity | Count |
|---|---|
| CRITICAL | 4 (C-001, C-003, C-005, C-006) |
| HIGH | 6 |
| MEDIUM | 7 |
| LOW | 1 |

None of these require a STOP on the **audit**. They require a STOP on **implementation** that would copy B schema/auth/search.

**If Phase 01 starts:** first action is C-001 (sync local with GitHub A foundation), not B integration.
