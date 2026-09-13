# PHASE 07.2 — Grammar API

Status: **COMPLETE** (implementation · tests · build · docs · gate)

Depends on: PHASE 07.1 (canonical grammar schema & service). 07.2 exposes that
schema through one stable, documented, versioned HTTP contract.

---

## 1. Objective

One grammar API that the web app, admin screen and Flutter client can all share:

* consistent envelope + error codes,
* validated query parameters (no ad-hoc parsing per route),
* pagination on every collection,
* rate limiting + CORS + cache headers,
* a published OpenAPI 3.1 document,
* mobile-friendly batch and graph endpoints.

## 2. API surface

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/grammar` | catalogue: `q`, `jlpt`, `tag`, `register`, `sort`, `limit`, `offset` |
| GET | `/api/grammar/search` | scored search with `matchedOn` + `score` |
| GET | `/api/grammar/[slug]` | point detail, `?include=` payload trimming |
| GET | `/api/grammar/[slug]/examples` | paginated corpus evidence (`minLength`, `maxLength`, `sort`) |
| GET | `/api/grammar/[slug]/related` | BFS over `grammar_relations` (`relation`, `depth`, `limit`) |
| GET | `/api/grammar/[slug]/kanji` | kanji used in the point's examples |
| GET | `/api/grammar/[slug]/vocabulary` | dictionary entries realising a pattern |
| POST/GET | `/api/grammar/batch` | bulk fetch for mobile (≤50 slugs, partial failures tolerated) |
| GET | `/api/grammar/graph` | relation graph for a level/tag slice (closed graph) |
| GET | `/api/grammar/tags` | tag cloud with counts |
| GET | `/api/grammar/levels` | points + examples per JLPT level |
| GET | `/api/grammar/stats` | grammar knowledge counters |
| GET | `/api/grammar/openapi` | OpenAPI 3.1 document |
| OPTIONS | all of the above | CORS pre-flight (204) |

## 3. Implementation evidence

| Area | File | Symbol |
| --- | --- | --- |
| Envelope / errors / CORS / cache | `src/lib/api/http.ts` | `jsonOk`, `jsonError`, `notFound`, `badRequest`, `paginationMeta`, `optionsHandler`, `API_VERSION` |
| Rate limiting | `src/lib/api/rate-limit.ts` | `rateLimit`, `clientId` (sliding window, `X-RateLimit-*`) |
| Validation | `src/lib/api/validate.ts` | zod schemas `grammarListQuery`, `grammarExamplesQuery`, `grammarRelatedQuery`, `grammarGraphQuery`, `grammarBatchBody`, helpers `parseQuery`, `parseJsonBody` |
| Repository | `src/repositories/grammar.ts` | `listGrammarPoints` (+`register`, `sort`), `countGrammarPoints`, `listGrammarExamples`, `countGrammarExamples`, `getRelatedPoints` (BFS), `getGrammarGraph`, `getGrammarLevels`, `listGrammarPointsBySlugs`, `searchGrammarPoints` |
| Service | `src/services/knowledge/grammar-api.ts` | `getGrammarExamples`, `getRelatedGrammarPoints`, `getGrammarMap`, `getGrammarLevelSummary`, `searchGrammar`, `getGrammarBatch` |
| Routes | `src/app/api/grammar/**` | 13 route modules (see table above) |
| Docs | `docs/api/grammar-api.md` | endpoint reference, error codes, client notes |

Sorting is server-side (`relevance | level | order | title | examples`) and every
collection returns `meta.pagination` with `hasMore` / `nextOffset`.

## 4. Test results

```bash
npx next typegen                                   # ✓
npm exec tsc -- --noEmit --pretty false            # ✓ exit 0
npx -- tsc -p tsconfig.etl.json --noEmit           # ✓ exit 0
npm run lint                                       # ✓ exit 0
npm run build                                      # ✓ exit 0
node tests/grammar-api-gate.mjs http://127.0.0.1:3000   # ✓ 70 checks
node tests/grammar-gate.mjs http://127.0.0.1:3000       # ✓ 07.1 regression
node tests/knowledge-gate.mjs http://127.0.0.1:3000     # ✓ 06.4 regression
```

`tests/grammar-api-gate.mjs` covers: envelope + `x-api-version` on every route,
pagination semantics (pages differ, `hasMore`, `nextOffset`), sorting, register
filter, validation failures (`limit`, `jlpt`, `sort` → 400 with
`error.details[]`), 404 contract, search scoring, `include` trimming,
example length filters and match-offset integrity, relation BFS depth 1 vs 2 and
relation filtering, batch (POST + GET, partial failures, invalid body), graph
closure, tags/levels/stats, OpenAPI shape and CORS pre-flight.

## 5. Contract change and compatibility

`GET /api/grammar` and `GET /api/grammar/[slug]` previously returned a bare
object. They now return the v1 envelope (`{ data, meta }`). This is a deliberate,
documented upgrade:

* the only in-repo consumer of the flat shape was `tests/grammar-gate.mjs`, which
  was updated to read `body.data.*` / `body.meta.pagination.total`;
* no UI component calls the grammar API (pages use the service layer directly);
* `docs/api/grammar-api.md` and `/api/grammar/openapi` are the normative contract.

## 6. Defects found & fixed during the phase

| Symptom | Root cause | Fix |
| --- | --- | --- |
| `/api/grammar/graph` referenced nodes outside the requested slice | edges were returned without their neighbour nodes | relations now pull the neighbour points in as `depth: 1` nodes (closed graph) |
| 500s when the schema is not provisioned | repositories propagate SQL errors | grammar services now degrade to empty results / `null`, matching the kanji services |
| duplicated `sources` rows seen earlier | NULL is not distinct in `(code, version)` | `upsertSources` stores `"unversioned"` (fixed in 07.1, verified again here) |

## 7. Regression checks

| Feature | Check | Result |
| --- | --- | --- |
| Kanji Mind Tree (06.4) | `node tests/knowledge-gate.mjs http://127.0.0.1:3000` | ✓ GATE PASSED |
| Grammar schema/service (07.1) | `node tests/grammar-gate.mjs http://127.0.0.1:3000` | ✓ GATE PASSED |
| Web pages | `/`, `/kanji`, `/kanji/語`, `/grammar`, `/grammar/te-shimau`, `/dictionary`, `/admin` | ✓ 200 |
| Health | `GET /api/health` | ✓ `database: up`, 13,108 kanji / 54 grammar points |

## 8. Operations note

The sandbox/platform bootstrap recreates the database, so after
`build_and_start` (or a fresh environment) run:

```bash
npx drizzle-kit push --config drizzle.config.json
node etl/run-pipeline.mjs
node etl/run-grammar-pipeline.mjs
# or: ./scripts/provision.sh
```

Health reports `knowledge.provisioned: false` with a remediation note until this
runs, and the API degrades gracefully (empty collections) instead of 500ing.

## 9. Next steps (07.3 candidates)

* `conjugations` table + API hanging off `grammar_patterns`
  (`GET /api/grammar/[slug]/conjugations`).
* Cursor pagination (`?cursor=`) for very large catalogues.
* ETag / `304 Not Modified` support for the detail routes.
* Per-user endpoints (bookmarks, study state) once authentication lands.
