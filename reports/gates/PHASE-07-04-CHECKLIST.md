# PHASE 07.4 — Grammar detail page

Status: **COMPLETE** (implementation · tests · build · docs · E2E gate)

Depends on: 07.1 (schema/service), 07.2 (API), 07.3 (explorer). Adds two new
knowledge types — **structure slots** and **common mistakes** — and rebuilds the
detail page around them.

---

## 1. Required sections → implementation

| Required | Where it comes from | Rendered by |
| --- | --- | --- |
| **JLPT** | `grammar_points.jlpt_level` | header badge `data-testid="grammar-jlpt"` + a Level tile; links to `/grammar?jlpt=N` |
| **Meaning** | `summary` + `explanation` (+ `notes` caveat) | `data-testid="grammar-meaning"` |
| **Structure** | NEW `grammar_structures` (ordered slots: label, content, required, note) | numbered slot diagram, `data-testid="grammar-structure"` |
| **Formation** | `grammar_points.formation` + `grammar_patterns` (pattern, match text, core/variant, note) | `data-testid="grammar-formation"` |
| **Examples** | `grammar_examples` + `grammar_example_matches` | interactive list (reveal translations, max-length slider), `data-testid="grammar-examples-section"` |
| **Related grammar** | `grammar_relations` (typed, both directions) + prev/next within the level | `data-testid="grammar-related"`, plus a link to the relations API |
| **Common mistakes** | NEW `grammar_mistakes` (incorrect / correction / explanation / severity) | `data-testid="grammar-mistakes"`: ✗ sentence, hidden ✓ correction (“Show correction”), why, severity chip + filter |

Also on the page: tags, register, pattern list, kanji-in-examples and vocabulary
cross links, and the provenance footer (Tanaka / EDRDG + CC BY-SA curated content).

## 2. New data model (additive)

```sql
grammar_structures (id, grammar_point_id, position, label, content, required, note, source_id)
    UNIQUE (grammar_point_id, position)
grammar_mistakes   (id, grammar_point_id, position, incorrect, correction, explanation, severity, source_id)
    UNIQUE (grammar_point_id, incorrect)
```

| Source | Content | Licence |
| --- | --- | --- |
| `etl/data/grammar-structures.json` | 54 points × 2–3 slots = 110 structure slots | CC BY-SA 4.0 (NihongoBridge) |
| `etl/data/grammar-mistakes.json` | 52 points × 1–2 errors = 63 mistakes (`common` / `subtle` / `critical`) | CC BY-SA 4.0 (NihongoBridge) |

Both are loaded by `etl/run-grammar-pipeline.mjs` (idempotent upserts) and
registered in the `sources` table with licence + checksum. They are **not**
corpus-derived — every error sentence is hand-authored for learners.

## 3. API additions

| Endpoint | Notes |
| --- | --- |
| `GET /api/grammar/[slug]` | payload now includes `structures`, `mistakes`, `neighbours`; `?include=` accepts `structures,mistakes` |
| `GET /api/grammar/[slug]/structures` | ordered slots for one point |
| `GET /api/grammar/[slug]/mistakes?severity=critical` | curated errors, severity filter |

Types live in `src/types/grammar.ts` (`GrammarStructure`, `GrammarMistake`,
`GrammarNeighbour`); repository helpers `listGrammarStructures`,
`listGrammarMistakes`; service wrappers `getGrammarStructures`,
`getGrammarMistakes` in `src/services/knowledge/grammar-api.ts`.

## 4. Test results — deployment gate

```bash
npx next typegen                                       # ✓
npm exec tsc -- --noEmit --pretty false                # ✓ exit 0
npx -- tsc -p tsconfig.etl.json --noEmit               # ✓ exit 0
npm run lint                                           # ✓ exit 0
npm run build                                          # ✓ exit 0
node tests/grammar-detail-gate.mjs http://127.0.0.1:3000   # ✓ 39 checks — GATE PASSED
```

`tests/grammar-detail-gate.mjs` walks the full journey:

1. **Search** — `/api/grammar/search` for `てしまう`, `conditional`, `purpose`,
   `ながら`; catalogue search resolves `te-shimau`; the explorer page
   (`/grammar/explorer?q=…`) server-renders the matching card.
2. **Open** — `/api/grammar/te-shimau` returns JLPT N4, meaning, 2 structure
   slots, formation, 8 examples, 2 related points, 2 mistakes; every example has
   match evidence and every mistake has wrong + right + why + severity.
3. **Dedicated endpoints** — `/structures` (2 slots), `/mistakes` (2, severity
   filter honoured), unknown slug → 404.
4. **HTML** — every section `data-testid`, the JLPT badge, “Show correction”
   buttons, `<mark>` highlights, structure slot labels, level navigation.
5. **Follow a relation** — first related slug (`te-oku`) opens and also shows the
   sections.
6. **Coverage sweep** — 12 sampled points: **11/12** expose all seven sections
   (the remaining point currently has no curated mistake — empty state shown).

### Regression gates (all green)

```bash
node tests/grammar-explorer-gate.mjs http://127.0.0.1:3000  # 07.3 ✓
node tests/grammar-api-gate.mjs      http://127.0.0.1:3000  # 07.2 ✓
node tests/grammar-gate.mjs          http://127.0.0.1:3000  # 07.1 ✓
node tests/knowledge-gate.mjs        http://127.0.0.1:3000  # 06.4 ✓
```

## 5. Defects found & fixed

| Symptom | Root cause | Fix |
| --- | --- | --- |
| detail endpoint returned 404 for every point | prev/next query used `SELECT (sort_order, slug) …` — Postgres rejects `SELECT (a, b)` as a row comparison subquery (`42601 subquery has too few columns`), the service caught the error and degraded to `null` | rewritten with `lag()` / `lead()` window functions over the same level |
| gate assertion `all N` failed | React SSR splits `all {expr} points` into separate text nodes with comment markers | assertion now checks the `/grammar?jlpt=N` href |

## 6. Files touched

| Area | Files |
| --- | --- |
| Schema | `src/db/schema.ts` (`grammar_structures`, `grammar_mistakes`) |
| Data | `etl/data/grammar-structures.json`, `etl/data/grammar-mistakes.json` |
| ETL | `etl/run-grammar-pipeline.mjs`, `etl/sources/registry.mjs` |
| Contracts | `src/types/grammar.ts` |
| Repository / service | `src/repositories/grammar.ts`, `src/services/knowledge/grammar-api.ts` |
| API | `src/app/api/grammar/[slug]/route.ts`, `…/structures/route.ts`, `…/mistakes/route.ts` |
| UI | `src/app/grammar/[slug]/page.tsx` (rebuilt), `src/components/grammar/grammar-mistakes.tsx` (new) |
| Tests / docs | `tests/grammar-detail-gate.mjs`, `docs/PROVENANCE.md`, `docs/api/grammar-api.md`, `scripts/provision.sh` |

## 7. Next steps

* Fill the remaining gap so **all** points have at least one curated mistake
  (currently 52/54) and add N2/N1 points.
* Attach a "did you mean?" hint to each mistake so the learner self-diagnoses
  before revealing the correction.
* Study mode: turn mistakes into cloze exercises and feed the SRS queue.
