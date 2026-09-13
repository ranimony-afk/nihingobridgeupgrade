# Grammar API

Canonical REST contract for the grammar domain. The web app, the admin screen
and the (future) Flutter client all consume these endpoints — no client is
allowed to query the grammar tables directly.

Base URL: `/api` (relative to the deployed origin).
Version: `1` (returned in `meta.apiVersion` and the `x-api-version` header).
Machine readable spec: `GET /api/grammar/openapi` (OpenAPI 3.1).

---

## Envelope

Success:

```json
{
  "data": { "...": "payload" },
  "meta": {
    "requestId": "9b…",
    "apiVersion": "1",
    "tookMs": 12,
    "pagination": { "limit": 24, "offset": 0, "total": 54, "hasMore": true, "nextOffset": 24 }
  }
}
```

Failure:

```json
{ "error": { "code": "invalid_request", "message": "Invalid query parameters", "details": [ … ] }, "meta": { … } }
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `invalid_request` | 400 | query/body failed schema validation (`error.details[]` lists the fields) |
| `not_found` | 404 | unknown slug |
| `rate_limited` | 429 | in-process sliding window exceeded |

Headers on every response: `x-api-version`, `cache-control`
(`public, max-age=60, stale-while-revalidate=300`), CORS
(`access-control-allow-origin: *`, `OPTIONS` → 204) and `x-ratelimit-limit`,
`x-ratelimit-remaining`, `x-ratelimit-reset`.

---

## Endpoints

### `GET /api/grammar` — catalogue

| Param | Type | Notes |
| --- | --- | --- |
| `q` | string ≤160 | matches title, gloss, summary, explanation or pattern |
| `jlpt` | 1–5 | JLPT level filter |
| `tag` | string | pedagogical tag (`conditional`, `aspect`, `purpose`, …) |
| `register` | enum | `polite`, `casual`, `written`, `spoken`, `neutral` |
| `sort` | enum | `relevance`, `level`, `order`, `title`, `examples` (default `order`) |
| `limit` | 1–200 | default 24 |
| `offset` | ≥0 | default 0 |

```bash
curl -s "$BASE/api/grammar?jlpt=4&sort=title&limit=5" | jq '.data.points[].slug'
```

### `GET /api/grammar/search` — scored search

`q` is **required**. Returns `data.hits[]` with `matchedOn`
(`title | pattern | gloss | explanation`) and `score` (100 → 5).

```bash
curl -s "$BASE/api/grammar/search?q=conditional" | jq '.data.hits[] | {slug, matchedOn, score}'
```

### `GET /api/grammar/[slug]` — point detail

`?include=` accepts a comma separated subset of
`patterns,examples,related,kanji,vocabulary` (default: all) so mobile clients can
trim payloads.

```bash
curl -s "$BASE/api/grammar/te-shimau" | jq '.data | {title, jlptLevel, patterns, examples: (.examples|length)}'
```

### `GET /api/grammar/[slug]/examples` — corpus evidence

| Param | Notes |
| --- | --- |
| `limit` / `offset` | pagination over `grammar_examples` |
| `minLength` / `maxLength` | sentence length in characters |
| `sort` | `length` (default) or `id` |

Every example carries `matches[]` with `matchedText`, `startIndex`, `endIndex` —
the exact evidence the ETL recorded, used for highlighting.

### `GET /api/grammar/[slug]/related` — relation traversal

| Param | Notes |
| --- | --- |
| `relation` | `prerequisite`, `similar`, `contrast`, `related`, `variant` |
| `depth` | `1` (default) or `2` — BFS over `grammar_relations` |
| `limit` | 1–100 |

Each item reports `relation`, `inbound` (declared on the other point) and `depth`.

### `GET /api/grammar/[slug]/kanji` · `/vocabulary`

Cross-domain links: kanji occurring in the point's examples, and dictionary
entries whose writing realises one of its patterns.

### `POST /api/grammar/batch` — mobile bulk fetch

```json
{ "slugs": ["te-shimau", "node", "nope"], "include": ["examples"], "examples": 2 }
```

→ `data.items[] = { slug, point, detail? }`; unknown slugs come back as
`point: null` instead of failing the batch. `GET /api/grammar/batch?slugs=a,b`
is the cacheable equivalent.

### `GET /api/grammar/graph` — grammar map

`?jlpt=4&relation=similar` → `{ nodes: [{id, slug, title, jlptLevel, depth}], edges: [{from, to, relation}] }`.
The graph is **closed**: relations pointing outside the requested slice add the
neighbour as a `depth: 1` node.

### `GET /api/grammar/tags` · `/levels` · `/stats` · `/openapi`

Tag cloud with counts, per-level point/example counts, knowledge counters and
the OpenAPI 3.1 document.

---

## Consumers

| Consumer | Endpoints used |
| --- | --- |
| `/grammar` (server catalogue) | service layer (`getGrammarCatalog`) — no HTTP hop |
| `/grammar/explorer` (client island) | `GET /api/grammar` (search, filters, sort, pagination) |
| `/grammar/map` (client island) | `GET /api/grammar?limit=200`, `GET /api/grammar/graph` |
| `/grammar/[slug]` (server + island) | service layer; example list renders `matches[]` offsets |
| Admin dashboard | `GET /api/grammar/stats` counters |
| Flutter client (next) | same contract; `POST /api/grammar/batch` for offline prefetch |

## Client notes

* **Pagination**: use `meta.pagination.nextOffset`; stop when `hasMore` is false.
* **Caching**: responses are CDN cacheable for 60s; batch POSTs are not.
* **Rate limits**: 240 requests / minute / IP by default
  (`API_RATE_LIMIT` env var). This is a per-instance in-process guard — put a
  platform limiter in front for hard quotas.
* **Errors**: always branch on `error.code`, never on the message text.
* **Contract stability**: adding fields is safe; removing or renaming one
  requires a version bump in `src/lib/api/http.ts` (`API_VERSION`).
