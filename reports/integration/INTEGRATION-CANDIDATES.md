# INTEGRATION CANDIDATES

**Prompt:** 00.1  
**Rule:** Repository A is canonical. B is source only. No files copied in this prompt.

Approved candidates are **bounded**. Rejected items must not be sneak-merged.

---

## A. Do now-later (Phase 01) — A-internal, not B

| Candidate | From | Class | Evidence | Risk |
|---|---|---|---|---|
| Additive schema port | A-github `src/db/schema.ts` | INTEGRATE into A-local | 39 tables, text PKs | MEDIUM |
| Wire `drizzle(pool, { schema })` | A-github `src/db/index.ts` | ADAPT local | local omits schema | LOW |
| `.gitignore` / `.env.example` | missing on A | REWRITE | `ls` GitHub A root | LOW |
| Identity design | absent | REWRITE | no users table | HIGH |
| Keep healthcheck | both | KEEP | identical SHA | LOW |

**Not in Phase 01:** B packages, Meilisearch, Python, Flutter.

---

## B. Strong INTEGRATE candidates (later phases, adapt into A)

| ID | Candidate | B path | Target on A | Why content-verified | Phase gate |
|---|---|---|---|---|---|
| I1 | JMdict XML parser | `nihongobridge-etl/etl/parsers/jmdict_parser.py` | `etl/parsers/` TS | lxml streaming dataclasses; tests `test_jmdict_parser_transformer.py` | after schema; ETL phase |
| I2 | JMdict transformer/pipeline | `etl/transformers/jmdict_transformer.py`, `etl/pipelines/jmdict_pipeline.py` | `etl/pipelines/jmdict.ts` (currently yields 0) | real pipeline vs A stub | ETL |
| I3 | Tatoeba stager/pipeline | `etl/parsers/tatoeba_stager.py`, `pipelines/tatoeba_pipeline.py` | new A pipeline | tests exist | ETL |
| I4 | Enrichers | `etl/enrichers/*.py` | A `etl/enrichment/*` (already sketched) | tested | ETL |
| I5 | Question generators | `etl/generators/*.py` | A quiz/JLPT | tested assembler/quality | Learning |
| I6 | Dictionary autocomplete | `nihongobridge-api/.../autocomplete/route.ts` | `/api/v2/dictionary/autocomplete` | missing on A | Search |
| I7 | Kanji by radical / by level | B kanji routes | `/api/v2/kanji?...` | missing on A | Knowledge API |
| I8 | Test session state machine | `lib/testEngine.ts` + session routes | A `/api/v2/tests` | real session answer/complete | Learning |
| I9 | Japanese query helpers | `nihongobridge-search/search/lib/japanese.ts` | A dictionary search | unit tests | Search |
| I10 | Dictionary tool-calling | `nihongobridge-ai/lib/dictionary-tool.ts` | A `src/services/ai` | hits platform dictionary | AI after knowledge data |
| I11 | API Vitest contracts | `nihongobridge-api/tests/*.ts` | A tests | scoring/session/srs tests | after API freeze |
| I12 | `media_assets` table idea | `schema/media.ts` | A schema additive | missing on A | later |
| I13 | Admin tables | `nihongobridge-admin/schema/admin.ts` | A schema additive | RBAC/audit/ETL runs | Admin |
| I14 | Flutter client | `nihongobridge-mobile/` | `mobile/` | real screens + SQLite | Mobile; after `/api/v2` stable |
| I15 | SQL fallback pattern | B `lib/search.ts` postgres branch | already A default | confirms Meili optional | n/a — A already SQL |

---

## C. ADAPT (reuse idea, rewrite to A stack)

| Item | Do not copy | Rewrite against |
|---|---|---|
| B web dictionary/kanji/test pages | Next 14 app | A App Router + `/api/v2` |
| B admin CMS screens | demo JWT middleware | A auth + `/api/admin` later |
| B SRS SM-2 | second engine | A FSRS-5 (`algorithm.ts`) |
| B `users` columns | uuid PK | A identity table (text or uuid **decision in Phase 01**) |
| Flutter `api_endpoints.dart` | `/api/dictionary` + missing `/api/mobile/*` | `/api/v2` + `/api/v2/srs/sync` |

---

## D. DEPRECATE (do not integrate)

| Item | Evidence | Reason |
|---|---|---|
| B drizzle SQL migrations | `nihongobridge-knowledge/drizzle/*.sql` | table name collision + uuid PK |
| B `lib/auth.ts` ×3 | jose + Supabase + insecure header | auth swap forbidden |
| Admin demo super_admin | `middleware.ts` `demoAllowed()` | insecure default |
| Meilisearch + Fastify server | `search/http/server.ts`, compose | A SQL search |
| MinIO / S3 as required | compose + minio_client.py | A is Postgres+Vercel |
| Nested Next 14 apps | four package.json next 14.2.35 | one Next 16 app |
| N5 seed as production dictionary | README 5 words | fixture |
| Web `demo-session.ts` | tags `"demo"` | not knowledge |
| Platform redis/meili/minio/mailhog/adminer | `docker-compose.yml` | extra attack/ops surface |
| Path `/api/user/[userId]/...` | trust path id | session identity instead |

---

## E. IGNORE

- `.dart-tool`, `.dartServer`, `.config/flutter`
- Empty `nihongobridge-ai/app/api/ai/tutor/route.ts` (no HTTP export)
- A schema comment about `kg_*` tables (not in file)
- Mailhog/Adminer

---

## F. UNVERIFIED (stop; do not guess)

| Item | Missing evidence |
|---|---|
| JLPT smallint ↔ N1–N5 direction | A tests 1–5; B uses labels |
| `pg_trgm` installed in sandbox | A SQL uses `similarity()`; schema has no extension |
| KANJIDIC2 parser in B | registry on A `planned`; no B file found this audit |
| Flutter `/api/mobile/bootstrap/dictionary` and `/api/mobile/sync` | referenced in Dart; **not** in B API tree |
| A `/api/v2/tests` ≡ B session protocol | both exist; payloads not proven equal |
| Production LLM quality | A falls back to mock without keys (`llm-provider.ts`) |

---

## G. Explicit non-candidates (license)

Do not INTEGRATE UI/content from Takoboto, Duolingo, Todaii, WaniKani.  
A `etl/sources/registry.ts` already lists EDRDG CC-BY-SA for JMdict — KEEP that provenance path.

---

## H. Order (dependency gates)

```
KEEP A health + stack
→ INTEGRATE A-github schema into A-local (CREATE only)
→ REWRITE identity/auth (one system)
→ REWRITE JMdict parser from I1/I2
→ INTEGRATE Tatoeba I3
→ INTEGRATE SQL indexes / autocomplete I6/I9
→ then learning/SRS (KEEP A engines)
→ then AI I10
→ then admin I13
→ then Flutter I14
```

Skip none. AI after knowledge data exists.

---

## I. Verification of this prompt

- Production `src/**` not edited.
- New files only under `reports/integration/`.
- Repository A remains the starter that already built: `/` and `GET /api/health`.
