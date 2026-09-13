# PHASE 07.1 — Canonical grammar schema & service

Status: **COMPLETE** (implementation · tests · build · migration · docs · gate)

Depends on: PHASE 06.4 (kanji knowledge graph) — grammar links into `kanji` and
`vocabulary` through `grammar_point_kanji` / `grammar_point_vocabulary`.

---

## 1. Scope

* One canonical grammar schema (no second grammar model, no duplicated
  “grammar list” table in any other module).
* One grammar service consumed by the web app, the API and (later) Flutter.
* Grammar is **knowledge-first and evidence-first**: a curated point is always
  backed by real corpus sentences, and every sentence records *why* it matched.

## 2. Canonical data model (`src/db/schema.ts`)

| Table | Purpose |
| --- | --- |
| `grammar_points` | the point itself: slug, title (日本語), English gloss, summary, explanation, formation, notes, JLPT level, register, sort order, example count, `source_id` |
| `grammar_patterns` | surface forms (`〜てしまう`, `〜ちゃう`) + the literal `match_text` the ETL searches for, `is_core` flag, note, position |
| `grammar_examples` | Japanese/English sentence pair harvested from a licensed corpus, upstream `external_id`, length, `source_id` |
| `grammar_example_matches` | evidence: which pattern matched at which character offsets in which example |
| `grammar_tags` / `grammar_point_tags` | pedagogical tags (conditional, aspect, purpose, obligation …) |
| `grammar_relations` | typed relations between points: `prerequisite`, `similar`, `contrast`, `related`, `variant` |
| `grammar_point_kanji` | cross-domain link: kanji appearing in the point's examples (`via = 'example'`) |
| `grammar_point_vocabulary` | cross-domain link: dictionary entries realising a pattern (`via = 'pattern'`) |

All new tables are additive; the only schema change to existing objects was the
addition of the unique index `grammar_example_matches_unique`.

## 3. Evidence chain (the core design decision)

```
grammar_points ──▶ grammar_patterns ──▶ grammar_examples ──▶ grammar_example_matches
       │                                        │
       └──▶ grammar_point_kanji ──▶ kanji       └──▶ (kanji in sentence, highlighted in UI)
       └──▶ grammar_point_vocabulary ──▶ vocabulary
```

Nothing in the UI invents examples: the highlighted `<mark>` in a sentence is
rendered from the stored `start_index`/`end_index` of a real match.

## 4. Implementation evidence

| Area | File | Symbol / route |
| --- | --- | --- |
| Schema | `src/db/schema.ts` | `grammarPoints`, `grammarPatterns`, `grammarExamples`, `grammarExampleMatches`, `grammarTags`, `grammarPointTags`, `grammarRelations`, `grammarPointKanji`, `grammarPointVocabulary` |
| Contracts | `src/types/grammar.ts` | `GrammarPointSummary`, `GrammarPointDetail`, `GrammarPatternSummary`, `GrammarExample`, `GrammarExampleMatch`, `GrammarRelatedPoint`, `GrammarCatalog`, `GrammarStats` |
| Repository | `src/repositories/grammar.ts` | `listGrammarPoints`, `countGrammarPoints`, `getGrammarPointBySlug`, `listGrammarTags`, `getGrammarStats` |
| Service | `src/services/knowledge/grammar.ts` | `getGrammarCatalog`, `getGrammarPoint`, `getGrammarTagCloud`, `getGrammarOverview` |
| API | `src/app/api/grammar/route.ts` | `GET /api/grammar?q=&jlpt=&tag=&limit=&offset=` |
| API | `src/app/api/grammar/[slug]/route.ts` | `GET /api/grammar/te-shimau` |
| UI | `src/app/grammar/page.tsx` | catalogue: search, JLPT filter, tag cloud, counters |
| UI | `src/app/grammar/[slug]/page.tsx` | detail: formation, explanation, patterns, examples with highlighted matches, related points, kanji/vocabulary links, provenance |
| ETL | `etl/data/grammar-points.json` | 54 curated points (project-authored, CC BY-SA 4.0) |
| ETL | `etl/parsers/tanaka-examples.mjs` | `parseTanakaExamples`, `loadGrammarSeed` |
| ETL | `etl/run-grammar-pipeline.mjs` | points → patterns → tags → relations → corpus harvest → match evidence → cross links → counters |
| Provenance | `sources` rows `tanaka`, `grammar-seed` | licence, URL, checksum, retrieval timestamp |
| Ops | `scripts/provision.sh` | schema push + both pipelines + both gates |

## 5. Data loaded

| Entity | Count |
| --- | --- |
| grammar points | 54 (N5: 12, N4: 20, N3: 22) |
| surface patterns | 63 |
| example sentences | 429 (≤ 8 per point, ≤ 45 characters) |
| match records | 429 |
| relations | 47 |
| tags | 64 (points↔tags: 104) |
| kanji cross-links | 1,751 |
| vocabulary cross-links | 123 |

## 6. Test commands & results

```bash
npx next typegen                                  # ✓
npm exec tsc -- --noEmit --pretty false           # ✓ exit 0
npx -- tsc -p tsconfig.etl.json --noEmit          # ✓ exit 0
npm run lint                                      # ✓ exit 0
npm run build                                     # ✓ exit 0
node tests/grammar-gate.mjs                       # ✓ DB gate
node tests/grammar-gate.mjs http://127.0.0.1:3000 # ✓ DB + HTTP gate
node tests/knowledge-gate.mjs http://127.0.0.1:3000 # ✓ 06.4 regression gate
```

Grammar gate (HTTP portion):

```
PASS  http: catalogue — 54 points
PASS  http: filter by JLPT level — 20 N4 points
PASS  http: search grammar — 3 results
PASS  http: grammar detail
PASS  http: detail has patterns
PASS  http: detail has examples
PASS  http: examples carry match offsets
PASS  http: detail has related points
PASS  http: detail has kanji links
PASS  http: detail has provenance
PASS  http: /grammar page renders
PASS  http: /grammar lists points — 108 point links
PASS  http: /grammar has level filters
PASS  http: /grammar/[slug] renders
PASS  http: /grammar/[slug] shows examples
PASS  http: /grammar/[slug] highlights matches
PASS  http: admin shows grammar stats
GATE PASSED
```

## 7. Defects found & fixed during the phase

| Symptom | Root cause | Fix |
| --- | --- | --- |
| 0 examples harvested | `[].every(...)` is `true`, so the corpus loop broke after the first sentence | `break` only when `counts.size === totalPoints` and every count is full |
| `ON CONFLICT` error on match insert | no unique constraint for `(example_id, matched_text, start_index)` | added `grammar_example_matches_unique` (additive) |
| FK violation on `grammar_point_vocabulary` | the linking query selected `p.id` instead of `p.grammar_point_id` | corrected SELECT + `DISTINCT` |
| duplicate `sources` rows | `version IS NULL` is not distinct in the `(code, version)` unique index | `upsertSources` now stores `"unversioned"`; existing duplicates de-duplicated with reference re-pointing |
| gate assertion `JLPT N5` failed | React SSR splits `JLPT N{level}` into two text nodes | assertion now counts `/grammar/<slug>` links and checks `JLPT N` |

## 8. Regression checks (phase 06.4 still green)

| Feature | Check | Result |
| --- | --- | --- |
| Kanji Mind Tree gate | `node tests/knowledge-gate.mjs http://127.0.0.1:3000` | ✓ PASSED |
| Health endpoint | `GET /api/health` | ✓ ok, 13,108 kanji / 54 grammar points |
| Kanji pages | `/kanji`, `/kanji/語`, `/kanji/radicals/{id}` | ✓ render |
| Dictionary | `/dictionary?q=日本語` | ✓ render |
| Admin | `/admin` | ✓ now also shows grammar counters |

## 9. Licensing

* **Grammar explanations/formation/notes**: original NihongoBridge content,
  released CC BY-SA 4.0, stored in `etl/data/grammar-points.json`.
* **Example sentences**: Tanaka corpus (EDRDG), recorded as source `tanaka` with
  licence + URL + checksum; upstream sentence ids are stored per example.
* No proprietary grammar database (BunPro, JLPT Sensei, Wasabi, …) is used.

See `docs/PROVENANCE.md`.

## 10. Stop conditions / next steps (07.2 candidates)

* No conjugation engine yet — conjugations will hang off `grammar_patterns` in
  PHASE 07.2 (`conjugations` table + service).
* Coverage is N5–N3 only (54 points). N2/N1 points follow the same schema once
  curated; no schema change will be required.
* Examples are capped at 8 per point / 45 characters — a quality pass
  (de-duplication, difficulty scoring) is the obvious next improvement.
