# CONFLICT MATRIX

**Prompt:** 00.1  
Severity: CRITICAL / HIGH / MEDIUM / LOW  
All rows have path evidence. No merge performed.

---

| ID | Severity | Topic | A evidence | B evidence | Resolution class |
|---|---|---|---|---|---|
| X1 | CRITICAL | Two A trees | Local `schema.ts` `export {}`; GitHub 2081-line schema | n/a | KEEP GitHub A as design; ADAPT local additively. Do not INTEGRATE B first. |
| X2 | CRITICAL | Table name + PK clash | `text` PKs in A `schema.ts` | `uuid` PKs in B `schema/dictionary.ts` etc. | DEPRECATE B migrations. KEEP A schema. |
| X3 | CRITICAL | Identity | No users table; `learnerId` text | `users` uuid + Supabase JWT (`lib/auth.ts`) | REWRITE A identity. DEPRECATE B auth. |
| X4 | CRITICAL | Auth swap risk | A `package.json` has no jose/next-auth | Three `lib/auth.ts` + admin `middleware.ts` demo super_admin + `ALLOW_INSECURE_USER_HEADER` | DEPRECATE B auth copies. Do not copy. |
| X5 | HIGH | Duplicate APIs | `/api/v2/dictionary/search` | `/api/dictionary/search` | KEEP A paths. ADAPT B extras. |
| X6 | HIGH | Search engines | `similarity()` in DictionaryService | Meilisearch in `lib/search.ts` + Fastify server | KEEP SQL. DEPRECATE Meili v1. |
| X7 | HIGH | SRS engines | FSRS-5 `algorithm.ts` | SM-2 `lib/srs.ts` | KEEP A. ADAPT tests from B. |
| X8 | HIGH | Four Next apps vs one | Single Next 16 app | web+api+admin+ai Next 14 | DEPRECATE nested B apps. |
| X9 | HIGH | Next/React versions | 16 / 19 | 14 / 18 | ADAPT any UI copy. |
| X10 | HIGH | Open mutators on A-github | POST srs/progress/xp without auth | B gates some routes with JWT | Do not expose A mutators until REWRITE auth. |
| X11 | HIGH | Stale A masterplan | TARGET_ARCHITECTURE “0 tables” | n/a | DEPRECATE stale audits. |
| X12 | MEDIUM | DB drivers | `pg` | `postgres` (postgres.js) | KEEP `pg`. |
| X13 | MEDIUM | JLPT encoding | smallint 1–5 (`pipeline.test.ts`) | enum N5–N1 | KEEP A; mapping UNVERIFIED. |
| X14 | MEDIUM | ETL language | TS stub parser | Python real parser | INTEGRATE algorithms; REWRITE TS parser. No Python on Vercel. |
| X15 | MEDIUM | Object storage | none | MinIO compose + minio_client.py + S3 SDK | DEPRECATE for v1. |
| X16 | MEDIUM | Redis | none | ioredis + redis container | DEPRECATE v1 unless measured need. |
| X17 | MEDIUM | In-memory SRS sessions | `review-session.ts` Map | Redis sessions optional | ADAPT durable store later. |
| X18 | MEDIUM | Flutter API mismatch | `/api/v2/srs/sync` | Flutter wants `/api/mobile/sync` **missing** in B API | UNVERIFIED; ADAPT endpoints in Phase 08. |
| X19 | MEDIUM | Web demo vs live | n/a | `demo-session.ts` fixtures | IGNORE demo data as knowledge. |
| X20 | MEDIUM | pg_trgm | used in SQL, not in schema | declared GIN indexes | INTEGRATE extension+indexes on A. UNVERIFIED in DB. |
| X21 | LOW | Package name | `nextjs-postgresql-template` | `@nihongobridge/*` | ADAPT name later. |
| X22 | LOW | kg_* comment | schema header | none | IGNORE (no tables). |
| X23 | LOW | Docs contradiction DEC-0001 “A has auth” | no auth in package.json | B has JWT | Docs ADAPT. |
| X24 | HIGH | Missing .gitignore | none on A root `ls` | packages have .gitignore | REWRITE A gitignore (not this prompt). |
| X25 | MEDIUM | CI model | none | CI checks out **other GitHub repos** | UNVERIFIED for this snapshot. |

---

## Stop conditions (no guessing)

1. JLPT smallint ↔ N-label mapping direction (N1=1 vs N5=1) — **UNVERIFIED**; do not encode in this phase.  
2. Whether sandbox Postgres has `pg_trgm` — **UNVERIFIED**.  
3. Whether GitHub A `/api/v2/tests` matches B test session state machine — shapes not byte-compared; treat as ADAPT.  
4. Flutter `/api/mobile/*` owners — **missing**; do not invent.  
5. KANJIDIC2 parser on B — no dedicated file found; **UNVERIFIED**.

If implementation cannot map a colliding table without DROP: **STOP** (DEC-0010).
