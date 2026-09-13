# Knowledge ETL

Additive, provenance-first ingestion of the EDRDG datasets into the canonical
PostgreSQL schema (`src/db/schema.ts`). The pipeline never emits `DROP`,
`TRUNCATE` or `DROP COLUMN`: every statement is `INSERT ... ON CONFLICT DO UPDATE`
or an additive `UPDATE` of a derived counter.

## Layout

```
etl/
├── data/                 # cached upstream files (checksummed, never edited)
├── lib/util.mjs          # download (curl), gunzip, EUC-JP decoding, chunking
├── parsers/              # streaming parsers per dataset
│   ├── kanjidic2.mjs     # <character> blocks -> kanji rows
│   ├── kradfile.mjs      # `亜 : ｜ 一 口` -> kanji -> components
│   ├── jmdict.mjs        # <entry> blocks -> vocabulary headwords
│   └── tanaka-examples.mjs  # Tanaka `A:` lines -> JA/EN sentence pairs; grammar seed loader
├── transforms/           # graph derivation lives in run-pipeline.mjs today
├── loaders/postgres.mjs  # chunked inserts, source upsert, run bookkeeping
├── provenance/           # recorded through `sources` + `etl_runs` tables
├── sources/registry.mjs  # dataset registry (urls, licences, encodings)
└── run-pipeline.mjs      # orchestration
```

## Requirements

* `DATABASE_URL` (see `.env.example`)
* `curl` on `PATH` (used because the upstream files are published over `ftp://` as
  well as `https://`)
* Node 20+

## Commands

```bash
# schema
npx drizzle-kit push --config drizzle.config.json

# full pipeline (KANJIDIC2 + RADKFILE/KRADFILE + JMdict)
node etl/run-pipeline.mjs

# individual stages (all re-runnable)
node etl/run-pipeline.mjs --only kanji
node etl/run-pipeline.mjs --only structure
node etl/run-pipeline.mjs --only vocabulary --max-priority 2

# grammar pipeline (curated points -> corpus evidence)
node etl/run-grammar-pipeline.mjs
node etl/run-grammar-pipeline.mjs --max-examples 8 --max-length 45

# canonical sentences and learning catalogue
node etl/run-content-pipeline.mjs

# course -> module -> lesson architecture and knowledge links
node etl/run-course-architecture.mjs  # also loads authored lesson sections and derives vocabulary/sentence links

# PostgreSQL search projection (run after source-domain ETLs)
node etl/run-search-index.mjs
node etl/run-search-index.mjs --only kanji,grammar

# verification
node tests/knowledge-gate.mjs
node tests/knowledge-gate.mjs http://127.0.0.1:3000
node tests/grammar-gate.mjs
node tests/grammar-gate.mjs http://127.0.0.1:3000

# everything at once
./scripts/provision.sh
```

## Grammar pipeline (`etl/run-grammar-pipeline.mjs`)

1. Loads the curated seed (`etl/data/grammar-points.json`, CC BY-SA 4.0).
2. Upserts `grammar_points`, `grammar_patterns`, `grammar_tags`,
   `grammar_point_tags` and `grammar_relations`.
3. Streams the Tanaka corpus and harvests up to `--max-examples` sentences
   (≤ `--max-length` characters) per point whose Japanese text literally
   contains a pattern's `match_text`.
4. Stores the match offset per example in `grammar_example_matches` (evidence).
5. Links each point to the kanji in its examples and to vocabulary entries whose
   writing realises a pattern.
6. Refreshes `grammar_points.example_count` and records an `etl_runs` row.

## Stage outputs (current dataset)

| Stage | Rows |
| --- | --- |
| kanji (KANJIDIC2) | 13,108 characters, 24,815 meanings, 40,502 readings |
| radicals (RADKFILE) | 253 groups, 190 canonical Kangxi radicals |
| kanji↔radical links | 37,064 |
| components (KRADFILE) | 253 glyphs, 25,699 decomposition links |
| vocabulary (JMdict) | 25,436 entries, 51,367 kanji↔vocabulary links |
| grammar (curated + Tanaka) | 54 points, 63 patterns, 429 examples with match offsets, 47 relations |
| search projection (PostgreSQL) | 38,598 active documents: 13,108 kanji + 25,436 vocabulary + 54 grammar |

## Runtime behaviour

* Downloads are cached in `etl/data`; a re-run is offline-safe once populated.
* `sources` rows are keyed by `(code, version)` and refreshed on every run.
* Each run writes an `etl_runs` row with status, timings and record counters —
  visible at `/admin` and `GET /api/admin/etl/status`.
