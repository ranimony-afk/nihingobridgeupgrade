# Dictionary Search Architecture

**Status**: IMPLEMENTED (layers) · **partially verifiable** — the classification and ranking
layers are deterministic and run without a database; the data-dependent layers require the
canonical corpus and cannot be exercised in a provisioning-free environment.
**Phase**: 14.4F-R (search contract) · builds on 14.4A (architecture) and Phase 7 (search)
**Last updated**: 2026-10-27

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

## 12. Dictionary read reliability

The web dictionary listing/search (`/api/dictionary`), autocomplete, explicit
search (`/api/dictionary/search`), entry APIs, and server-rendered entry page
read existing data only. The shared mobile search adapter also uses this same
read-only service. They do not create tables, seed fixtures, or run migrations.
Dictionary service queries and optional entry-graph queries use read-only
transactions with a **10-second per-statement** PostgreSQL timeout. Each
dictionary transaction explicitly checks out and releases one connection from
the application's lazy pool, including when transaction startup fails. This is
not a total-request deadline, a pool-checkout timeout, or a rate limiter.
Browser search and suggestion requests also time out
after 15 seconds and expose a retryable failure. A target provider must support
read-only transactions and `SET LOCAL statement_timeout`; if it does not, reads
fail closed rather than silently dropping the guard.

The web search query is limited to 1,000 Unicode code points after NUL removal
and trimming. Web result pages are capped at 100 entries (default 25 on
`/api/dictionary`, 50 on `/api/dictionary/search`), offsets at 100,000, and
server suggestions at 20 (default 8; the web control asks for 6). Detail IDs
are limited to 256 code points; related kanji/graph outputs are capped at 64,
sentences at 6, and related grammar at 4. Invalid query parameters receive 400;
valid oversized page limits are clamped. `/api/dictionary` can browse with an
empty query, while `/api/dictionary/search` requires one. The mobile adapter
retains its existing 1,000 UTF-16-code-unit limit and frozen response projection.
Successful response shapes remain unchanged. API lookup failures use generic
500 responses and absent entries return 404. A failed server-rendered detail
lookup shows recovery and retry in the HTML with HTTP 200; this status limitation
should be considered by monitoring. Missing source records are shown as
unavailable rather than attributed to an invented source.

### Explicit local fixtures

Fixtures are **not production data** and are never populated by dictionary
reads. To opt in, first create and prepare a database known to be disposable;
do not point schema or fixture commands at a production, shared, tunneled, or
ambiguous database. Set `DATABASE_URL` to that database's exact loopback URL,
`NIHONGO_DB_TARGET_CLASS=disposable`, and `NIHONGO_DB_EXPECTED_DATABASE` to
the exact database name, then run `npm run dictionary:seed-fixtures` in a
non-production environment. The URL must include an explicit user and port,
a single database path, and no query options or fragment: driver options or
implicit environment defaults could otherwise override the classified target.
The command checks both the declared target and the actual cached pool before
writing. It loads only the in-repository
first-party dictionary and knowledge fixtures; it does not create a schema,
materialize Tatoeba, or authorize corpus ingestion.

### Verification and remaining scope

`npx vitest run tests/dictionary-kanji-navigation.test.ts` includes an isolated
in-memory PGlite integration suite. It generates schema offline and uses its own
loopback-only temporary server, not an inherited database URL. Before/after
snapshots cover user schemas, types, extensions, tables, columns, constraints,
indexes, triggers, policies, functions, sequence values, and all rows. Empty,
seeded, missing-entry, validation, CMS-fallback, and unavailable-database paths
are exercised. It also traces each dictionary surface through the actual lazy
pool and verifies transaction settings, connection release, and failure cleanup.
The helper is imported by an already CI-selected test because the current CI
workflow lists files explicitly.

This guarantee is scoped to the dictionary paths above, not every GET in the
application. In particular, the separate multi-entity `/api/search` still
initializes fixtures and exposes raw exception text on failure; homepage and
other knowledge/JLPT read paths also have their own initialization behavior.
They require separate remediation and must not be treated as read-only because
this dictionary change passed. Separately, non-dictionary `db.transaction` users
such as CMS still rely on the lazy pool proxy that Drizzle does not identify as
a pool; their transaction affinity and cleanup need a dedicated fix and tests.
Public beta remains blocked on those risks, authorization, dependency advisories,
database TLS, D-13 abuse protection, canonical-data/provenance gates, and
validation against the intended deployment.
