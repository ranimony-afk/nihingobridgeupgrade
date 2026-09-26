# Phase 14.3D — Search readiness

**Corpus-scale search measurement:** NOT EXECUTED. No loaded 206717-row database was planned or timed this pass. No index was added.

## Stored shape

`dictionary_entries` is created in `drizzle/0000_absurd_emma_frost.sql` with a primary key on `id` only. There is no secondary btree, no GIN index, no trigram index, and no expression index on `headword`, `reading`, `romaji`, `senses`, or `tags`.

That is sufficient for id lookup and for the ingestion conflict check, which loads existing rows by id. It is not a search index.

## Current query

`DictionaryService.searchEntries` matches with `ILIKE '%query%'` on `headword`, `reading`, `romaji`, and `senses::text`. A leading-wildcard `ILIKE` cannot use a normal btree even if one is added later.

Ranking, when a query is present, is a SQL `CASE`: exact headword, exact reading, case-insensitive exact romaji, then a quoted gloss fragment, with `frequencyRank` and `isCommon` as tie-breaks. `frequencyRank` is the derived `nfNN * 500` value, not an external frequency list.

The service does not query `tags`. Alternative headwords (`alt:`), alternative readings (`alt-reading:`), restrictions, field/misc/dialect, and non-English gloss tags are therefore stored and not searchable. The transformer comment that those tags are "for search indexing" is not implemented.

| Query need | Status |
| :--- | :--- |
| Exact id | Supported by the primary key. |
| Substring headword / reading / romaji / English gloss | Implemented as a sequential `ILIKE`. Corpus latency NOT EXECUTED. |
| Alternative orthography or reading | NOT SUPPORTED by the current query. Data is in `tags` only. |
| Part of speech, field, dialect | NOT SUPPORTED as filters. Data is in `tags` or `parts_of_speech`, and search does not filter those. |
| Tamil / Malayalam gloss | NOT SUPPORTED. `targetLanguage` on the mobile route is parsed and deliberately unused. |
| Sense-aware or token search | NOT SUPPORTED. `senses::text` matches the JSON text, including punctuation and keys. |

## API projection

`GET /api/v1/mobile/dictionary/search` returns the frozen 9-field card from `projectEntry`: `id`, `headword`, `reading`, `romaji`, `primaryGlosses`, `jlptLevel`, `jlptStatus`, `isCommon`, `kanjiCharacters`.

Deliberately absent from that card: `sourceRef`, `frequencyRank`, `partsOfSpeech`, `tags`, alternative forms, and localized glosses. `sourceRef` stays off the public card. Authentication and rate limiting (D-13) are still deferred. The query-length cap is present and is not abuse protection.

No new public API was added.

## RAG

NOT SUPPORTED. `dictionary_entries` has no embedding column. No vector extension, chunker, or retrieval store is written by 14.3D. None was added in this pass.

## Index decision

No index migration was added. A GIN or trigram index would be a schema change, and this pass has no `EXPLAIN` on the pinned corpus to justify one. Adding one without that measurement would not make alternative-form search work, because the query does not read `tags`.

Search readiness for the full corpus: **NOT READY**. The gap is recorded here. It is not a 14.3D ingestion failure, and it is not authorization to start a search phase.
