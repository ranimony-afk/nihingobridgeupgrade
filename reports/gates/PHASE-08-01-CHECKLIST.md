# PHASE 08.1 — PostgreSQL exact / full-text / fuzzy search

Status: **COMPLETE** (schema · projection ETL · indexes · service · API · UI ·
tests · build · deployment gate)

Decision: **PostgreSQL is the only search engine. Meilisearch is not introduced.**

Depends on: 06.4 (kanji/vocabulary), 07.1–07.4 (grammar). Search projects those
canonical tables; it does not own or duplicate domain business logic.

---

## 1. Architecture

```
canonical domain tables
  ├─ kanji + kanji_meanings + kanji_readings
  ├─ vocabulary
  └─ grammar_points + patterns + tags + mistakes
                  │
                  ▼ (etl/run-search-index.mjs: soft-deactivate + upsert)
          search_documents
          ├─ B-tree exact indexes
          ├─ GIN to_tsvector('simple', search_text)
          ├─ GIN pg_trgm (search/primary/secondary text)
          ├─ GIN jsonb aliases
          └─ active/type/priority partial index
                  │
                  ▼
      repository → service → /api/search → /search
```

`search_documents` is a **derived projection** only. Source tables remain the
one source of truth. A re-index sets selected domains `active=false`, then
upserts current entities with `active=true`; stale documents never appear, but
no source knowledge is deleted.

## 2. Exact / full-text / fuzzy implementation

| Strategy | PostgreSQL expression | Rank band |
| --- | --- | --- |
| exact | `lower(primary_text/secondary_text/alias) = lower($q)` | ≥1000 |
| prefix | `primary_text/secondary_text/alias ILIKE '$q%'` | ≥700 |
| full-text | `to_tsvector('simple', search_text) @@ plainto_tsquery('simple', $q)` + `ts_rank_cd` | ≥500 |
| fuzzy | greatest of `similarity(primary,$q)`, `similarity(secondary,$q)`, `word_similarity($q,search_text)` | ≥100 |
| tie-break | domain priority: kanji frequency, JMdict priority, grammar teaching order | <1 point |

`mode=auto` combines them in exactly that order. `matchedOn` exposes the chosen
strategy and `similarity` exposes the pg_trgm score to clients.

The `simple` text configuration is deliberate: English meanings and explanations
are tokenised; Japanese exact/readings/patterns use equality, prefix and trigram
matching, because stock PostgreSQL has no Japanese morphological parser.

## 3. Files and symbols

| Area | File | Evidence |
| --- | --- | --- |
| Schema | `src/db/schema.ts` | `searchDocuments` — one polymorphic projection (`kanji | vocabulary | grammar`), stable source key, canonical route, display/search text, aliases, JLPT, priority, active/index timestamps |
| DDL | `scripts/search-indexes.sql` | `CREATE EXTENSION IF NOT EXISTS pg_trgm`; full-text GIN; 3 trigram GIN; lower-case B-tree; aliases GIN; active partial index; all `IF NOT EXISTS` |
| ETL | `etl/run-search-index.mjs` | projection builders for all 3 domains, soft deactivation, chunked upsert, DDL execution, `etl_runs` bookkeeping, `--only` support |
| Contracts | `src/types/search.ts` | `SearchHit`, `SearchResultPage`, `SearchFacets`, `SearchSuggestion`, `SearchIndexStats`, entity/mode/match enums |
| Repository | `src/repositories/search.ts` | `searchPostgres`, `suggestPostgres`, `getSearchIndexStats`; one ranked SQL CTE with total/facet window counts |
| Service | `src/services/search/postgres-search.ts` | `normalizeSearchQuery` (NFKC + whitespace), `searchKnowledge`, `suggestKnowledge`, `getSearchHealth`; safe empty result on a fresh schema |
| Validation | `src/lib/api/validate.ts` | `searchQuery`, `searchSuggestQuery` (strict modes/types/bounds) |
| API | `src/app/api/search/route.ts` | unified search + facets + pagination; `meta.engine = postgresql`, strategy list |
| API | `src/app/api/search/suggest/route.ts` | autocomplete, prefix first / fuzzy fallback |
| API | `src/app/api/search/stats/route.ts` | document counts, extension/index health, last index timestamp |
| UI | `src/app/search/page.tsx` | server-rendered first page + index status; explicit “PostgreSQL only” disclosure |
| UI | `src/components/search/unified-search.tsx` | interactive strategy/type filters, autocomplete, facets, load-more, canonical result links |
| Ops | `scripts/provision.sh` | Drizzle schema → search DDL → knowledge ETL → grammar ETL → search projection → DB gates → optional HTTP gates |
| Admin | `src/app/admin/page.tsx` | active docs by type, pg_trgm / FTS readiness, exact rebuild commands |
| Docs | `docs/api/search-api.md`, `docs/DEPLOYMENT.md`, `etl/README.md` | contract, ranking, infrastructure and deployment commands |

## 4. Indexed data and infrastructure

| Entity | Active documents |
| --- | ---: |
| kanji | 13,108 |
| vocabulary | 25,436 |
| grammar | 54 |
| **total** | **38,598** |

Infrastructure gate:

```
PASS db: pg_trgm enabled
PASS db: full-text GIN index
PASS db: trigram indexes — 3 indexes
PASS db: aliases GIN index
PASS db: no stale active projection after rebuild
PASS db: projection has no dangling entities
```

The search table currently has 15 indexes total (primary/unique/domain B-tree,
2 lower-case exact expressions, full-text GIN, 3 trigram GIN, aliases GIN,
JLPT/priority/active indexes).

## 5. API

### `GET /api/search`

`q` (required), `mode=auto|exact|full_text|fuzzy`,
`types=kanji,vocabulary,grammar`, `jlpt=1..5`, `limit=1..100`, `offset>=0`,
`threshold=0.1..0.95`.

Response uses the shared API v1 envelope and includes:

* `data.hits[]`, `data.facets`, normalised query/mode/types;
* `meta.pagination` (`hasMore`, `nextOffset`);
* `meta.engine = "postgresql"`;
* `meta.strategies = ["exact","prefix","full_text","fuzzy"]`;
* `x-api-version`, CORS, cache and rate-limit headers.

Other routes:

* `GET /api/search/suggest?q=...&types=...&limit=...`
* `GET /api/search/stats`

See `docs/api/search-api.md`.

## 6. Deployment gate

```bash
npx next typegen                              # ✓
npm exec tsc -- --noEmit --pretty false       # ✓
npx -- tsc -p tsconfig.etl.json --noEmit      # ✓
npm run lint                                  # ✓
npm run build                                 # ✓
build_and_start                               # ✓ health
node tests/search-gate.mjs http://127.0.0.1:3000  # ✓ GATE PASSED
```

Behavioral evidence from the gate:

```
PASS exact: 語 → kanji, matchedOn=exact, score=1001
PASS exact alias: みず → 水
PASS full-text: "completion regret" → grammar/te-shimau
PASS fuzzy: "conditonal" → grammar hits, matchedOn=fuzzy
PASS fuzzy kana: "にほんこ" → vocabulary containing 日本語
PASS auto ordering: exact → prefix → full_text → fuzzy order preserved
PASS type and JLPT filters
PASS disjoint offset pages + pagination metadata
PASS suggestions: "てし" → te-shimau
PASS Search SSR: exact and full-text deep links contain canonical result routes
PASS journey: search result → /grammar/te-shimau detail page
```

The gate also rejects `mode=meilisearch` with 400, proving the public contract
accepts only PostgreSQL-backed strategies.

## 7. Regression checks

| Phase / feature | Command | Result |
| --- | --- | --- |
| 06.4 Kanji Mind Tree | `node tests/knowledge-gate.mjs $BASE_URL` | ✓ GATE PASSED |
| 07.1 grammar schema/service | `node tests/grammar-gate.mjs $BASE_URL` | ✓ GATE PASSED |
| 07.2 grammar API | `node tests/grammar-api-gate.mjs $BASE_URL` | ✓ GATE PASSED |
| 07.3 grammar explorer | `node tests/grammar-explorer-gate.mjs $BASE_URL` | ✓ GATE PASSED |
| 07.4 grammar detail | `node tests/grammar-detail-gate.mjs $BASE_URL` | ✓ GATE PASSED |
| Existing pages | `/`, `/kanji/語`, `/dictionary?q=日本語`, `/grammar`, `/grammar/te-shimau`, `/admin` | ✓ 200 |

## 8. Production deployment

```bash
export DATABASE_URL='postgresql://…?sslmode=require'
npx drizzle-kit push --config drizzle.config.json
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/search-indexes.sql
node etl/run-pipeline.mjs
node etl/run-grammar-pipeline.mjs
node etl/run-search-index.mjs
BASE_URL=https://your-domain.example node tests/search-gate.mjs "$BASE_URL"
```

Or:

```bash
BASE_URL=https://your-domain.example ./scripts/provision.sh
```

Supabase and Neon support `pg_trgm`; if the deploy role cannot create extensions,
enable it once in the provider dashboard and rerun `scripts/search-indexes.sql`.

## 9. Stop conditions / deferred scope

* No Meilisearch client, dependency, index or environment variable was added.
* Japanese morphological full-text search is deferred; exact/prefix/trigram is
  the correct PostgreSQL-first baseline.
* Semantic/vector search is intentionally deferred to a future phase after AI
  retrieval requirements and embedding provenance are approved.
