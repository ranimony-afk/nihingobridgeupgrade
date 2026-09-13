# PostgreSQL Search API

Phases 08.1–08.2 implement unified search entirely in PostgreSQL. There is no
Meilisearch, Elasticsearch or hosted search provider.

Base URL: `/api`

## Search projection

`search_documents` is a denormalised, derived projection; source domain tables
remain authoritative.

| Entity | Source | Searchable fields |
| --- | --- | --- |
| `dictionary` | `vocabulary` | writing, kana, meanings, parts of speech |
| `kanji` | `kanji`, `kanji_meanings`, `kanji_readings` | literal, on/kun/nanori readings, English meanings, JLPT, stroke count |
| `grammar` | `grammar_points`, patterns, tags, mistakes | title, gloss, summary, explanation, formation, notes, surface patterns, tags, mistakes |
| `sentence` | `sentences`, `sentence_grammar_points` | Japanese, English, matched grammar patterns and grammar titles |
| `course` | published `courses` | English/Japanese title, summary, description, difficulty, JLPT, lesson count |
| `lesson` | published `lessons` + owning course | title, summary, objectives, overview, course title, JLPT |

Projection command:

```bash
node etl/run-content-pipeline.mjs              # canonical sentences/courses/lessons
node etl/run-search-index.mjs
node etl/run-search-index.mjs --only grammar,sentence,course,lesson
```

The ETL first soft-deactivates the selected domains, then upserts current source
rows with `active=true`. Stale projections remain inspectable but cannot appear
in results. It never deletes source knowledge.

## PostgreSQL indexes

`scripts/search-indexes.sql` creates, idempotently:

* `pg_trgm` extension;
* GIN `to_tsvector('simple', search_text)` for full-text search;
* three GIN `gin_trgm_ops` indexes (`search_text`, `primary_text`,
  `secondary_text`);
* B-tree `lower(primary_text)` / `lower(secondary_text)` expression indexes for
  case-insensitive exact matches;
* GIN `jsonb_path_ops` on aliases;
* a partial `(entity_type, priority, id) WHERE active=true` browse index.

`simple` text search is intentional: English facts are tokenised without a
language-specific stemmer, while Japanese uses exact/prefix and trigram
strategies (PostgreSQL does not include a native Japanese morphological parser).

## `GET /api/search`

```
GET /api/search?q=Japanese&mode=auto&types=dictionary,kanji,grammar,sentence,course,lesson&limit=24&offset=0
```

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | string 1–160 | required | NFKC normalised, whitespace collapsed |
| `mode` | `auto \| exact \| full_text \| fuzzy` | `auto` | strategy |
| `types` | comma list | all six | `dictionary,kanji,grammar,sentence,course,lesson`; legacy `vocabulary` maps to `dictionary` |
| `jlpt` | integer 1–5 | none | applies to documents with a level |
| `limit` | integer 1–100 | 24 | page size |
| `offset` | integer ≥0 | 0 | offset pagination |
| `threshold` | 0.1–0.95 | 0.38 | minimum fuzzy score |

Success envelope:

```json
{
  "data": {
    "query": "conditonal",
    "normalizedQuery": "conditonal",
    "mode": "fuzzy",
    "types": ["grammar"],
    "hits": [
      {
        "entityType": "grammar",
        "externalKey": "tara",
        "route": "/grammar/tara",
        "primaryText": "〜たら",
        "secondaryText": "if / when (once … happens)",
        "description": "Conditional that treats the first event as completed.",
        "matchedOn": "fuzzy",
        "score": 178.2,
        "similarity": 0.782
      }
    ],
    "facets": { "kanji": 0, "vocabulary": 0, "grammar": 24 }
  },
  "meta": {
    "engine": "postgresql",
    "strategies": ["exact", "prefix", "full_text", "fuzzy"],
    "pagination": { "limit": 24, "offset": 0, "total": 24, "hasMore": false, "nextOffset": null }
  }
}
```

### Ranking

1. exact (`score ≥ 1000`): case-insensitive equality against primary,
   secondary or an alias;
2. prefix (`score ≥ 700`): primary/secondary/alias prefix;
3. full text (`score ≥ 500`): `ts_rank_cd` over the `simple` vector;
4. fuzzy (`score ≥ 100`): greatest of primary similarity, secondary similarity
   and `word_similarity(query, search_text)`;
5. source `priority` is a sub-one-point tie-breaker (frequency for kanji,
   JMdict priority for vocabulary, teaching order for grammar).

`matchedOn` makes the selected strategy explicit to every client.

## `GET /api/search/suggest`

```
GET /api/search/suggest?q=てし&types=grammar&limit=8
```

Prefix-first, fuzzy-fallback navigation suggestions. Limit 1–20. Cached 30
seconds and protected by the shared rate limiter.

## `GET /api/search/stats`

Returns active/inactive documents by entity type, last indexed timestamp,
`pgTrgm`, `fullTextIndex`, and the number of trigram indexes. Admin and the
Search page surface these diagnostics.

## Errors, cache and limits

The shared v1 API envelope from `docs/api/grammar-api.md` is used:

* 400 `invalid_request` — missing `q`, unknown mode/type, invalid bounds;
* 429 `rate_limited` — 180 searches/minute/IP (suggestions: 300);
* `x-api-version: 1`, CORS `OPTIONS` support;
* `cache-control: public, max-age=60, stale-while-revalidate=300`.

## Deployment

```bash
export DATABASE_URL='postgresql://…?sslmode=require'
npx drizzle-kit push --config drizzle.config.json
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/search-indexes.sql
node etl/run-pipeline.mjs
node etl/run-grammar-pipeline.mjs
node etl/run-content-pipeline.mjs
node etl/run-search-index.mjs
node tests/search-gate.mjs https://your-domain.example
node tests/unified-search-gate.mjs https://your-domain.example
```

Or run `BASE_URL=https://your-domain.example ./scripts/provision.sh`.

Supabase and Neon support `pg_trgm`. The deployment role needs permission to
execute `CREATE EXTENSION IF NOT EXISTS pg_trgm`; if it does not, enable the
extension once in the provider dashboard and rerun the SQL file.
