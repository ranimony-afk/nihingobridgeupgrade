# Phase 05.1 — Canonical Dictionary Service

**Status:** ✅ Implemented and API integration tested.

## Architecture

```
DictionaryClient (browser UI)
  └── GET /api/dictionary, GET /api/dictionary/:id
        └── DictionaryService
              ├── DictionarySearch (normalisation / input bounds)
              └── DictionaryRepository (all Drizzle access)
                    └── PostgreSQL canonical knowledge tables
```

### Boundary ownership

| Layer | File | Responsibility | Must not do |
|---|---|---|---|
| Search contract | `src/services/knowledge/DictionarySearch.ts` | NFKC normalisation, required query, 1–25 result cap, 100-character maximum | query PostgreSQL |
| Repository | `src/repositories/DictionaryRepository.ts` | all Drizzle access to dictionary tables, ranking, related record retrieval | expose DB rows to API clients |
| Service | `src/services/knowledge/DictionaryService.ts` | domain mapping, response composition, provenance-aware enrichment visibility | import Drizzle or UI code |
| API | `src/app/api/dictionary/route.ts`, `src/app/api/dictionary/[id]/route.ts` | stable HTTP validation, error contracts, cache headers | access database tables |
| UI | `src/app/dictionary/DictionaryClient.tsx` | fetch and render API contracts only | import `@/db`, Drizzle, or repositories |

## Stable API contracts

### Search

```
GET /api/dictionary?q=<word-or-reading>&limit=1..25
```

- Literal search, not wildcard semantics. `%` and `_` in user input do not turn into broad LIKE queries.
- Ranking order: exact headword → exact reading → headword substring → reading substring.
- Response is `DictionarySearchResponse`; malformed input returns `ApiError` with `INVALID_QUERY` and HTTP 400.

### Entry detail

```
GET /api/dictionary/:id
```

Returns forms, readings, senses, accepted enrichments and source provenance as one `DictionaryEntry` aggregate.

- malformed ID: `INVALID_ID`, HTTP 400;
- absent ID: `NOT_FOUND`, HTTP 404;
- unexpected failure: `INTERNAL_ERROR`, HTTP 500.

## Provenance behavior

An enrichment is shown only when its upstream enrichment source import run is successful. Values from runs marked `is_fixture=true` are visible to non-production development/test callers only; `DictionaryService` defaults to hiding them under `NODE_ENV=production`.

The entry itself returns its origin provenance, including the fixture marker. The browser UI renders a clear development-fixture notice whenever that marker is true.

## UI and database rule

`src/app/dictionary/page.tsx` is a static database-free wrapper. Its client component uses `fetch` only. No dictionary UI module imports the database, Drizzle, schema, repository, or service.

## Future client compatibility

The public types in `src/types/dictionary.ts` contain no Drizzle inferred types. The same JSON contracts can be implemented by the future Flutter client without duplicating service/database logic.
