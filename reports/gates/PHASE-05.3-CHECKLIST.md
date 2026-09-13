# PHASE 05.3 — Dictionary UI — GATE CHECKLIST

**Prompt:** Create `/dictionary` and `/dictionary/[id]` including readings, meanings, JLPT, kanji, examples, conjugations, audio, related content.
**Deployment gate:** Playwright dictionary journey passes.
**Status:** ✅ **GATE PASSED** — 11/11 against a production build, deterministic across two consecutive runs.

---

## 1. Gate result

```bash
npm run build && npx playwright test
```

```text
Running 11 tests using 1 worker
  ✓ lands on /dictionary in the idle state
  ✓ searches by kanji and lists ranked results
  ✓ searches by romaji and English via the same UI
  ✓ filters by JLPT level without a query
  ✓ shows a friendly empty state for no matches
  ✓ full journey: search → open entry → every required section renders
  ✓ related entries navigate to another /dictionary/[id] page
  ✓ back link returns to the dictionary search
  ✓ unknown entry ids render the not-found page
  ✓ malformed entry ids render the not-found page
  ✓ entry page has meaningful metadata title
11 passed (6.0s)
```

The journey runs against **`next start` on a production build**, not `next dev`, so it exercises the deployable artefact. Playwright spawns and tears down its own server (`reuseExistingServer: false`); no process is left behind.

---

## 2. Required elements — each has an explicit Playwright assertion

| Required | `data-testid` | Assertion in the journey |
|---|---|---|
| readings | `section-readings`, `entry-reading` | visible; contains `たべる`; furigana `<ruby><rt>` contains `た` |
| meanings | `section-meanings` | visible; contains `to eat` |
| JLPT | `section-jlpt`, `jlpt-level` | first badge `N5`; source-curated disclaimer rendered |
| kanji | `section-kanji`, `kanji-component` | contains `食`, `eat`, `9 strokes` |
| examples | `section-examples`, `example-sentence`, `example-attribution` | sentence + English translation; **per-sentence `CC BY 2.0 FR` attribution**; Tatoeba footer |
| conjugations | `section-conjugations`, `conjugation-form` | exactly 4 forms; `食べない / 食べます / 食べた / 食べて` |
| audio | `audio-unavailable` | honest disabled state visible; `audio-play` count = 0 |
| related content | `section-related`, `related-entry` | visible; navigates to a different `/dictionary/[id]` |

---

## 3. Implementation evidence

| Layer | File / symbol | Note |
|---|---|---|
| Search page | `src/app/dictionary/page.tsx` + `DictionaryClient.tsx` | client; calls `/api/v2/dictionary/search` only; deep-linkable `?q=&jlpt=`; Suspense-wrapped for `useSearchParams` |
| Entry page | `src/app/dictionary/[id]/page.tsx` | **Server Component calling `DictionaryService.getDetail()`** — the canonical service, same one the API uses; never imports `@/db`/Drizzle |
| Audio | `src/app/dictionary/[id]/AudioButton.tsx` | client; renders explicit unavailable state; plays a licensed asset when one exists |
| Not found | `src/app/dictionary/[id]/not-found.tsx` | 404 for unknown and malformed ids |
| Detail aggregate | `DictionaryService.getDetail()` | composes base entry + examples + kanji + related + JLPT + audio |
| New repository queries | `DictionaryRepository.findExamples / findKanjiComponents / findRelated` | only Drizzle boundary; literal `position()` matching, no `LIKE` wildcards |
| Detail API | `GET /api/v2/dictionary/entries/:id/detail` | same aggregate over HTTP for Flutter/other clients |
| Contracts | `src/types/dictionary.ts` → `DictionaryEntryDetail`, `DictionaryExample`, `DictionaryKanjiComponent`, `DictionaryRelatedEntry`, `DictionaryAudio` | Drizzle-free |
| Playwright | `playwright.config.ts`, `tests/e2e/dictionary-journey.spec.ts` | `npm run test:e2e` |

### UI ↔ database boundary

```bash
grep -RInE '^\s*import .*(@/db|drizzle-orm|DictionaryRepository)' src/app/dictionary
# no matches
```

The `[id]` page calls the **service** (a Server Component is server code; this is the sanctioned boundary, identical to what the route handlers use). It does not query the database.

---

## 4. Two real findings the gate surfaced

### 4.1 Production policy vs. fixture corpus — resolved with an explicit opt-in, not a weakened policy

The first Playwright run failed on JLPT and furigana. Root cause: `DictionaryService` hides **fixture-provenance** enrichments under `NODE_ENV=production` (a deliberate Phase 04.5 safeguard), and `next start` *is* production mode. My earlier manual check had passed only because it ran under `tsx` in dev mode.

Two tempting fixes were rejected:
- **Weakening the production policy** — would expose synthetic data in real deployments.
- **Asserting against `next dev`** — the gate would no longer test the deployable artefact.

Resolution: `DICTIONARY_SHOW_FIXTURE_ENRICHMENTS=true`, an explicit env override (`resolveFixtureEnrichmentVisibility()`), set **only on Playwright's own test server** and documented in `.env.example` as must-remain-unset in production.

Verified the default was not weakened:
```
# next start with NO override →
{"jlptLevels":[],"enrichments":0,"examplesStillVisible":5,"kanjiStillVisible":1}
PASS: default prod policy still hides fixture enrichments
```
Examples and kanji still show because they derive from base **entries** (visible), not enrichment **runs** (gated).

### 4.2 Orphaned servers invalidated the gate — resolved

The second run still failed the same two tests even though the override worked when set directly. Cause: two orphaned `next-server` processes from earlier manual checks; one held port 3100 *without* the env var and Playwright's `reuseExistingServer: true` silently reused it. Fixed by killing the orphans and setting `reuseExistingServer: false` permanently so the gate always spawns a correctly-configured server. This is the kind of hazard that makes a gate pass on one machine and fail on another.

### 4.3 Related-link race — resolved

`toHaveURL(/\/dictionary\/\d+$/)` was satisfied by the *current* URL before navigation. Fixed by reading the target `href` before clicking and asserting the URL ends with exactly that path.

---

## 5. Audio — an honest state, not a fake control

Tatoeba audio was excluded on licence grounds in Phase 04.4 (per-recording licences; empty licence ⇒ no off-site reuse). No entry currently holds a licensed pronunciation asset. The UI therefore renders a **disabled "No audio" control with the reason in its tooltip/aria-label**, and the journey asserts that **no play button is present**. `DictionaryAudio` is a discriminated union so a licensed asset can be attached later without a UI rewrite.

---

## 6. Licence obligation closed

Phase 04.4 left this open: *"attribution must appear wherever sentences are displayed."* Every example sentence now renders its **per-sentence contributor attribution** (`ck — Tatoeba sentence #200002 (CC BY 2.0 FR)`) plus the Tatoeba/CC BY 2.0 FR footer, and the journey **asserts on it**.

---

## 7. Validation & regression

| Check | Result |
|---|---|
| `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| `npm run test:etl` | ✅ 69/69 |
| `npm run test:api` (v1 + v2) | ✅ 12/12 |
| `npm run test:e2e` | ✅ 11/11, twice |
| `npx next typegen` | ✅ |
| `tsc --noEmit` | ✅ (includes e2e spec) |
| `npm run build` | ✅ `/dictionary`, `/dictionary/[id]`, detail API in manifest |
| `build_and_start` | ✅ |
| Data integrity | ✅ dict 501 / kanji 300 / sentences 501 / decks 5 / cards 128 |
| Default prod policy | ✅ fixture enrichments still hidden without override |
| Stray processes | ✅ none |

---

## 8. Caveats

- **Fixture corpus.** Real JMdict/KANJIDIC2/Tatoeba are not loaded; content is synthetic. `Playwright` proves the *journey*, not corpus quality.
- **Audio has no licensed source yet.** A pronunciation source with documented reuse terms is a separate procurement/licensing task.
- **Related content is heuristic** (shares a kanji / same reading). Semantic relations belong to a later knowledge-linking phase.
- **Repo A still inaccessible**; this is the validated local workspace. **Not deployed**, so not claimed (Rule 15).

## 9. Commands

```bash
npm run build
npm run test:e2e          # Playwright gate (spawns its own prod server)
npm run test:api
npm run test:etl
npx playwright show-report reports/playwright
```
