# Phase 12 — Search

Elastic-style search built entirely on PostgreSQL. No new infrastructure to run.

## Why not Elasticsearch

Everything Elastic gives us here — weighted full text, fuzzy matching, autocomplete,
facets, ranking, suggestions — is available in Postgres via `tsvector`, `pg_trgm`,
and `fuzzystrmatch`. One less service to deploy, back up, and secure.

## Unified index

`search_index` holds one row per document across **8 content types**:
lexeme, kanji, sentence, grammar, idiom, collocation, post, course.

| Column | Purpose |
| --- | --- |
| `tsv` | Weighted `tsvector` — title **A**, subtitle **B**, body **C** |
| `title_norm` | NFKC + lowercased title for trigram matching |
| `boost` | Frequency-derived 0–1 prior (rank 1 word ≈ 1.0) |
| `jlpt`, `pos`, `difficulty` | Facet/filter columns |

Indexes: GIN on `tsv`, GIN trigram on `title_norm` and `body`.

## Ranking

```
score = ts_rank_cd × 4
      + trigram similarity × 3
      + exact title match × 5
      + prefix match × 1.5
      + frequency boost × 2
```

Exact matches always sort first — searching `水` returns 水 at the top, not a
sentence that merely contains it.

## Query syntax

```
water                    free text
type:kanji               filter by content type (types:/kind:/kinds: also work)
jlpt:n5                  filter by JLPT level
pos:verb                 filter by part of speech
difficulty:<=4           max difficulty
-casual                  exclude a term
```

## Japanese handling

The `simple` text-search config cannot tokenize Japanese (no spaces), so
Japanese queries are served by **trigram + substring** matching, which is
codepoint-based and works fine on kana/kanji. `食べ` matches `食べる`.

## Fuzzy matching

Two different thresholds, because they measure different things:

- `similarity()` — whole-string, loosens as the query grows (dilution).
- `word_similarity()` — best matching extent inside a document, held at **0.4**.

That second threshold matters. Measured on the live index: `watre` → `water`
scores **0.50**, while gibberish (`zzzzqqqxnotathing`) peaks at **0.235**. A
looser bound would let nonsense clip real words and return junk.

## Romaji

The knowledge graph stores readings in kana only, so typing `taberu` would
never reach 食べる. The indexer transliterates every reading
(`src/lib/search/romaji.ts`) and stores both a faithful form and a shortened
long-vowel form — `toukyou` **and** `tokyo`, `koohii` **and** `kohi`.

Handles digraphs (きょ→kyo), dakuten (べ→be), sokuon (がっこう→gakkou),
katakana, and chōonpu (コーヒー→koohii).

## Suggestions

`search_terms` stores distinct titles **and Latin gloss words**. A Japanese
title alone can never fix an English typo, so gloss words are indexed
separately for "did you mean".

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/v1/search?q=&type=&jlpt=&limit=&offset=` | Ranked results + facets |
| `GET /api/v1/search/autocomplete?q=` | Prefix + trigram completions |
| `GET /api/v1/search/suggest?q=` | "Did you mean" + popular queries |
| `GET /api/v1/admin/search` | Index size, popular + zero-result queries |
| `POST /api/v1/admin/search` | Rebuild the index |

Rate limited to 120 searches/min per client.

## UI

- `/search` — facets, "did you mean", keyboard-navigable results
- `SearchBox` — debounced autocomplete with arrow-key selection
- `/admin/search` — index stats, reindex, and **zero-result queries** (content gaps)

## Operations

The index rebuilds on first boot and via the admin button. After bulk content
imports, run:

```bash
curl -X POST /api/v1/admin/search   # staff session required
```
