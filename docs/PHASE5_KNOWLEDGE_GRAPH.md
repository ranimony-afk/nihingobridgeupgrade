# Phase 5 — Japanese Knowledge Graph

Normalized graph designed for full EDRDG-scale loads. The first boot imports a validated **core corpus** (N5 lexemes, KANJI60-class characters, Tatoeba sentences, grammar, idioms, collocations). Full JMdict / KANJIDIC2 / Tatoeba dumps are incremental jobs.

## Capacity (schema)

| Entity | Target |
| --- | --- |
| Vocabulary (JMdict) | 250,000+ |
| Kanji (KANJIDIC2) | 13,000+ |
| Sentences (Tatoeba) | 1,000,000+ |
| Grammar | 10,000+ |
| Idioms | 30,000+ |
| Collocations | 50,000+ |

## Sources

JMdict, KANJIDIC2, JMnedict, Tatoeba, UniDic/JMDictFurigana, pitch accent, KanjiVG stroke paths, frequency lists, semantic tags, AI metadata, Open Audio (TTS value today).

## ETL

```
npx tsx scripts/kg-etl.ts core
npx tsx scripts/kg-etl.ts simulate 200
npx tsx scripts/kg-etl.ts files
npx tsx scripts/kg-etl.ts stats
```

Drop JSONL in `data/kg/`. Imports upsert on `(source, external_id)` and skip unchanged checksums.

HTTP: staff `POST /api/v1/admin/kg/import` `{ "source": "core" | "simulate", "limit": 80 }` (simulate capped at 200/request).

## Search

PostgreSQL `to_tsvector('simple', search_document)` plus ILIKE on lemma/reading. GIN index in `drizzle/migrations/0005_phase5_kg.sql`.

## Apps

- `/dictionary` `/dictionary/[id]`
- `/kanji` `/kanji/[char]`
- `/grammar`
- `/admin/kg`
- REST `/api/v1/kg/*`
