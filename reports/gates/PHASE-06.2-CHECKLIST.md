# PHASE 06.2 — Kanji Explorer — GATE CHECKLIST

**Prompt:** Build Kanji explorer.
**Gate applied:** Playwright kanji explorer journey passes (consistent with the Phase 05.3 UI gate).
**Status:** ✅ **GATE PASSED**

## Gate proof

```bash
npm run build && npx playwright test
```

```text
Running 14 tests using 1 worker

  ✓ dictionary journey › search by kanji then view a full entry detail page
  ✓ dictionary journey › search by romaji and english reach the same entry
  ✓ dictionary journey › verb entry shows conjugations and navigates to related content
  ✓ dictionary journey › an unknown entry id renders a friendly not-found page
  ✓ kanji explorer › shows an idle prompt before any criteria are supplied
  ✓ kanji explorer › search by English meaning then open the kanji detail page
  ✓ kanji explorer › vocabulary link navigates from kanji into the dictionary entry
  ✓ kanji explorer › grade filter is deep-linkable and paginates without overlap
  ✓ kanji explorer › component filter performs a reverse KRADFILE lookup
  ✓ kanji explorer › component chips on a detail page link to that component's kanji
  ✓ kanji explorer › radical and stroke chips link back into filtered explorer views
  ✓ kanji explorer › clearing filters returns the explorer to its idle prompt
  ✓ kanji explorer › an invalid kanji path and an unknown kanji both fail gracefully
  ✓ kanji explorer › the explorer is reachable from the global navigation

  14 passed (7.4s)
```

10 new kanji journeys; the 4 Phase 05.3 dictionary journeys still pass.

### Journey coverage

| Area | Assertions |
|---|---|
| Explorer idle state | prompt shown before any criteria |
| Search | `water` → 水 with meaning, on/kun readings, 4-stroke badge |
| Detail: readings | On スイ; kun みず **and** みず- asserted exactly |
| Detail: stats | Strokes/Grade/Frequency/`6C34` codepoint; alternate stroke count 5 |
| Detail: radicals | "Radical 85 (classical)" chip linking to `?radical=85` |
| Detail: components | "Composed of" block; 語 → 3 component links (言/五/口) |
| Detail: JLPT | legacy scale labelled **not** equivalent to N1–N5; modern levels absent |
| Detail: audio | control visible with accessible label |
| Detail: provenance | KANJIDIC2 + CC BY-SA 4.0 surfaced |
| Reverse lookup | `?component=言` → exactly 話 and 語 |
| Cross-domain nav | kanji → `/dictionary/<id>` round trip |
| Pagination | 20/page, page 1→2 via URL `offset=20`, **no overlap**, back to page 1 |
| Deep links | `?grade=1`, `?radical=85`, `?component=言` directly addressable |
| Clear filters | returns to `/kanji` and the idle prompt |
| Error states | kana path → "Invalid kanji"; 鬱 → "Kanji not found" |
| Navigation | reachable from the global header |

## Implementation evidence

| Component | File |
|---|---|
| Explorer client | `src/app/kanji/KanjiExplorerClient.tsx` |
| Explorer route | `src/app/kanji/page.tsx` (`force-dynamic`, Suspense) |
| Detail client | `src/app/kanji/[literal]/KanjiDetailClient.tsx` |
| Detail route | `src/app/kanji/[literal]/page.tsx` (`force-static`) |
| Shared script utils | `src/lib/japanese.ts` |
| Shared pronunciation | `src/components/useJapaneseSpeech.ts`, `src/components/PronunciationButton.tsx` |
| Global nav | `src/app/layout.tsx` (Kanji link) |
| Journey test | `e2e/kanji-explorer.spec.ts` |

## Boundary verification

```bash
grep -RIlnE '@/db|drizzle-orm|KanjiRepository|KanjiService' \
  src/app/kanji src/components --include='*.ts' --include='*.tsx'
# no matches  → PASS

grep -rlE '@/db|drizzle-orm' src/repositories/
# DictionaryRepository.ts, KanjiRepository.ts   ← only DB-touching modules
```

✅ The kanji UI never queries the database.

## Defect found and fixed

**`force-static` silently breaks URL-driven client state.**

With `export const dynamic = "force-static"` on `/kanji`, the Next and Clear
controls did nothing. Instrumentation proved `router.replace()` was called with
the correct target and its promise **resolved**, yet the URL never changed:

```text
[applyFilters] {"share":"/kanji?grade=1&offset=20","target":"/kanji?grade=1&offset=20","offset":20}
[applyFilters] resolved
URL after click: http://127.0.0.1:3100/kanji?grade=1     ← unchanged
```

Switching `/kanji` to `force-dynamic` fixed it. The constraint is now documented
in both `page.tsx` and the client so it is not later "optimised" back to static.
`/kanji/[literal]` stays `force-static` (pathname navigation is unaffected).

Three further failures were test-side strict-mode collisions, fixed by scoping
assertions rather than weakening them — notably 水 has both `みず` and `みず-`
kun readings, and 11 elements contain "water" once the vocabulary list renders.

## Refactoring (no duplication left behind)

- Consolidated three copies of kanji-detection into `src/lib/japanese.ts`,
  adding `resolveKanjiSegment` for encoded/decoded route segments.
- Moved the pronunciation hook out of the dictionary route into
  `src/components/`, shared by dictionary and kanji; deleted the old copy.

## Regression checks

| Feature | Result |
|---|---|
| Phase 04 ETL suite | ✅ 69/69 |
| v1 dictionary API | ✅ 5/5 |
| v2 dictionary API | ✅ 7/7 |
| v2 kanji API | ✅ 11/11 (still green after the `resolveKanjiSegment` refactor) |
| Dictionary UI journey | ✅ 4/4 |
| Knowledge data | ✅ 501 dict / 300 kanji / 501 sentences / 1449 enrichments |
| Learning app data | ✅ 5 decks |
| Global nav | ✅ existing links intact, Kanji added |

## Final validation

| Command | Result |
|---|---|
| `npm run lint` | ✅ clean |
| `npx tsx --test etl/tests/*.test.ts` | ✅ 69/69 |
| `npx tsx --test src/app/api/dictionary/dictionary.integration.test.ts` | ✅ 5/5 |
| `npx tsx --test src/app/api/v2/dictionary/dictionary-v2.integration.test.ts` | ✅ 7/7 |
| `npx tsx --test src/app/api/v2/kanji/kanji-v2.integration.test.ts` | ✅ 11/11 |
| `npx playwright test` | ✅ 14/14 |
| `npx next typegen` | ✅ types generated |
| `npm exec tsc -- --noEmit --pretty false` | ✅ 0 errors |
| `npm run build` | ✅ `/kanji` (ƒ) and `/kanji/[literal]` (○) in manifest |
| `build_and_start` | ✅ healthcheck passed |

## Live smoke tests

| Check | Result |
|---|---|
| `/kanji` | ✅ 200, renders "Kanji Explorer" |
| `/kanji/水`, `/kanji?grade=1`, `/kanji?component=言` | ✅ 200 |
| `/kanji/あ` (kana), `/kanji/鬱` (unknown) | ✅ 200 shell → graceful client states |
| Home nav contains `href="/kanji"` | ✅ |

## Environment notes

- The sandbox **wipes the Playwright browser cache and resets `.env` between
  turns**. `npx playwright install --with-deps chromium` and re-adding
  `KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS=true` were both required this turn.
  The PostgreSQL data itself persisted.
- `KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS` must remain `true` while the corpus is
  synthetic; without it components/JLPT/furigana/conjugations are correctly
  hidden (fail-closed) and the explorer shows fewer sections.

## Commands

```bash
npx playwright install --with-deps chromium   # one-time per sandbox
npm run build                                  # required before next start
npx playwright test                            # the gate
npx playwright test e2e/kanji-explorer.spec.ts # kanji journeys only
```

## Remaining constraints

- Corpus is **synthetic fixture data**; not production knowledge.
- Modern kanji N1–N5 levels remain **unpopulated** (no approved source); the UI
  states this rather than guessing from the legacy scale.
- KRADFILE component coverage is fixture-limited (20 characters), so most kanji
  show "No component decomposition available" — an honest empty state, not a bug.
- No cloud deployment performed or claimed. Repo A (`Arena-test`) remains
  inaccessible from this environment.
