# PHASE 05.1 — Dictionary Service — GATE CHECKLIST

**Prompt:** Create canonical DictionaryRepository, DictionaryService, DictionarySearch. Do not let UI query database directly.
**Deployment gate:** API integration tests pass.
**Status:** ✅ **GATE PASSED**

## Implementation evidence

| Required component | File / symbol | Evidence |
|---|---|---|
| `DictionaryRepository` | `src/repositories/DictionaryRepository.ts::DictionaryRepository` | only Dictionary-layer module importing `@/db`, Drizzle, and schema tables |
| `DictionaryService` | `src/services/knowledge/DictionaryService.ts::DictionaryService` | maps DB records to public contracts; hides fixture enrichments in production |
| `DictionarySearch` | `src/services/knowledge/DictionarySearch.ts::DictionarySearch` | NFKC/whitespace normalisation plus bounded input validation |
| Search API | `src/app/api/dictionary/route.ts::GET` | validates through `DictionarySearch`, calls service only |
| Detail API | `src/app/api/dictionary/[id]/route.ts::GET` | strict ID handling, service only, provenance response |
| Database-free UI | `src/app/dictionary/DictionaryClient.tsx` | calls `/api/dictionary*` through `fetch`; no database/repository imports |
| Public contracts | `src/types/dictionary.ts` | API-safe types with no Drizzle inference |

## API integration gate

Command:

```bash
npx tsx --test src/app/api/dictionary/dictionary.integration.test.ts
```

Result:

```text
# tests 5
# pass 5
# fail 0
```

| Contract test | Result |
|---|---|
| Search returns ranked canonical result for `水` | ✅ exact headword, reading `みず`, gloss `water` |
| Search normalizes full-width text; rejects invalid cap | ✅ |
| Search rejects missing query | ✅ HTTP 400 `INVALID_QUERY` |
| Detail returns forms, senses, furigana/conjugation, provenance | ✅ |
| Detail rejects malformed ID and unknown entry | ✅ HTTP 400/404 stable errors |

Test setup invokes `runJmdictPipeline()` against the established fixture; it never inserts fixture rows through direct SQL.

## Database/UI boundary verification

- `DictionaryClient` fetches the API, not PostgreSQL.
- `DictionaryPage` is `force-static` and makes no server data call.
- API routes call `DictionaryService`, never `db`/Drizzle.
- Service imports `DictionaryRepository`, never `db`/Drizzle.
- Repository is the canonical persistence boundary.

## Regression checks

| Existing feature | Verification | Result |
|---|---|---|
| Phase 04 ETL suite | `npx tsx --test etl/tests/*.test.ts` | ✅ 69/69 pass |
| JMdict / KANJIDIC2 / Tatoeba / KRADFILE data | existing fixture imports remain covered by ETL suite | ✅ regression pass |
| Existing deck/review application | typecheck/build/start healthcheck | ✅ build + managed healthcheck pass |
| Existing health route | `build_and_start` `/api/health` | ✅ pass |
| New dictionary UI route | production build + live `GET /dictionary` | ✅ route built; HTTP 200 |

## Validation

| Command | Result |
|---|---|
| `npx tsx --test src/app/api/dictionary/dictionary.integration.test.ts` | ✅ 5/5 |
| `npm exec tsc -- --noEmit --pretty false` | ✅ 0 errors |
| `npm run lint` | ✅ clean |
| `npx next typegen` | ✅ types generated successfully |
| `npm run build` | ✅ production build passed; dictionary routes included |
| `build_and_start` | ✅ managed healthcheck passed |
| Live API smoke | ✅ `/dictionary` 200; `/api/dictionary?q=水&limit=1` returns exact result; missing `q` 400; cache header present |

## Deployment commands

```bash
npx drizzle-kit push --config=drizzle.config.json
npm run lint
npx tsx --test etl/tests/*.test.ts
npx tsx --test src/app/api/dictionary/dictionary.integration.test.ts
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

No cloud deployment was performed or claimed. Repo A (`Arena-test`) remains inaccessible from this environment; this local workspace is the tested integration environment.
