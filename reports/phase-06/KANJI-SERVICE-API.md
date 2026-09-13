# Phase 06.1 — Kanji Service & API

**Status:** ✅ Implemented and integration tested.

## Architecture

```
HTTP client (web / future Flutter)
  └── GET /api/v2/kanji/search
  └── GET /api/v2/kanji/:literal
        └── KanjiService
              ├── KanjiSearch  (normalisation / input bounds)
              └── KanjiRepository  (all Drizzle access)
                    └── PostgreSQL knowledge tables
```

### Boundary ownership

| Layer | File | Responsibility | Must not do |
|---|---|---|---|
| Search contract | `src/services/knowledge/KanjiSearch.ts` | NFKC normalisation, bounded limits/offset, validation of every filter | query PostgreSQL |
| Repository | `src/repositories/KanjiRepository.ts` | all kanji Drizzle access, ranking, related-record retrieval | expose DB rows to clients |
| Service | `src/services/knowledge/KanjiService.ts` | domain mapping, response composition, provenance-aware visibility | import Drizzle |
| API | `src/app/api/v2/kanji/search/route.ts`, `src/app/api/v2/kanji/[literal]/route.ts` | HTTP validation, error contracts, cache headers | access the database |
| Contracts | `src/types/kanji-v2.ts` | API-safe types, no Drizzle inference | — |

Verified by audit — only `src/repositories/*` import `@/db` / `drizzle-orm`.

## Endpoints

### `GET /api/v2/kanji/search`

```http
/api/v2/kanji/search?q=<literal|meaning|reading>&strokes=N&grade=N
                        &radical=N&jlpt=N1..N5&component=<kanji>
                        &limit=1..100&offset=0..10000
```

At least one of `q`, `strokes`, `grade`, `radical`, `jlpt`, `component` is required.

| Input | Handling |
|---|---|
| `q` = kanji | exact literal match |
| `q` = English | English meaning search (`kanji_meanings`, `language='en'`) |
| `q` = kana | on/kun reading search |
| `q` = romaji | WanaKana conversion when wholly kana, literal term retained |
| `strokes` | exact stroke count (1–64) |
| `grade` | 1–6 kyouiku, 8 jouyou, 9–10 jinmeiyou |
| `radical` | Kangxi/classical radical number (1–214) |
| `jlpt` | source-curated N1–N5 from approved enrichment runs |
| `component` | **reverse KRADFILE lookup**: kanji containing this component |

Ranking: literal → meaning → reading, then frequency, then literal.

### `GET /api/v2/kanji/:literal`

Returns `KanjiDetail`: stroke count and miscounts, grade, frequency, English
meanings, on/kun/other readings, nanori, variants, radicals (classical + Nelson),
KRADFILE component decomposition, and dictionary vocabulary containing the kanji.

Stable errors: `INVALID_QUERY` 400 · `INVALID_LITERAL` 400 · `NOT_FOUND` 404 ·
`INTERNAL_ERROR` 500. Both routes send `Cache-Control: public, max-age=60, s-maxage=300`.

## Domain correctness: JLPT scales

KANJIDIC2 ships **`jlpt_old`, the legacy 4-level scale** — not modern N1–N5.
These are different scales and must never be conflated.

- exposed as `jlptLegacy`, documented as legacy in the contract and the API response;
- `jlptLevels` (modern N1–N5) comes **only** from approved enrichment provenance;
- no approved source exists yet (Phase 04.5 finding: the JLPT publishes no
  official item list), so `jlptLevels` is `[]` and `jlpt=N5` search returns
  `total: 0` rather than a fabricated mapping.

The integration test asserts this explicitly — that a legacy value of `4` does
**not** surface as `N4`.

## Component / radical relationships

Two distinct concepts are modelled separately:

| Concept | Source | Field |
|---|---|---|
| Radical *number* (which radical group a kanji belongs to) | KANJIDIC2 columns | `radicals: [{system: "kangxi-classical"\|"nelson_c", number}]` |
| Component *decomposition* (which characters compose it) | KRADFILE enrichment | `components: ["言","五","口"]` |

`component=<kanji>` performs the reverse lookup, serving the master prompt's
"kanji component/radical relationships" domain.

Note: KRADFILE component data is currently **fixture-derived** and therefore
hidden in production unless `KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS=true`. KRADFILE
network mode remains blocked pending verified archive extraction (Phase 04.6).

## Defect found and fixed

### Drizzle renders column references differently per SQL clause

`sql\`${kanjiCharacters.id}\`` renders **qualified** (`"kanji_characters"."id"`)
inside `WHERE` but **unqualified** (`"id"`) inside the `SELECT` list. In a
correlated subquery the inner table's own `"id"` column then shadows it, so the
predicate silently compared the wrong column.

Symptom: rows were returned correctly (the `WHERE` form worked) while the
projected match booleans were all `false`.

Fix: write correlations as fully-qualified raw references, e.g.
`km."kanji_id" = "kanji_characters"."id"`.

**This also uncovered a latent bug in the Phase 05.2 dictionary search.** Its
English gloss subqueries used `${dictionaryEntries.id}` the same way. In this
fixture `dictionary_senses.id` coincides exactly with `entry_id` (one sense per
entry), so `ds."entry_id" = "id"` accidentally resolved correctly and the
Phase 05.2 tests passed **by coincidence**. Real JMdict has many senses per
entry, where ids diverge and English search would have silently broken. Both
repositories are now fixed.

The kanji suite caught it because `kanji_meanings` has 355 rows for 300 kanji,
so its ids genuinely diverge.

## Operational note: `.env` is not persistent

The sandbox reset `.env` to only `DATABASE_URL`, dropping
`KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS` and making the preview hide all
fixture-derived enrichments (components, JLPT, furigana, conjugations) — the
fail-closed default behaving correctly. The flag was restored. Any environment
running against the fixture corpus must set it explicitly.

## No UI in this phase

This prompt scoped to the **service and API**. A kanji UI is a natural
follow-up; the existing `/kana` page is unrelated static content.
