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
│   └── jmdict.mjs        # <entry> blocks -> vocabulary headwords
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

# verification
node tests/knowledge-gate.mjs
node tests/knowledge-gate.mjs http://127.0.0.1:3000
```

## Stage outputs (current dataset)

| Stage | Rows |
| --- | --- |
| kanji (KANJIDIC2) | 13,108 characters, 24,815 meanings, 40,502 readings |
| radicals (RADKFILE) | 253 groups, 190 canonical Kangxi radicals |
| kanji↔radical links | 37,064 |
| components (KRADFILE) | 253 glyphs, 25,699 decomposition links |
| vocabulary (JMdict) | 25,436 entries, 51,367 kanji↔vocabulary links |

## Runtime behaviour

* Downloads are cached in `etl/data`; a re-run is offline-safe once populated.
* `sources` rows are keyed by `(code, version)` and refreshed on every run.
* Each run writes an `etl_runs` row with status, timings and record counters —
  visible at `/admin` and `GET /api/admin/etl/status`.
