# Phase 06.3 — Radical & Component Relationships

**Status:** ✅ Implemented. 12 API integration tests + 9 Playwright journeys pass.

## What was actually missing

Phase 06.1/06.2 exposed radicals and components, but the underlying model was thin:

| Gap | Before | After |
|---|---|---|
| Radical identity | bare integer `85` on `kanji_characters` | `radicals` row: 水, variants 氵氺, 4 strokes, "water", さんずい |
| Component storage | JSON array inside an enrichment blob | first-class `kanji_components` rows, indexed both directions |
| Query power | single `component=` via `jsonb @>` scan | indexed reverse lookup **and** multi-component AND |
| Coverage | 20 kanji, 20 relationships | 20 kanji, 34 relationships, 30 radical-linked |

## Data model

```
radicals                      kanji_components
  number (1–214, unique)        kanji_id     → kanji_characters
  character                     component
  variants  ["氵","氺"]         radical_id   → radicals (nullable)
  stroke_count                  position
  meaning / reading             source_import_run_id (NOT NULL)
                                UNIQUE(kanji_id, component)
```

`radical_id` is nullable **by design**: a component is not necessarily a Kangxi
radical. In this corpus 30 of 34 relationships link to a radical; the remaining
four (交 五 良 亍) are genuine non-radical components and are recorded as such
rather than force-fitted.

Provenance is mandatory on every relationship row — an untraceable
kanji↔component edge cannot exist.

## The two relations are kept distinct

This is the core modelling decision, and the UI mirrors it:

- **Classification** — each kanji has exactly *one* radical, used for dictionary
  ordering (`kanji_characters.radical_classical`).
- **Composition** — each kanji has *many* components (`kanji_components`).

`/radicals/149` shows both under separate headings with explanatory copy,
because conflating them is the usual way radical UIs mislead learners.

## Multi-radical (AND) search

The headline capability. `components=言,口` returns kanji containing **every**
listed component:

```
components=言       → 話, 語      (2)
components=言,口    → 語          (1)   ← 話 has 言 but not 口
components=舌,口    → (none)      (0)   ← honest empty result, not an error
```

Implemented as a correlated `count(distinct component) = N` predicate against
the indexed relationship table, so it composes with the existing stroke/grade/
radical/JLPT filters rather than short-circuiting them.

The parser accepts both `言,口` and bare `言口`, since pickers naturally emit
either shape, and caps selection at 12 components.

## API

| Route | Purpose |
|---|---|
| `GET /api/v2/radicals` | full 214-radical index, grouped by stroke count, with corpus usage counts |
| `GET /api/v2/radicals?view=components` | components actually present in the corpus (drives the picker) |
| `GET /api/v2/radicals/:number` | radical detail + `kanjiByRadical` + `kanjiByComponent` |
| `GET /api/v2/kanji/search?components=…` | multi-radical AND search |

Errors: `INVALID_NUMBER` / `INVALID_QUERY` 400, `NOT_FOUND` 404,
`INTERNAL_ERROR` 500. Reference data is cached longer (`s-maxage=3600`) than
search results since the radical list is effectively static.

## UI

- **`/radicals`** — all 214 grouped by stroke count, each showing character,
  meaning and usage count; optional "only radicals present in this corpus" filter.
- **`/radicals/[number]`** — large glyph, variants, and the two relation lists
  side by side, each linking to `/kanji/<literal>`.
- **Kanji explorer** — a component picker populated *from the corpus*, so it can
  only ever offer components that return results. Selection is URL-backed and
  deep-linkable (`/kanji?components=言,口`).

## Licensing (Rule 9)

The Kangxi radical system is from the 康熙字典 (1716) and is **public domain**.
Radical numbers, characters, positional variants and stroke counts are
standardised factual data, not a creative work, and were not copied from a
proprietary database.

The short English descriptors are conventional one-or-two-word labels curated
for this project. The import run records this explicitly and does **not**
attribute them to EDRDG or any other upstream dataset:

> `license`: "Kangxi radical system: public domain (康熙字典, 1716). English labels curated by NihongoBridge."

Component data still originates from the synthetic KRADFILE fixture and inherits
that run's fixture provenance, so promotion is gated behind
`allowFixtureProvenance` exactly like every other enrichment.

## Fixture artifact worth knowing

The synthetic KANJIDIC2 generator assigns radical numbers round-robin
(`index % 214 + 1`), so **all 214 radicals report non-zero usage** in this
corpus. The "only radicals present" filter is therefore a no-op here; against
real KANJIDIC2 data it would filter meaningfully. A Playwright assertion
originally expected a reduction — the premise was wrong, not the code, and the
test now asserts the invariant that actually holds.
