# Phase 06.2 — Kanji Explorer UI

**Status:** ✅ Implemented. Playwright kanji journey passes (10/10).

## Routes

| Route | Type | File |
|---|---|---|
| `/kanji` | explorer (search + filters + pagination) | `page.tsx` → `KanjiExplorerClient.tsx` |
| `/kanji/[literal]` | kanji detail | `page.tsx` → `KanjiDetailClient.tsx` |

Both pages are database-free. They call the Phase 06.1 API only:

- `GET /api/v2/kanji/search`
- `GET /api/v2/kanji/:literal`

Boundary audit — no `@/db`, `drizzle-orm`, `KanjiRepository` or `KanjiService`
import appears anywhere in `src/app/kanji` or `src/components`:

```bash
grep -rlE '@/db|drizzle-orm' src/repositories/
# src/repositories/DictionaryRepository.ts
# src/repositories/KanjiRepository.ts     ← the only two DB-touching modules
```

## Explorer capabilities

Search by kanji literal, English meaning, kana reading, or romaji, combined with
filters for **strokes**, **grade**, **radical**, **JLPT**, and **component**
(reverse KRADFILE lookup). Paginated 20 per page with Previous/Next.

### URL is the single source of truth

Filters and offset live in the query string, so any exploration is shareable and
directly addressable:

```
/kanji?q=water
/kanji?grade=1&offset=20
/kanji?radical=85
/kanji?component=言
```

Updates use `router.replace` (not `push`) so typing filters does not build an
unusable back-history stack.

## Detail page

| Section | Contents |
|---|---|
| Header | Large glyph, meanings, on-device pronunciation |
| Stats | Strokes, grade, frequency rank, UCS codepoint |
| Stroke note | Alternate counts recorded by the source (e.g. 水 → 5) |
| Readings | On, kun, other (pinyin/korean), nanori — grouped by type |
| Radicals & components | Classical/Nelson radical chips, KRADFILE decomposition |
| JLPT | Modern N-levels **and** the legacy scale, kept visibly distinct |
| Variants | Source variant codes |
| Words using this kanji | Cross-links into `/dictionary/[id]` |
| Provenance | Source, attribution, licence, checksum status, fixture warning |

### Navigation is bidirectional and knowledge-graph-shaped

Every facet is a link back into a filtered explorer view, so users can pivot
rather than restart:

- radical chip → `/kanji?radical=85`
- stroke chip → `/kanji?strokes=4`
- grade chip → `/kanji?grade=1`
- each KRADFILE component → `/kanji/<component>`
- "Find kanji built from 語" → `/kanji?component=語` (reverse lookup)
- each vocabulary word → `/dictionary/<id>`

This makes the component/radical relationships from Phase 04.5/06.1 explorable
in both directions, which is the point of modelling them.

## Domain correctness preserved in the UI

The legacy KANJIDIC2 JLPT scale is rendered **separately and explicitly
labelled**, never as a modern N-level:

> Source legacy JLPT scale: 4. This is KANJIDIC2's older 4-level scale and is
> **not** equivalent to a modern N1–N5 level.

When no approved modern source exists, the UI says so plainly ("No modern N1–N5
level assigned in the current corpus") rather than inventing one. The JLPT filter
still offers N1–N5 because the API supports it; it simply returns no results
until a reviewed source is loaded. The explorer also carries a persistent note
that JLPT levels are source-curated guides, not an official syllabus.

Audio uses on-device speech synthesis, consistent with the Phase 04.4 licensing
finding that Tatoeba audio may not be redistributed.

## Refactoring done alongside

- **`src/lib/japanese.ts`** — one shared definition of `isKanjiLiteral`,
  `isKanjiCodePoint`, `extractKanji`, and a new `resolveKanjiSegment` that
  tolerates both encoded and decoded route segments. Removed three duplicated
  copies (API route, `KanjiSearch`, page).
- **`src/components/useJapaneseSpeech.ts`** and **`PronunciationButton.tsx`** —
  the pronunciation hook/button moved out of the dictionary route and is now
  shared by dictionary entries and kanji. The old dictionary-local hook was
  deleted rather than left duplicated.

## Notable defect found: `force-static` breaks URL-driven state

The explorer was first written with `export const dynamic = "force-static"`.
Pagination and Clear then silently did nothing.

Instrumenting the handler showed `router.replace("/kanji?grade=1&offset=20")`
was called with the correct target and its promise **resolved successfully**, yet
the address bar never changed and no refetch occurred. Switching the page to
`force-dynamic` fixed it immediately.

Root cause: under `force-static` the App Router does not apply client-side
query-only navigations to the URL for a prerendered page. This is now documented
in both `page.tsx` and the client so it is not "optimised" back into a static
page later. `/kanji/[literal]` remains `force-static` — it uses ordinary `<Link>`
navigation across pathnames, which is unaffected.
