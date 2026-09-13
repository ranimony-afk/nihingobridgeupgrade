# PHASE 06.3 — Radical / Component Relationships — GATE CHECKLIST

**Prompt:** Build radical/component relationships.
**Gate applied:** API integration + Playwright journeys pass (consistent with prior phases).
**Status:** ✅ **GATE PASSED**

## Gate proof

```bash
npx tsx --test src/app/api/v2/radicals/radicals-v2.integration.test.ts   # 12/12
npm run build && npx playwright test                                      # 23/23
```

| Suite | Result |
|---|---|
| Radical API integration | ✅ 12/12 |
| Playwright (all journeys) | ✅ 23/23 (9 new radical/component) |

## What was built

| Layer | Artifact |
|---|---|
| Schema | `radicals`, `kanji_components` (additive; 0 destructive DDL) |
| Reference data | `etl/data/kangxi-radicals.ts` — all 214 |
| ETL | `etl/pipelines/radical-pipeline.ts` (seed + promote), `scripts/etl-radicals.ts` |
| Repository | `src/repositories/RadicalRepository.ts` |
| Service | `src/services/knowledge/RadicalService.ts` |
| Contracts | `src/types/radical-v2.ts` |
| API | `/api/v2/radicals`, `/api/v2/radicals/[number]`, `components=` on kanji search |
| UI | `/radicals`, `/radicals/[number]`, component picker in the kanji explorer |
| Tests | `radicals-v2.integration.test.ts`, `e2e/radicals.spec.ts` |

## ETL result

```
Kangxi radical seed : 214 inserted
Component promotion : 20 kanji, 34 relationships, 30 linked→radical
Non-radical components correctly left unlinked: 交 五 良 亍
Re-run (idempotency): 0 inserted / 214 + 34 unchanged
```

## Key behaviour verified

| Behaviour | Evidence |
|---|---|
| Radicals have identity | 85 → 水, "water", 4 strokes, variants 氵氺 |
| All 214 present, grouped | index `total: 214`, 17 stroke groups, ascending |
| Classification ≠ composition | `/radicals/149` returns both `kanjiByRadical` and `kanjiByComponent` separately |
| Reverse lookup | 言 → 話, 語 |
| **AND, not OR** | 言 → 2 results; 言+口 → **1** (語); 話 correctly excluded |
| Impossible combo | 舌+口 → `total: 0`, empty array, HTTP 200 (not an error) |
| Composes with filters | `components=日&strokes=4` respects both |
| Input validation | kana component → 400; >12 components → 400; radical 0/215/abc → 400 |
| Picker is corpus-driven | only offers components with `kanjiCount > 0` |
| Deep-linkable | `/kanji?components=言,口` restores selection state |

## Boundary verification

```bash
grep -RIlnE '@/db|drizzle-orm|RadicalRepository|RadicalService' src/app/radicals src/app/kanji
# no matches → PASS

grep -rlE '@/db|drizzle-orm' src/repositories/
# DictionaryRepository.ts, KanjiRepository.ts, RadicalRepository.ts
```

✅ Only repositories touch the database.

## Design decisions worth recording

1. **`radical_id` is nullable on purpose.** A component is not necessarily a
   Kangxi radical. 4 of 34 (交 五 良 亍) are genuine non-radical components and
   are stored unlinked rather than force-matched.
2. **Components promoted out of JSON into a real table.** The old
   `jsonb @> '["言"]'` predicate could not be indexed, reverse-queried
   efficiently, or AND-combined. The kanji search now reads the relationship
   table instead.
3. **Longer cache on reference data** (`s-maxage=3600` vs `300`) — the radical
   list is effectively static.

## Licensing (Rule 9)

Kangxi radicals are public domain (康熙字典, 1716); numbers/characters/variants/
stroke counts are standardised factual data. English descriptors are **curated
for this project** and the import run says so explicitly — they are *not*
attributed to EDRDG or any third-party database. Component data inherits the
KRADFILE fixture's provenance and stays behind `allowFixtureProvenance`.

## Fixture artifact (not a bug)

The synthetic KANJIDIC2 generator assigns radicals round-robin
(`index % 214 + 1`), so all 214 report usage and the "only radicals present"
filter is a no-op in this corpus. A Playwright test originally asserted a
reduction; **the test premise was wrong, not the code**, and it now asserts the
invariant that actually holds. With real KANJIDIC2 the filter would narrow.

## Regression checks

| Feature | Result |
|---|---|
| ETL suite | ✅ 69/69 |
| v1 dictionary API | ✅ 5/5 |
| v2 dictionary API | ✅ 7/7 |
| v2 kanji API | ✅ 11/11 (component filter re-pointed at the new table) |
| Dictionary + kanji journeys | ✅ 14/14 still green |
| Knowledge data | ✅ 501 dict / 300 kanji / 214 radicals / 34 component edges |

## Final validation

| Command | Result |
|---|---|
| `npm run lint` | ✅ clean |
| `npx drizzle-kit push` | ✅ applied, **0** destructive statements |
| All 5 backend suites | ✅ 69 / 5 / 7 / 11 / 12 |
| `npx playwright test` | ✅ 23/23 |
| `npx next typegen` | ✅ |
| `npm exec tsc -- --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ both radical routes in manifest |
| `build_and_start` | ✅ healthcheck passed |

## Live smoke

| Check | Result |
|---|---|
| `/radicals`, `/radicals/149`, `/radicals/999` | ✅ 200 |
| `/api/v2/radicals` | ✅ `total: 214`, 17 groups |
| `/api/v2/radicals/149` | ✅ 言, speech, 7 strokes, variants 訁, byComponent 話+語 |
| `components=言` / `言,口` / `舌,口` | ✅ 2 / 1 / 0 |

## Remaining constraints

- Component coverage is **fixture-limited to 20 kanji**; real KRADFILE
  ingestion is still blocked pending verified ZIP extraction (Phase 04.6).
- Radical→kanji classification counts are inflated by the synthetic corpus.
- `KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS=true` remains required; the sandbox
  resets `.env` and the Playwright browser cache between turns.
- No cloud deployment performed or claimed. Repo A (`Arena-test`) inaccessible.
