# PHASE 05.3 — Dictionary UI — GATE CHECKLIST

**Prompt:** Create `/dictionary` and `/dictionary/[id]` including readings, meanings, JLPT, kanji, examples, conjugations, audio, related content.
**Deployment gate:** Playwright dictionary journey passes.
**Status:** ✅ **GATE PASSED**

## Gate proof

```bash
npx playwright test
```

```text
Running 4 tests using 1 worker

  ✓ search by kanji then view a full entry detail page
  ✓ search by romaji and english reach the same entry
  ✓ verb entry shows conjugations and navigates to related content
  ✓ an unknown entry id renders a friendly not-found page

  4 passed (3.3s)
```

`playwright.config.ts` starts and stops `next start` on port 3100 with
`reuseExistingServer: false`, so no long-lived server process is left behind.
Verified: `ps aux | grep next-server` → none after the run.

### Journey coverage

| Assertion | Test |
|---|---|
| Search from `/dictionary`, click through to `/dictionary/[id]` | 1 |
| Reading `みず` | 1 |
| Meanings section shows `water` | 1 |
| JLPT `N5` badge | 1 |
| Kanji breakdown: `4 strokes`, on-reading `スイ` | 1 |
| Example sentence + English translation | 1 |
| **Per-sentence CC BY 2.0 FR attribution** | 1 |
| Audio button with accessible label | 1 |
| Related content links | 1, 3 |
| Provenance footer | 1 |
| Romaji `mizu` and English `water` reach the entry | 2 |
| Conjugations: 食べない / 食べます / 食べた / 食べて | 3 |
| Related → detail navigation round-trip | 3 |
| Unknown ID → friendly not-found page | 4 |

## Implementation evidence

| Requirement | File / symbol |
|---|---|
| Search page | `src/app/dictionary/DictionaryClient.tsx` |
| Detail page | `src/app/dictionary/[id]/DictionaryDetailClient.tsx` |
| DB-free route wrappers | `src/app/dictionary/page.tsx`, `src/app/dictionary/[id]/page.tsx` |
| Audio | `src/app/dictionary/[id]/useJapaneseSpeech.ts::useJapaneseSpeech` |
| Kanji components | `src/repositories/DictionaryRepository.ts::findKanjiComponents` |
| Examples | `DictionaryRepository.findExamples` (correlated join, `selectDistinctOn`) |
| Related content | `DictionaryRepository.findRelated` (relation resolved in repository) |
| Composition | `src/services/knowledge/DictionaryService.ts::getByIdV2` |
| Contracts | `src/types/dictionary-v2.ts` |

## Defects found and fixed during the gate

1. **Ambiguous SQL column.** The examples subquery rendered `sl."sentence_id" = "id"`,
   raising `column reference "id" is ambiguous` (PostgreSQL 42702). Fixed by
   qualifying as `"sentences"."id"`. Found via a service-level diagnostic, not by guessing.
2. **Stale build in the test run.** `next start` served a build predating an added
   test id, so a locator resolved to nothing. Fixed by rebuilding before the run.
3. **Selector strictness.** Furigana headings read back with the `<rt>` annotation
   (`食べる` → `食たべる`), and multiple examples share attribution patterns.
   Assertions were made ruby-aware and explicitly first-match.
4. **React lint error.** `setState` was called synchronously inside an effect in the
   speech hook. Rewritten with `useSyncExternalStore`, the correct primitive for
   reading external browser state. Lint now clean.

## Regression checks

| Feature | Result |
|---|---|
| Phase 04 ETL suite | ✅ 69/69 |
| v1 dictionary API | ✅ 5/5 |
| v2 dictionary API | ✅ 7/7 |
| Knowledge data | ✅ 501 dict / 300 kanji / 501 sentences / 500 links |
| Learning app data | ✅ 5 decks / 128 cards |
| UI direct-DB boundary | ✅ no `@/db`, `drizzle-orm`, repository or service imports in `src/app/dictionary` |
| Healthcheck | ✅ `build_and_start` |
| Live routes | ✅ `/dictionary`, `/dictionary/1` → 200 |

## Final validation

| Command | Result |
|---|---|
| `npm run lint` | ✅ clean |
| `npx playwright test` | ✅ 4/4 |
| `npx tsx --test etl/tests/*.test.ts` | ✅ 69/69 |
| `npx tsx --test src/app/api/dictionary/dictionary.integration.test.ts` | ✅ 5/5 |
| `npx tsx --test src/app/api/v2/dictionary/dictionary-v2.integration.test.ts` | ✅ 7/7 |
| `npx next typegen` | ✅ types generated |
| `npm exec tsc -- --noEmit --pretty false` | ✅ 0 errors |
| `npm run build` | ✅ both `/dictionary` and `/dictionary/[id]` in manifest |
| `build_and_start` | ✅ healthcheck passed |

## Commands

```bash
npx playwright install --with-deps chromium   # one-time
npm run build                                  # required before next start
npx playwright test                            # the gate
```

## Remaining constraints

- The corpus is a **synthetic fixture**. `KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS=true`
  is set for this fixture-corpus environment and must be `false` once verified
  EDRDG source data is loaded.
- Audio is on-device TTS, not corpus recordings — a deliberate licence decision
  carried over from Phase 04.4.
- No cloud deployment performed or claimed. Repo A (`Arena-test`) remains
  inaccessible from this environment.
