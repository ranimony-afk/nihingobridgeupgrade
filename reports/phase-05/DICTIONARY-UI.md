# Phase 05.3 — Dictionary UI

**Status:** ✅ Implemented. Playwright dictionary journey passes.

## Routes

| Route | Type | File |
|---|---|---|
| `/dictionary` | search | `src/app/dictionary/page.tsx` → `DictionaryClient.tsx` |
| `/dictionary/[id]` | detail | `src/app/dictionary/[id]/page.tsx` → `DictionaryDetailClient.tsx` |

Both pages are database-free wrappers. Their client components call the stable
v2 API only:

- `GET /api/v2/dictionary/search`
- `GET /api/v2/dictionary/entries/:id`

Boundary audit:

```bash
grep -RInE '@/db|drizzle-orm|DictionaryRepository|DictionaryService' src/app/dictionary
# no matches
```

## Sections on the detail page

| Requirement | Implementation | Source |
|---|---|---|
| Readings | "Readings" panel — kanji forms and kana readings | `dictionary_kanji`, `dictionary_readings` |
| Meanings | Numbered senses with parts of speech | `dictionary_senses` |
| JLPT | N1–N5 badges + explicit "source-curated" disclaimer | `jlpt_level` + approved `knowledge_enrichments` |
| Kanji | Per-character card: strokes, grade, meanings, on/kun readings | `kanji_characters`, `kanji_readings`, `kanji_meanings` |
| Examples | Japanese + English translation + attribution | `sentences`, `sentence_links` |
| Conjugations | negative / polite / past / te grid | `knowledge_enrichments` (conjugation) |
| Audio | "Listen" button, on-device speech synthesis | Browser API |
| Related content | Links labelled `kanji` or `reading` | `dictionary_entries` |

Furigana renders via `<ruby>` from the furigana enrichment.

## Audio decision

Audio uses the **browser Speech Synthesis API**, not recorded corpus audio.

Phase 04.4 verified that Tatoeba audio carries a wider and unclearer licence
range than its text, and that where a recording's licence field is empty it may
**not** be reused outside Tatoeba at all. Shipping those recordings would
violate that finding. On-device TTS gives pronunciation with zero redistribution.

The control degrades gracefully: it reports when speech synthesis is
unsupported and when no Japanese voice is installed.

## Attribution obligations

Every example sentence renders its per-sentence attribution string
(e.g. `tanaka — Tatoeba sentence #200000 (CC BY 2.0 FR)`). This is a CC BY 2.0 FR
requirement, not decoration — the licence mandates citing each sentence's author
wherever it is displayed. The entry footer also states the dictionary source and
licence.

## Fixture-corpus visibility

The current corpus is synthetic, so its derived enrichments (JLPT, furigana,
conjugations) are hidden by default under `NODE_ENV=production` to avoid
presenting fixture data as verified source facts.

`KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS` is an explicit, documented opt-in for
environments deliberately running against the fixture corpus (CI, staging, local
preview). It must be `false` once real checksum-verified EDRDG source runs are
loaded. This replaced an implicit `NODE_ENV !== "production"` guess with an
auditable flag.

## Test infrastructure

- `playwright.config.ts` — dedicated port 3100, `reuseExistingServer: false`,
  so Playwright owns the server lifecycle and leaves nothing running.
- `e2e/dictionary-journey.spec.ts` — 4 journeys.
- `.gitignore` excludes `test-results/` and `playwright-report/`.
