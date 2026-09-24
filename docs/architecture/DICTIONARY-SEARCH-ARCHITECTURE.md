# Dictionary Search Architecture

**Status**: IMPLEMENTED (layers) · **partially verifiable** — the classification and ranking
layers are deterministic and run without a database; the data-dependent layers require the
canonical corpus and cannot be exercised in a provisioning-free environment.
**Phase**: 14.4F-R (search contract) · builds on 14.4A (architecture) and Phase 7 (search)
**Last updated**: 2026-09-24

---

## 1. Scope

Defines how a query reaches a ranked dictionary result. Two entry points share this design:

| Endpoint | Intent |
| :--- | :--- |
| `GET /api/dictionary` | General use: listing, JLPT filtering, `?autocomplete=true` |
| `GET /api/dictionary/search` | Explicit query-driven lookup; echoes the classification so clients render the match mode instead of guessing |

`GET /api/search` (`UnifiedSearchService`) applies the same pipeline across entity types —
dictionary, kanji, radicals, grammar, sentences, JLPT.

---

## 2. Layer Model

```
query
  ↓
1. normalization          sanitizeSearchQuery      — strip null bytes, trim
  ↓
2. classification         detectSearchScript       — kanji | kana | japanese | romaji | empty | mixed
  ↓
3. exact ID / orthography headword === query, or canonical id match
  ↓
4. exact reading          reading === query
  ↓
5. romaji                 romaji.toLowerCase() === query
  ↓
6. translation            entity_translations lookup (en / ta / ml)
  ↓
7. kanji                  characters in the headword
  ↓
8. prefix / contains      ILIKE with escaped pattern
  ↓
9. ranking                deterministic comparator (see §5)
  ↓
result set
```

Layers 1–2 are **pure functions** (`src/services/search/matcher.ts`) and fully unit-testable.
Layers 3–8 execute SQL and require the canonical corpus. Layer 9 is applied in-process after
fetch, so its ordering is independent of database collation.

---

## 3. Normalization

`sanitizeSearchQuery` (matcher.ts):

- strips `\0` (null bytes cannot appear in Japanese text and are a common injection probe)
- trims surrounding whitespace
- returns `""` for non-string input rather than throwing

Route-level guards add a further bound: `/api/dictionary/search` returns **400
`MISSING_QUERY`** when the sanitized query is empty, and never calls the service.

## 4. Classification

`detectSearchScript` returns one of:

| Value | Condition |
| :--- | :--- |
| `empty` | blank after trim |
| `kanji` | contains kanji, no kana |
| `kana` | contains kana, no kanji |
| `japanese` | contains both kanji and kana |
| `romaji` | matches `/^[a-zA-Z0-9\s\-–—'’.,!?_()]+$/` |
| `mixed` | none of the above |

The classification is **echoed in the response** (`data.detectedScript`) so the contract is
explicit and testable. Clients should not re-derive it — a divergence between client and
server classification would silently change ranking behaviour.

**Known limitation**: `romaji` is a character-class test, not a language test. English and
romaji share the same class, so `water` and `mizu` classify identically. Distinguishing them
would require a lexicon or frequency lookup, which is not currently justified.

---

## 5. Ranking — Deterministic

Ranking must never depend on database row order. The comparator, applied after fetch:

1. **Exact match first** — `headword === query`, `reading === query`, or
   `romaji.toLowerCase() === query.toLowerCase()`.
2. **Match-quality score** — `calculateRelevance` (matcher.ts), which is a pure
   lexical function over the candidate string:

   | Relation | Score |
   | :--- | :--- |
   | exact | 1.000 |
   | prefix | 0.900 |
   | suffix | 0.800 |
   | contains | 0.500 + 0.3 × (queryLength / candidateLength) |
   | none | 0.000 |

3. **Common / frequency evidence** — `isCommon` and `frequencyRank` break remaining ties.
4. Stable fallback ordering so equal-scoring rows do not shuffle between requests.

**No AI ranking.** Ranking is a pure function of the query and the candidate string plus
canonical frequency metadata. AI may later *enrich retrieval* (for example, expanding a
query), but must never become the canonical dictionary authority and must never reorder
results non-deterministically.

---

## 6. Pagination Contract

Bounds are enforced in **two layers**, and the response reports what actually applied:

| Layer | Bound |
| :--- | :--- |
| Route (`parseLimit` / `parseOffset`) | limit 1–200, offset 0–100,000; out-of-range ⇒ documented default |
| `DictionaryService.searchEntries` | limit clamped to 1–100 |

Because the service's ceiling (100) is lower than the route's (200), a request for
`limit=200` is served as 100. The response echoes the **applied** values, so clients must
read them back rather than assume the request was honoured. Values are never NaN or Infinity.

---

## 7. Security

| Concern | Handling |
| :--- | :--- |
| Null bytes | stripped before any query |
| LIKE wildcard injection | `escapeLikePattern` escapes `%`, `_`, `\` |
| Unbounded scans | `parseLimit` / `parseOffset` clamp before the query |
| SQL injection | parameterized queries throughout; no string interpolation |
| Sentence / headword text | treated as untrusted data; never rendered as HTML server-side |

---

## 8. Performance Notes

Deterministic ranking is applied **after** the database fetch, over a bounded page. That is
correct for the current page sizes but means ranking is page-local, not corpus-global: the
top-N by relevance within the retrieved window, not the top-N overall. As the corpus is
206,747 entries, this is acceptable while queries are selective.

The current predicate layer uses `ILIKE '%query%'`, which **cannot use a btree index** and
will degrade toward a sequential scan as the corpus grows. If query latency becomes a
problem, the recommended progression — in order — is:

1. Add trigram indexes (`pg_trgm` GIN) on `headword`, `reading`, `romaji`.
2. Push `isCommon` / `frequencyRank` ordering into SQL so the page itself is the top-N.
3. Only if still insufficient, move to a dedicated index (external search engine). This is
   **not** justified today and should not be introduced speculatively.

---

## 9. Multilingual Search

`entity_translations` (migration `0001`) holds localized content with a controlled language
set (`en`, `ta`, `ml`) and a `source_type` of `canonical | verified_human | machine`.

Layering rule: a translation match must rank **below** an exact orthographic or reading
match, and results must expose which source produced them, so a `machine` translation is
never presented with the same authority as a `canonical` record. Fabricating translations is
prohibited — a match may only surface a translation that exists in the store.

---

## 10. Extension Points

| Point | Notes |
| :--- | :--- |
| New entity type | add to `SearchTarget` and `ALL_SEARCH_TARGETS` |
| New script class | extend `detectSearchScript` — must stay a pure function |
| Ranking weights | `calculateRelevance(baseWeight)` already parameterized by caller |
| AJV / level filters | `jlptLevel` is passed through; extend `DictionarySearchOptions` |
| Sentence layer (14.5B+) | must reuse this pipeline rather than add a parallel matcher. The existing O(N×M) `SentenceMatcher` is explicitly *not* the model — see below |

### Inherited constraint from Phase 14.5B planning

The sentence-side matcher (`src/etl/sentence/matcher.ts`) currently scans every cached
dictionary headword with `japanese.includes(headword)` — O(sentences × dictionary_entries),
no positions, no longest-match, and it swallows database errors into an empty result set.
That is **not** an acceptable pattern for this architecture. The planned replacement is a
trie / Aho–Corasick automaton over canonical headwords and readings, single-pass per
sentence, emitting character positions with `offsetUnit = "unicodeCodePoint"`.

---

## 11. Verification Status

| Layer | Verifiable without DB? |
| :--- | :--- |
| Normalization | ✅ unit tested |
| Classification | ✅ unit tested |
| Route contract (400/404/500, echo, bounds) | ✅ 31 tests, `dictionary-kanji-experience-routes.test.ts` |
| Ranking comparator | ⚠️ pure function, but exercised only via the service |
| SQL layers 3–8 | ❌ requires canonical corpus |
| Multilingual layer | ❌ requires corpus + `entity_translations` rows |

Unverifiable layers are recorded as such rather than assumed correct.
