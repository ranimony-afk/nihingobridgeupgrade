# Lesson architecture

Phase 09.2 defines the internal structure of a lesson. It builds on the Phase 09.1
hierarchy (`course → module → lesson → knowledge`) and still implements **no**
enrollment, attempts, progress, scoring or SRS.

## Lesson shape

```text
lesson
  ├─ module context (from Phase 09.1)
  ├─ objectives            → lesson_objectives        (normalised, ordered)
  ├─ sections              → lesson_sections          (authored teaching blocks)
  ├─ grammar points        → lesson_grammar_points    (Phase 09.1)
  ├─ kanji                 → lesson_kanji             (Phase 09.1)
  ├─ vocabulary            → lesson_vocabulary        (derived, Phase 09.2)
  └─ sentences             → lesson_sentences         (derived, Phase 09.2)
```

## Tables

| Table | Purpose | Source |
| --- | --- | --- |
| `lesson_sections` | ordered teaching blocks: `kind` (`explain`/`example`/`practice`/`note`), heading, Japanese heading, body, Japanese examples | authored, `lesson-architecture` |
| `lesson_objectives` | one row per learning objective, ordered | backfilled from `lessons.objectives` JSONB |
| `lesson_vocabulary` | lesson → dictionary entry, with `via` (`kanji`/`grammar`/`manual`) and position | derived |
| `lesson_sentences` | lesson → sentence, with the motivating grammar point and `via` | derived |

## Authoring versus derivation

The loader separates two kinds of content deliberately.

* **Authored** (`lesson_sections`) is original teaching copy stored in
  `etl/data/lesson-architecture.json` under CC BY-SA 4.0. It cannot be derived.
* **Derived** (`lesson_vocabulary`, `lesson_sentences`) is *never* copied. The
  loader resolves it from canonical knowledge:
  * vocabulary comes from `lesson_kanji` → `kanji_vocabulary`, ranked by JMdict
    priority, capped at 12 per lesson;
  * sentences come from `lesson_grammar_points` → `grammar_examples` →
    `sentences`, taking the two shortest examples per grammar point, capped at
    eight per lesson and de-duplicated per sentence.

Consequences: dictionary facts stay in one place, provenance stays answerable,
and every lesson sentence can be traced back to the grammar it demonstrates
(83 such traces in the current dataset).

## Backfill and compatibility

`lessons.objectives` (JSONB) is retained and still populated. The normalised
`lesson_objectives` table is canonical and is backfilled from the JSONB column on
every loader run. The API continues to expose `objectives: string[]` for existing
clients and adds `objectivesDetail` with explicit positions.

## API

| Route | Additions in 09.2 |
| --- | --- |
| `GET /api/lessons/[slug]` | `sections[]`, `objectivesDetail[]`, `knowledge.vocabulary[]`, `knowledge.sentences[]`, `structure{}` |

`structure` summarises counts so a client can render a lesson skeleton without
inspecting arrays.

## Web

`/lessons/[slug]` now renders:

* objectives in the sidebar;
* ordered sections with a kind chip, Japanese heading, body and Japanese examples;
* linked vocabulary routing to the dictionary;
* linked sentences routing to sentence detail, each labelled with its grammar point;
* existing grammar and kanji links unchanged.

## Search

Lesson search documents now aggregate section headings and bodies, so authored
lesson content is discoverable through unified PostgreSQL search in addition to
course, module and knowledge text.

## Provisioning

```bash
npx drizzle-kit push --config drizzle.config.json
node etl/run-pipeline.mjs
node etl/run-grammar-pipeline.mjs
node etl/run-content-pipeline.mjs
node etl/run-course-architecture.mjs
node etl/run-search-index.mjs
node tests/lesson-architecture-gate.mjs https://your-domain.example
```

`run-course-architecture.mjs` requires the knowledge, grammar and content
pipelines to have completed first, because it validates every referenced slug,
literal and upstream sentence id before writing.
