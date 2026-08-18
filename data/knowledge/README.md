# Knowledge source workspace

Mount or copy licensed source files under this directory before running an import worker. Source archives are deliberately excluded from Git: each release must be reviewed for license, checksum, and attribution before ingestion.

Suggested layout:

```text
data/knowledge/
├── jmdict/JMdict_e.xml.gz
├── kanjidic2/kanjidic2.xml.gz
├── jmnedict/JMnedict.xml.gz
├── tatoeba/sentences.tsv.gz
├── unidic/sentence_tokens.csv.gz
├── jmdict_furigana/furigana.json.gz
├── pitch_accent/pitch.jsonl.gz
├── kanjivg/kanji/              # SVG hierarchy
├── frequency/frequency.tsv.gz
├── jlpt_vocabulary/jlpt.jsonl.gz
├── grammar/grammar.jsonl.gz
├── idioms/idioms.jsonl.gz
├── collocations/collocations.jsonl.gz
└── open_audio/audio.jsonl.gz
```

Run imports only in a controlled worker or release environment:

```bash
npx tsx scripts/knowledge/ingest.ts \
  --dataset jmdict \
  --input "$KNOWLEDGE_DATA_DIR/jmdict/JMdict_e.xml.gz" \
  --version "2026-01" \
  --mode incremental
```

Every run records the source checksum, source version, source attribution registry, parser diagnostics, persisted validation findings, and statistics in PostgreSQL.
