# NihongoBridge ETL

TypeScript ETL framework for importing Japanese language knowledge data into the NihongoBridge platform.

Adapted from Repository B's Python ETL (`nihongobridge-etl/`) for Repository A's Drizzle/PostgreSQL stack.

## Architecture

```
etl/
├── adapters/        — Database access layer (Drizzle wrappers)
├── sources/         — Data source definitions and download
├── parsers/         — Format-specific parsers (JMdict XML, KANJIDIC2, Tatoeba TSV)
├── transforms/      — Raw → canonical schema transformers
├── validators/      — Data validation rules
├── matching/        — Cross-entity linking (sentences↔entries, kanji↔radicals)
├── enrichment/      — Post-import enrichment (JLPT, frequency, furigana)
├── exports/         — Export/dump utilities
├── provenance/      — Source tracking and import run logging
├── pipelines/       — Orchestration (end-to-end import flows)
└── tests/           — ETL-specific tests
```

## Usage

```bash
# Run the JMdict dictionary import
npx tsx etl/pipelines/jmdict.ts

# Run the Tatoeba sentence import
npx tsx etl/pipelines/tatoeba.ts

# Run all pipelines
npx tsx etl/pipelines/run-all.ts
```

## Design Principles

1. **Idempotent** — Re-running a pipeline produces the same result (upsert by source+source_id)
2. **Provenance** — Every imported row tracks its source, version, and import timestamp
3. **Checksum** — Unchanged records are skipped (compare checksum before writing)
4. **Batched** — Large imports are processed in configurable batch sizes
5. **Resumable** — Checkpoint support for interrupted imports
6. **Validated** — Data is validated before database writes
7. **Logged** — Every run produces a report with counts, errors, and timing
