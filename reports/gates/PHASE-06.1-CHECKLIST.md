# PHASE 06.1 — Kanji Service & API — GATE CHECKLIST

**Prompt:** Build Kanji service/API.
**Gate applied:** Kanji API integration tests pass (consistent with Phase 05 gates).
**Status:** ✅ **GATE PASSED**

## Gate proof

```bash
npx tsx --test src/app/api/v2/kanji/kanji-v2.integration.test.ts
```

```text
# tests 11
# pass 11
# fail 0
```

| # | Test | Result |
|---|---|---|
| 1 | Search by kanji literal (`水`) | ✅ exact literal, 4 strokes, meaning `water` |
| 2 | Search by English meaning (`water`) and kana reading (`みず`) | ✅ matchedFields `meaning` / `reading` |
| 3 | Search by romaji (`mizu`) converts to kana reading | ✅ |
| 4 | Filter by stroke count and grade | ✅ |
| 5 | Filter by classical radical number (85) | ✅ |
| 6 | Reverse component lookup (`component=言` → 話, 語) | ✅ |
| 7 | Pagination returns distinct non-overlapping pages with accurate total | ✅ |
| 8 | Detail: readings, radicals, KRADFILE components, vocabulary, provenance | ✅ |
| 9 | Legacy JLPT kept strictly separate from modern N-levels | ✅ |
| 10 | Rejects no-criteria and invalid filters | ✅ |
| 11 | Rejects non-kanji literals; reports unknown kanji 404 | ✅ |

## Implementation evidence

| Component | File / symbol |
|---|---|
| `KanjiRepository` | `src/repositories/KanjiRepository.ts::KanjiRepository` |
| `KanjiService` | `src/services/knowledge/KanjiService.ts::KanjiService` |
| `KanjiSearch` | `src/services/knowledge/KanjiSearch.ts::KanjiSearch` |
| Search API | `src/app/api/v2/kanji/search/route.ts::GET` |
| Detail API | `src/app/api/v2/kanji/[literal]/route.ts::GET` |
| Contracts | `src/types/kanji-v2.ts` |
| Integration tests | `src/app/api/v2/kanji/kanji-v2.integration.test.ts` |

Setup uses the public ETL pipelines (`runKanjidicPipeline`, `runKradfilePipeline`);
no direct fixture SQL.

## Boundary verification

```bash
grep -RIlnE '@/db|drizzle-orm' src/app/api/v2/kanji --include='*.ts' --exclude='*.test.ts'
# no matches

grep -nE '@/db|drizzle-orm' src/services/knowledge/KanjiService.ts src/services/knowledge/KanjiSearch.ts
# no matches

grep -rlE '@/db|drizzle-orm' src/repositories/
# src/repositories/DictionaryRepository.ts
# src/repositories/KanjiRepository.ts
```

✅ Only the repositories touch the database.

## Defect found and fixed during this phase

**Drizzle renders `sql\`${table.column}\`` qualified in `WHERE` but unqualified
in `SELECT`.** In correlated subqueries the inner table's `"id"` shadowed it,
silently comparing the wrong column: rows matched (WHERE form) while projected
booleans were `false`.

- Fixed in `KanjiRepository` (meaning, reading, jlpt, component subqueries).
- **Also uncovered a latent Phase 05.2 bug**: the dictionary English-gloss
  subqueries had the same flaw, masked because `dictionary_senses.id` coincides
  with `entry_id` in this fixture. Real JMdict data would have broken English
  search. Fixed in `DictionaryRepository` (`englishExact`, `englishContains`,
  `jlptDerivedMatch`).

Two further test-side bugs were corrected: double URL-encoding in the detail
helper, and a vocabulary assertion for 語 which has no dictionary entries in
this fixture.

## Regression checks

| Feature | Result |
|---|---|
| Phase 04 ETL suite | ✅ 69/69 |
| v1 dictionary API | ✅ 5/5 |
| v2 dictionary API | ✅ 7/7 (after the shared-repository fix) |
| v2 kanji API | ✅ 11/11 |
| Dictionary UI Playwright journey | ✅ 4/4 |
| Knowledge data | ✅ 501 dict / 300 kanji / 501 sentences / 500 links |
| Learning app data | ✅ 5 decks / 128 cards |

## Final validation

| Command | Result |
|---|---|
| `npm run lint` | ✅ clean |
| `npx tsx --test etl/tests/*.test.ts` | ✅ 69/69 |
| `npx tsx --test src/app/api/dictionary/dictionary.integration.test.ts` | ✅ 5/5 |
| `npx tsx --test src/app/api/v2/dictionary/dictionary-v2.integration.test.ts` | ✅ 7/7 |
| `npx tsx --test src/app/api/v2/kanji/kanji-v2.integration.test.ts` | ✅ 11/11 |
| `npx playwright test` | ✅ 4/4 |
| `npx next typegen` | ✅ types generated |
| `npm exec tsc -- --noEmit --pretty false` | ✅ 0 errors |
| `npm run build` | ✅ both kanji routes in manifest |
| `build_and_start` | ✅ healthcheck passed |

## Live smoke tests

| Check | Result |
|---|---|
| `?q=water` | ✅ `水`, スイ, みず, 4 strokes |
| `?radical=85` | ✅ filtered correctly |
| `?component=言` | ✅ `total: 2` → 話, 語 |
| `GET /api/v2/kanji/語` | ✅ components 言/五/口, radicals 149, on ゴ |
| no criteria / `jlpt=N9` / kana literal | ✅ 400 |
| unknown ideograph 鬱 | ✅ 404 |
| cache headers | ✅ `public, max-age=60, s-maxage=300` |
| dictionary entry enrichments still visible | ✅ furigana, jlpt, pitch, examples, kanji, related |

## Remaining constraints

- **No kanji UI** — this prompt scoped to service/API; UI is a follow-up.
- **Corpus is synthetic fixture data**; `KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS`
  must be `false` once verified EDRDG sources are loaded.
- **Modern kanji N-levels have no source** — deliberately empty, fail-closed.
- **KRADFILE network ingestion remains blocked** pending verified ZIP extraction.
- **The sandbox resets `.env`**, so the fixture-visibility flag must be re-applied
  in this environment. It is documented in `.env.example`.
- No cloud deployment performed or claimed. Repo A (`Arena-test`) remains
  inaccessible from this environment.

## Commands

```bash
npx tsx --test src/app/api/v2/kanji/kanji-v2.integration.test.ts   # gate
npx playwright install --with-deps chromium                        # one-time
npx playwright test
npm run build && npx playwright test                                # full UI gate
```
