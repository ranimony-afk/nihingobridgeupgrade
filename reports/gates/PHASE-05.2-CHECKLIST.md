# PHASE 05.2 — Dictionary API v2 — GATE CHECKLIST

**Prompt:** Implement `/api/v2/dictionary/search`, `/api/v2/dictionary/entries/[id]`; support Japanese, kana, romaji, English, JLPT, and kanji.
**Deployment gate:** Search tests pass.
**Status:** ✅ **GATE PASSED**

## Implementation evidence

| Requirement | File / symbol | Evidence |
|---|---|---|
| v2 search endpoint | `src/app/api/v2/dictionary/search/route.ts::GET` | validated `q`, `limit`, `jlpt`; calls service only |
| v2 entry endpoint | `src/app/api/v2/dictionary/entries/[id]/route.ts::GET` | stable v2 entry / error contracts |
| Search parsing | `src/services/knowledge/DictionarySearch.ts::parseV2` | NFKC, 100-char cap, 1–25 limit, N1–N5 validation |
| Romaji | `DictionarySearch.searchTerms` | WanaKana `toKana`; only wholly kana conversion is admitted alongside literal input |
| Japanese/kana/kanji search | `src/repositories/DictionaryRepository.ts::searchV2` | literal headword + reading `position()` predicates |
| English search | `DictionaryRepository.searchV2` | case-insensitive structured `dictionary_senses.glosses` match |
| JLPT filter | `DictionaryRepository.searchV2/findJlptLevels` | direct/source-curated labels only from successful visible provenance runs |
| API response mapping | `src/services/knowledge/DictionaryService.ts::searchV2/getByIdV2` | stable v2 types, matched fields, provenance-filtered labels |
| Public contracts | `src/types/dictionary-v2.ts` | Drizzle-free API contracts |
| Web client | `src/app/dictionary/DictionaryClient.tsx` | migrated to `/api/v2/*` only |

## Deployment-gate test evidence

Command:

```bash
npx tsx --test src/app/api/v2/dictionary/dictionary-v2.integration.test.ts
```

Result:

```text
# tests 7
# pass 7
# fail 0
```

| Search scenario | Test | Result |
|---|---|---|
| Japanese kanji prefix (`食`) | `v2 search supports Japanese kanji headword queries` | ✅ `食べる`, `matchedFields: [japanese]` |
| Kana (`みず`) | `v2 search supports kana readings` | ✅ `水`, `matchedFields: [kana]` |
| Romaji (`mizu`) | `v2 search converts complete romaji to kana` | ✅ `水`, `matchedFields: [romaji]` |
| English (`water`) | `v2 search supports English sense-gloss queries` | ✅ `水`, `matchedFields: [english]` |
| JLPT-only and combined | `v2 search supports source-curated JLPT filter` | ✅ N5 fixture filter and `water + N5` |
| Detail route | `v2 entry detail returns canonical aggregate` | ✅ versioned aggregate + provenance |
| Errors | `v2 search and entry reject invalid requests` | ✅ 400 invalid query/JLPT/ID |

The first test run exposed a PostgreSQL ordering defect for JLPT-only requests (`ORDER BY 0`). It was fixed by aliasing the computed rank as `match_rank` and ordering by that SQL alias; the full 7/7 suite passed after the correction.

## UI/database-boundary check

```bash
grep -RInE '@/db|drizzle-orm|DictionaryRepository|DictionaryService' src/app/dictionary
# no matches
```

✅ The UI has no direct database or server-service import.

## Regression checks

| Feature | Command/evidence | Result |
|---|---|---|
| Phase 04 ETL suite | `npx tsx --test etl/tests/*.test.ts` | ✅ 69/69 pass |
| Existing v1 dictionary API | `src/app/api/dictionary/dictionary.integration.test.ts` | ✅ 5/5 pass |
| Existing learning decks/review | data-count + build/start check | ✅ 5 decks / 128 cards; build + healthcheck pass |
| New v2 routes | Next production route manifest | ✅ both v2 routes compiled |
| Healthcheck | `build_and_start` | ✅ pass |

## Final validation

| Command | Result |
|---|---|
| `npm run lint` | ✅ clean |
| `npx tsx --test etl/tests/*.test.ts` | ✅ 69/69 pass |
| `npx tsx --test src/app/api/dictionary/dictionary.integration.test.ts` | ✅ 5/5 pass |
| `npx tsx --test src/app/api/v2/dictionary/dictionary-v2.integration.test.ts` | ✅ 7/7 pass |
| `npx next typegen` | ✅ types generated |
| `npm exec tsc -- --noEmit --pretty false` | ✅ 0 errors |
| `npm run build` | ✅ production build; both v2 routes in manifest |
| `build_and_start` | ✅ managed healthcheck passed |
| Live v2 smoke | ✅ Japanese `食`, romaji `mizu`, English `water`, invalid `jlpt=N6` → 400, cache header present |

No cloud deployment was performed or claimed. Repo A remains inaccessible from this environment; this is the validated local integration workspace.
