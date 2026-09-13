# Phase 05.2 — Dictionary v2 API

**Status:** ✅ Implemented and search integration tested.

## Canonical routes

| Route | Handler | Service boundary |
|---|---|---|
| `GET /api/v2/dictionary/search` | `src/app/api/v2/dictionary/search/route.ts` | `DictionarySearch` → `DictionaryService.searchV2()` → `DictionaryRepository.searchV2()` |
| `GET /api/v2/dictionary/entries/:id` | `src/app/api/v2/dictionary/entries/[id]/route.ts` | `DictionaryService.getByIdV2()` → `DictionaryRepository` |

Neither route imports Drizzle, `db`, or schema tables. `DictionaryRepository` remains the sole dictionary persistence boundary.

## Search contract

```http
GET /api/v2/dictionary/search?q=<term>&jlpt=N1..N5&limit=1..25
```

At least one of `q` or `jlpt` is required.

| Search input | Handling |
|---|---|
| Japanese/kanji | literal headword match, e.g. `q=食` → `食べる` |
| Kana | literal reading match, e.g. `q=みず` → `水` |
| Romaji | literal term plus WanaKana conversion **only when fully kana**, e.g. `q=mizu` → `みず` |
| English | case-insensitive literal search over structured JMdict sense glosses, e.g. `q=water` → `水` |
| JLPT | optional `jlpt=N1`–`N5` filter on direct or source-curated enrichment labels from successful visible source runs |

`position()` is used for all user-supplied substring comparisons; user input is never interpolated into `LIKE`, so `%`/`_` cannot act as wildcard controls.

Results rank exact headword, exact reading, exact English gloss, then headword/reading/English substring matches.

### Romaji ambiguity policy

Latin text is ambiguous: `mizu` is romaji, while `water` is an English gloss. The service always retains the literal term for English matching and adds WanaKana output only if it is entirely kana. It does not discard an English lookup just because it is made of Latin characters.

## JLPT provenance policy

The current JLPT does **not** publish a fixed official list of vocabulary, grammar, or kanji. Consequently:

- `jlpt` values are labelled **source-curated**, not official JLPT requirements;
- only successful, provenance-linked enrichment runs are considered;
- synthetic fixture enrichments are visible in dev/test but hidden with `NODE_ENV=production`;
- external supplemental lists remain fail-closed until they pass licence, checksum, attribution, and explicit source-review policy.

## Entry response

`GET /api/v2/dictionary/entries/:id` returns `DictionaryV2Entry` with `apiVersion: "v2"`, dictionary forms/readings/senses, admitted enrichments, and source provenance.

Stable errors:

| Condition | Status | Code |
|---|---:|---|
| no `q` and no `jlpt`; invalid limit/JLPT | 400 | `INVALID_QUERY` |
| malformed/non-positive ID | 400 | `INVALID_ID` |
| absent entry | 404 | `NOT_FOUND` |
| unexpected service failure | 500 | `INTERNAL_ERROR` |

Both routes return `Cache-Control: public, max-age=60, s-maxage=300`.

## Web integration

`src/app/dictionary/DictionaryClient.tsx` now uses only:

- `/api/v2/dictionary/search`
- `/api/v2/dictionary/entries/:id`

The page makes no direct database, Drizzle, repository, or service import.
