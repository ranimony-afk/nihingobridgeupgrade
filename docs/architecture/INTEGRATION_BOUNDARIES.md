# INTEGRATION BOUNDARIES

**Version:** 1.0 — Frozen with `ARCHITECTURE_FREEZE.md` v3.0  
**Date:** 2026-03-25  
**Purpose:** define exactly how Repository B material may cross into Repository A, and what may never cross.

---

## 1. The boundary rule

```
Repository B  ──(read-only reference)──▶  human/agent review  ──▶  A-native implementation
```

Repository B code is **never** executed, imported, linked, vendored, or copied into Repository A. Only **knowledge about how B works** crosses the boundary, and it is re-implemented against A's stack and contracts.

| Crossing | Allowed? |
|---|---|
| Copy a B file into A | ❌ |
| Add `file:../nihongobridge-knowledge` dependency | ❌ |
| Run B migrations on A's database | ❌ |
| Deploy a B service alongside A | ❌ |
| Read a B algorithm and re-implement it in A's stack | ✅ |
| Port a B test case as an A regression test | ✅ |
| Reuse a B prompt/contract as a specification | ✅ |

---

## 2. Internal boundaries inside Repository A

```
┌──────────────────────────────────────────────┐
│ Clients: Web (Next.js)   Flutter (mobile/)   │
└───────────────┬──────────────────────────────┘
                │ HTTP  /api/v2 · /api/ai · /api/auth
┌───────────────▼──────────────────────────────┐
│ Edge: src/middleware.ts                      │
│ auth · RBAC · CORS · security headers · rate │
└───────────────┬──────────────────────────────┘
┌───────────────▼──────────────────────────────┐
│ Route handlers (src/app/api/**)              │
│ validate · authorize · serialize             │
└───────────────┬──────────────────────────────┘
┌───────────────▼──────────────────────────────┐
│ Services (src/services/**)  ← business rules │
└───────────────┬──────────────────────────────┘
┌───────────────▼──────────────────────────────┐
│ Repositories (src/repositories/**)  ← SQL    │
└───────────────┬──────────────────────────────┘
┌───────────────▼──────────────────────────────┐
│ PostgreSQL (one schema)     ▲                │
└─────────────────────────────┼────────────────┘
                              │ writes only
                        ┌─────┴─────┐
                        │  etl/**   │  offline jobs
                        └───────────┘
```

### 2.1 Layer rules

| Layer | May call | May **not** |
|---|---|---|
| Client | HTTP API | import `src/services`, touch the DB |
| Middleware | auth service | contain domain logic |
| Route handler | its own domain service | write SQL, call another domain's repository |
| Service | own repository, other **services** | other domains' repositories/tables |
| Repository | Drizzle + its own tables | HTTP, other domains' tables |
| ETL | repositories/adapters | serve HTTP, call route handlers |

**Violation examples (all forbidden):** a route handler running Drizzle directly; the AI service writing `xp_events`; the Flutter app computing SRS due dates; ETL calling `/api/v2`.

---

## 3. Per-package boundary contracts

### 3.1 `nihongobridge-knowledge` → A schema

| Crosses | Does not cross |
|---|---|
| Index strategy (GIN `gin_trgm_ops`, weighted `tsvector`) | uuid primary keys |
| Column ideas: `romaji`, structured `furigana`, pitch accent | JSON-denormalized meanings |
| Bridge-table pattern for entity graph | `drizzle/*.sql` migrations |
| Composite-FK integrity idea (card ↔ deck+owner) | `jlptLevelEnum` labels |

Method: a human-reviewed additive change to `src/db/schema.ts`, never a schema import.

### 3.2 `nihongobridge-api` → A `/api/v2`

| Crosses | Does not cross |
|---|---|
| Endpoint *capabilities* A lacks (autocomplete, by-radical, level filters, bulk, random, test-session state machine) | route files, Next 14 runtime |
| Zod-style boundary validation discipline | `{ data, meta, error }` envelope |
| Rate-limit/cache concepts | mandatory Redis |
| Vitest contract cases | postgres.js client |
| PostgreSQL fallback reasoning | Meilisearch client |

### 3.3 `nihongobridge-ai` → A `src/services/ai`

| Crosses | Does not cross |
|---|---|
| Hana-sensei prompt contract (JLPT-aware, `<ruby>`, explain-why, ≤200 words) | Supabase JWT auth |
| Prompt-injection defence ("student text is data") | `tier` gating (deferred to monetization) |
| `lookup_dictionary` tool-calling **as an in-process service call** | HTTP self-call to `/api/dictionary/search` |
| `ai_explanations` cache table | ioredis requirement |

### 3.4 `nihongobridge-etl` → A `etl/`

| Crosses | Does not cross |
|---|---|
| JMdict `lxml` parse algorithm → TypeScript streaming parser | Python runtime in production |
| Tatoeba stage-then-load design | SQLite staging as a permanent dependency |
| Enricher logic (JLPT, frequency, matching) | MeCab at request time — furigana is precomputed offline |
| SHA-256 checksum enforcement | MinIO/S3 coupling |
| Question generators + quality checker | Edge TTS redistribution (blocked pending license) |

### 3.5 `nihongobridge-search` → A search service

| Crosses | Does not cross |
|---|---|
| Japanese normalization (kana/romaji folding) | Fastify service |
| Field-weighting and typo-tolerance concepts | Meilisearch index/sync |
| Autocomplete latency target | `LISTEN/NOTIFY` sync triggers |

### 3.6 `nihongobridge-web` → A web

| Crosses | Does not cross |
|---|---|
| Screen inventory and UX flows | Next 14 / React 18 components verbatim |
| Ruby/furigana sanitization pattern | `lib/demo-*.ts` fixtures |
| Test-runner interaction model (timer, flagging, section nav, review) | `zustand`/`react-query` choices by default |

### 3.7 `nihongobridge-admin` → A admin

| Crosses | Does not cross |
|---|---|
| RBAC role model and audit-log schema | header-injected identity (`x-admin-user-id`) |
| ETL run table + SSE progress UX | `demoAllowed()` auto-`super_admin` |
| Editorial review workflow | remote `ETL_CONTROL_URL` service |

### 3.8 `nihongobridge-mobile` → A `mobile/`

| Crosses | Does not cross |
|---|---|
| App architecture (Riverpod, dio, sqflite, secure storage) | B auth token flow |
| Offline cache + outbox queue design | endpoints pointing at unversioned `/api/*` |
| Feature screen inventory | any client-side scheduling/scoring |

### 3.9 `nihongobridge-platform` → A ops

| Crosses | Does not cross |
|---|---|
| CI gate shape (lint → typecheck → build → test) | 7-service docker-compose |
| Healthcheck discipline | Redis/Meili/MinIO/Mailhog/Adminer |
| Migration/seed script ergonomics | multi-repo checkout CI |

---

## 4. Integration protocol (per component)

Every crossing follows these steps, in order:

1. **Cite** the B source path and the behaviour being adopted.
2. **Classify** it against the master matrix (KEEP/MERGE/ADAPT/REWRITE/DEPRECATE/REJECT).
3. **Map** it to a single A owner (service + tables + route).
4. **Check gates** — schema exists, identity exists, upstream phase complete.
5. **Implement A-native** in A's stack; no B imports.
6. **Test** — port B's test cases where they encode real rules.
7. **Verify** — `next typegen`, `tsc --noEmit`, `npm run build`, healthcheck.
8. **Regression** — confirm 3–5 existing features still work.
9. **Record** — evidence, decision, and any new risk.

A crossing that cannot satisfy step 3 (single owner) **stops** and is reported.

---

## 5. Dependency gates

```
G0 schema in deployable tree        ← blocks everything
G1 identity + auth                  ← blocks all learner-mutating features
G2 ETL parsers + provenance         ← blocks knowledge data
G3 enrichment                       ← blocks quality search/learning
G4 search (pg_trgm + FTS)           ← blocks dictionary UX
G5 knowledge APIs                   ← blocks clients
G6 learning + assessment            ← blocks SRS seeding at scale
G7 SRS                              ← blocks review UX
G8 gamification
G9 AI                               ← requires G2–G5 (knowledge-first)
G10 admin                           ← requires G1
G11 mobile                          ← requires G1 + G5 frozen
G12 monetization
```

No gate may be skipped or run in parallel with its blocker.

---

## 6. Hard boundary violations (gate failures)

1. A second implementation of dictionary lookup, search ranking, grading, scheduling, XP, or identity.
2. Any Repository B file present in A's tree.
3. A second database, schema file, or ORM client.
4. Business logic in a route handler, component, or Flutter screen.
5. A domain writing another domain's tables.
6. Authorization derived from a request header, path parameter, or client claim.
7. A required external service (Meili/Redis/MinIO/Supabase) added without an authorizing decision.
8. Knowledge imported without provenance and a permitted license.
9. `GET /api/health` changing shape.
10. Destructive DDL without authorization.

---

## 7. Allowed external dependencies (v1)

| Dependency | Status |
|---|---|
| PostgreSQL | required |
| Node.js / Next.js runtime | required |
| LLM provider (OpenAI or Anthropic) | optional — mock fallback when unset |
| Redis | optional, never required |
| Object storage | deferred, provider-abstracted |
| Meilisearch | excluded from v1 |
| Supabase | excluded |

The platform must run correctly with **only** PostgreSQL and the Node runtime configured.
