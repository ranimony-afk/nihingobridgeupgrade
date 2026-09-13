# PHASE 06.4 — Kanji Mind Tree + Vercel deployment hardening

Status: **COMPLETE** (implementation · tests · build · migration · docs · deployment gate)

Scope of this phase

1. Build the **Kanji Mind Tree** strictly from database relationships
   (`kanji_radicals`, `kanji_components`, `kanji_vocabulary`) — no hand drawn
   layout data, no hard coded decomposition tables.
2. Make the repository deployable on Vercel (fix the reported
   `Cannot find module '../data/kangxi-radicals'` build failure and the
   build-time `DATABASE_URL` coupling).
3. Pass the end-to-end gate: **search kanji → open kanji → inspect radical →
   inspect components → inspect vocabulary**.

---

## 1. Implementation evidence

| Area | File | Symbol / route | Evidence |
| --- | --- | --- | --- |
| Schema | `src/db/schema.ts` | `kanji`, `radicals`, `kanji_radicals`, `components`, `kanji_components`, `vocabulary`, `kanji_vocabulary`, `sources`, `etl_runs` | additive Drizzle schema; pushed with `npx drizzle-kit push` (no DROP/TRUNCATE) |
| Domain contracts | `src/types/knowledge.ts` | `MindTree`, `MindTreeNode`, `MindTreeEdge`, `KanjiDetail`, `RadicalRef`, `ComponentRef`, `VocabularyEntry` | shared by web + API + future Flutter client |
| Repository | `src/repositories/knowledge.ts` | `findKanjiRowByLiteral`, `searchKanji`, `getRadicalsForKanji`, `getComponentsForKanji`, `getComponentsForKanjiIds`, `getKanjiUsingComponentLiteral`, `getVocabularyForKanji`, `getRadicalById`, `searchVocabulary` | raw SQL over the graph with array aggregation |
| Service | `src/services/knowledge/mind-tree.ts` | `buildMindTree(literal, { depth, vocabularyLimit, derivativesLimit })` | BFS over `kanji_components`; component → `kanji_id` recursion; branch nodes for radicals / vocabulary / reverse-index derivatives |
| API | `src/app/api/kanji/[literal]/mind-tree/route.ts` | `GET /api/kanji/語/mind-tree?depth=3` | returns `{ root, nodes, edges, counts, provenance }`; `edges.length === nodes.length - 1` (pure tree) |
| API | `src/app/api/kanji/search/route.ts`, `src/app/api/kanji/[literal]/route.ts`, `src/app/api/radicals/[id]/route.ts`, `src/app/api/dictionary/search/route.ts`, `src/app/api/admin/etl/status/route.ts` | search / detail / radical / dictionary / ETL status | consumed by web + gate test |
| UI | `src/components/kanji/kanji-mind-tree.tsx` | `KanjiMindTree` | computes layout from `nodes` + `edges`, renders SVG bezier connectors, interactive inspector, branch filters, depth 1–3 refetch, collapse/expand |
| UI | `src/app/kanji/[literal]/page.tsx` | kanji detail | header + mind tree + radical list + component cards + vocabulary + "kanji built from" reverse index + provenance footer |
| UI | `src/app/kanji/radicals/[id]/page.tsx`, `src/app/kanji/page.tsx`, `src/app/dictionary/page.tsx`, `src/app/admin/page.tsx`, `src/app/page.tsx` | radical / search / dictionary / admin / home | all server-rendered from PostgreSQL |
| ETL | `etl/` | `run-pipeline.mjs`, `parsers/*`, `sources/registry.mjs`, `loaders/postgres.mjs` | KANJIDIC2 + RADKFILE + KRADFILE + JMdict → canonical graph, provenance recorded in `sources` + `etl_runs` |
| ETL fix | `etl/data/kangxi-radicals.ts` | `KANGXI_RADICALS`, `RADICAL_CHARACTER_TO_NUMBER`, `KANGXI_RADICAL_BY_NUMBER`, `getKangxiRadical`, `getKangxiRadicalByCharacter` | 214 Kangxi radicals with variants (restores the missing module from the Vercel failure) |
| ETL fix | `etl/provenance/import-run.ts` | `startImportRun`, `finishImportRun`, `withImportRun`, `ImportRun` | records runs into `etl_runs`; TLS aware |
| Build hardening | `tsconfig.json` | `exclude: ["node_modules", "etl", "tests", "scripts", "reports", "docs"]` | ETL scripts can no longer fail `next build` |
| Build hardening | `tsconfig.etl.json` | separate project for `etl/**` | `npx tsc -p tsconfig.etl.json --noEmit` |
| Build hardening | `src/db/index.ts` | `getPool`, `getDb`, `db` (lazy Proxy), `pool`, `sslConfig` | no env access at import; TLS for hosted DB; pool max 5 |
| Build hardening | `next.config.ts` | `serverExternalPackages: ["pg"]` | Postgres driver external in the serverless bundle |
| Docs | `docs/DEPLOYMENT.md`, `docs/PROVENANCE.md`, `etl/README.md`, `.env.example` | — | deployment runbook, licence record, ETL commands, env keys |

### Mind Tree derivation rules (no manual data)

```
root            = kanji (literal)
radical branch  = kanji_radicals ──▶ radicals          (Kangxi + RADKFILE groups)
component branch= kanji_components ─▶ components        (KRADFILE decomposition)
                recursion: components.kanji_id ─▶ kanji ─▶ kanji_components … (depth 1..3)
vocabulary branch = kanji_vocabulary ─▶ vocabulary      (JMdict entries containing the kanji)
used-in branch  = reverse kanji_components              (kanji that contain this glyph)
provenance      = sources rows referenced by the loaded datasets
```

Kangxi numbering is itself derived (`coverage = |radkfile group ∩ KANJIDIC2 radical class| /
|class|`, canonical group per number = max overlap), documented in
`docs/PROVENANCE.md`.

## 2. Test commands & results

```bash
npx next typegen                       # ✓ Types generated successfully
npm exec tsc -- --noEmit --pretty false            # ✓ exit 0
npx -- tsc -p tsconfig.etl.json --noEmit           # ✓ exit 0
npm run lint                                       # ✓ exit 0
npm run build                                      # ✓ exit 0 (also with DATABASE_URL unset)
node tests/knowledge-gate.mjs                      # ✓ GATE PASSED (DB level)
node tests/knowledge-gate.mjs http://127.0.0.1:3000 # ✓ GATE PASSED (DB + HTTP E2E)
```

Gate output — database level (`node tests/knowledge-gate.mjs`):

```
PASS  db: sample kanji exists — {"id":828,"literal":"語","radicals":"4","components":"3","vocabulary":"82"}
PASS  db: kanji has radical links — 4 links
PASS  db: kanji has component links — 3 links
PASS  db: kanji has vocabulary links — 82 links
PASS  db: no dangling graph edges — {"bad_kanji":"0","bad_component":"0","bad_radical":"0","bad_vocabulary":"0"}
PASS  db: components linked back to kanji entries (recursion possible) — 247 components
GATE PASSED
```

Gate output — end to end over HTTP (`node tests/knowledge-gate.mjs http://127.0.0.1:3000`):

```
PASS  http: /api/health
PASS  http: search kanji — 1 results
PASS  http: open kanji — id 828
PASS  http: kanji radicals
PASS  http: kanji components
PASS  http: kanji vocabulary
PASS  http: mind tree nodes — 30 nodes
PASS  http: mind tree is a tree — 29 edges
PASS  http: mind tree branches
PASS  http: mind tree recursion depth — max depth 3
PASS  http: inspect radical — radical 言 · 494 kanji
PASS  http: radical page renders
PASS  http: inspect vocabulary — 24 entries
PASS  http: kanji page renders
PASS  http: kanji page contains mind tree
PASS  http: kanji page shows components
PASS  http: kanji page shows vocabulary
PASS  http: search page renders results
GATE PASSED
```

### Defects found by the gate and fixed

| Symptom | Root cause | Fix |
| --- | --- | --- |
| `GET /api/kanji/語` → HTTP 500 | `coalesce(cm.meanings, r.meanings, '{}'::text[])` mixed `text[]` with the `jsonb` column `radicals.meanings` (`ERROR 42804`) | cast through `ARRAY(SELECT jsonb_array_elements_text(r.meanings))` in `getComponentsForKanji`, `getComponentByLiteral`, `getComponentsForKanjiIds` |
| Vercel build failed when `DATABASE_URL` was absent | `drizzle(pool)` touched the pool during module evaluation | lazy `getPool()` / `getDb()` + `db` Proxy (`src/db/index.ts`); repositories call `getDb()` |
| `/api/health` returned 503 when the schema was not provisioned | health required the knowledge tables | health now returns 200 when the connection works and reports `knowledge.provisioned` + a remediation `note` |

E2E gate (HTTP) covers: `/api/health`, `/api/kanji/search?q=語`,
`/api/kanji/語` (radicals + components + vocabulary non-empty),
`/api/kanji/語/mind-tree?depth=3` (tree invariant, all three branches, depth ≥ 2),
`/api/radicals/{id}` + `/kanji/radicals/{id}` HTML,
`/api/dictionary/search?q={word}`, `/kanji/語` HTML containing the mind tree,
`/kanji?q=water` results page.

## 3. Dataset loaded

| Entity | Count |
| --- | --- |
| kanji (KANJIDIC2) | 13,108 |
| meanings / readings | 24,815 / 40,502 |
| radicals (RADKFILE groups) | 253 (190 canonical Kangxi) |
| kanji↔radical links | 37,064 |
| components | 253 (247 link back to a kanji entry) |
| kanji↔component links | 25,699 |
| vocabulary (JMdict, priority ≤ 2) | 25,436 |
| kanji↔vocabulary links | 51,367 |

## 4. Regression checks (existing behaviour still works)

| # | Feature | Check | Result |
| --- | --- | --- | --- |
| 1 | Health endpoint | `GET /api/health` → `{status:"ok", database:"up", knowledge:{...}}` | ✓ |
| 2 | Home page DB render | `/` lists knowledge counters + 12 most frequent kanji | ✓ |
| 3 | Kanji search | `/kanji?q=water` and `/api/kanji/search?q=みず` | ✓ |
| 4 | Dictionary | `/dictionary?q=日本語` returns JMdict entries | ✓ |
| 5 | Admin / ETL status | `/admin` shows sources, licences and `etl_runs`; `/api/admin/etl/status` JSON | ✓ |
| 6 | Build without env | `npm run build` with `.env` removed | ✓ exit 0 |

## 5. Deployment

See `docs/DEPLOYMENT.md`. Summary:

```bash
export DATABASE_URL="postgresql://…?sslmode=require"
npx drizzle-kit push --config drizzle.config.json
node etl/run-pipeline.mjs
git push origin main            # Vercel builds with `npm run build`
curl -s $BASE/api/health
node tests/knowledge-gate.mjs $BASE
```

Vercel env: `DATABASE_URL` (pooler host, `sslmode=require`), `DATABASE_POOL_MAX=5`.

## 6. Stop conditions / open items

* Kangxi numbering (190/214 canonical groups) is derived statistically; the
  remaining 24 numbers have no RADKFILE group. Reconciliation with
  `etl/data/kangxi-radicals.ts` (now committed) is the recommended next step —
  it allows seeding all 214 radicals deterministically.
* JLPT levels are the legacy KANJIDIC2 levels mapped `4→N5, 3→N4, 2→N2, 1→N1`;
  N3 has no upstream signal and needs a curated list.
