# Knowledge graph drop folder

Place incremental JSONL here and run:

```
npx tsx scripts/kg-etl.ts files
```

JMdict-like line:

```
{"seq":"1358280","lemma":"食べる","reading":"たべる","pos":"verb","glosses":["to eat"]}
```

KANJIDIC2, Tatoeba, UniDic, and KanjiVG dumps should be converted to this JSONL (or additional typed files) before load. The PostgreSQL schema already has tables for all of those sources.
