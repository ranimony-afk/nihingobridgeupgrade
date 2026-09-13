# PHASE 07.3 — Grammar explorer

Status: **COMPLETE** (implementation · tests · build · docs · gate)

Depends on: PHASE 07.1 (grammar schema/service) and PHASE 07.2 (grammar API).
07.3 is the user-facing layer and consumes the 07.2 contract over HTTP — it does
not add a second data path.

---

## 1. What was built

| Route | Type | Purpose |
| --- | --- | --- |
| `/grammar/explorer` | server shell + client island | search-as-you-type, JLPT / tag / register / sort filters, active-filter chips, “load more” pagination |
| `/grammar/map` | server shell + client island | relation map: one ring per JLPT level, click a node → patterns + relations panel, deep-linkable `?jlpt=N` |
| `/grammar/[slug]` | server page + client island | interactive corpus-evidence list (reveal/hide translations, max-length slider) |
| `/grammar` | server page | static catalogue (SEO entry) with links into both tools |

### Components

| File | Symbol | Behaviour |
| --- | --- | --- |
| `src/components/grammar/grammar-explorer.tsx` | `GrammarExplorer` | debounced (180ms) fetch of `GET /api/grammar`; pagination via `meta.pagination`; AbortController cleanup; keyboard-clearable search; error banner using `error.message` |
| `src/components/grammar/grammar-map.tsx` | `GrammarMap` | fetches `/api/grammar?limit=200` + `/api/grammar/graph?limit=200`; deterministic ring layout (N5 innermost, no physics jitter); relation-coloured SVG edges; selection dims non-neighbours; relation legend |
| `src/components/grammar/grammar-example-list.tsx` | `GrammarExampleList` | renders `<mark>` highlights **from `grammar_example_matches` offsets only**; “show/hide translations” (blur) and a max-length filter |

### API-first enforcement

Every interaction goes through the canonical endpoints documented in
`docs/api/grammar-api.md`:

* explorer → `GET /api/grammar?q=&jlpt=&tag=&register=&sort=&limit=&offset=`
* map → `GET /api/grammar?limit=200` + `GET /api/grammar/graph`
* detail page → server-side service call for the first paint; the example list is
  a pure client island over already-loaded data

No component queries the database, and no client-side code re-implements
filtering that the API already provides.

## 2. Server rendering guarantees

All three tools render their first paint on the server (SEO + no-JS):

* `/grammar/explorer` server-renders 24 point cards (`getGrammarCatalog`),
* `/grammar/map` server-renders the full SVG (`listGrammarPoints` + `getGrammarMap`),
* `/grammar/[slug]` server-renders the highlighted examples (`<mark>` is present
  in the initial HTML, proven by the gate).

## 3. Test results

```bash
npx next typegen                                        # ✓
npm exec tsc -- --noEmit --pretty false                 # ✓ exit 0
npx -- tsc -p tsconfig.etl.json --noEmit                # ✓ exit 0
npm run lint                                            # ✓ exit 0
npm run build                                           # ✓ exit 0
node tests/grammar-explorer-gate.mjs http://127.0.0.1:3000  # ✓ 37 checks
node tests/grammar-api-gate.mjs http://127.0.0.1:3000       # ✓ 07.2 regression
node tests/grammar-gate.mjs http://127.0.0.1:3000           # ✓ 07.1 regression
node tests/knowledge-gate.mjs http://127.0.0.1:3000         # ✓ 06.4 regression
```

`tests/grammar-explorer-gate.mjs` asserts: page status codes, `data-testid`
hooks, server-rendered card/link counts, presence of the search / sort / register
controls, level deep links (`?jlpt=4`, `?jlpt=5`), SVG canvas + relation legend,
interactive example list controls, `<mark>` highlighting in the SSR HTML, and —
on the API side — that the payloads the UI depends on are actually correct
(page 2 disjoint from page 1, every graph edge joins two known nodes, every map
node has a short pattern label, match offsets slice back to `matchedText`).

## 4. Design decisions

* **Deterministic ring layout** instead of a force simulation: the map is stable
  across renders, needs no animation loop, and stays readable at 54 nodes.
  (A force layout becomes necessary around ~300 nodes — noted for later.)
* **Client islands, not a client app**: pages stay server components and only the
  interactive parts ship JS, which keeps the explorer fast on mobile.
* **Highlights are data-driven**: the UI can only highlight ranges that exist in
  `grammar_example_matches`, so the “evidence” claim stays true end to end.
* **Lint-safe effects**: all fetches are started from a `setTimeout` callback and
  every `setState` happens after an `await`, satisfying
  `react-hooks/set-state-in-effect`.

## 5. Regression checks

| Feature | Check | Result |
| --- | --- | --- |
| Kanji Mind Tree (06.4) | `node tests/knowledge-gate.mjs http://127.0.0.1:3000` | ✓ PASSED |
| Grammar schema/service (07.1) | `node tests/grammar-gate.mjs http://127.0.0.1:3000` | ✓ PASSED |
| Grammar API (07.2) | `node tests/grammar-api-gate.mjs http://127.0.0.1:3000` | ✓ PASSED |
| Pages | `/`, `/kanji`, `/kanji/語`, `/dictionary`, `/grammar`, `/grammar/explorer`, `/grammar/map`, `/grammar/te-shimau`, `/admin` | ✓ 200 |

## 6. Operations

The platform bootstrap recreates the database; after `build_and_start` run
`./scripts/provision.sh` (schema + both pipelines + all gates). While the schema
is missing, the pages render empty states and `/api/health` reports
`knowledge.provisioned: false` — no 500s.

## 7. Next steps (07.4 candidates)

* Learning layer on top of the explorer: study queue, “known / unknown” marks and
  an SRS schedule for grammar points.
* Force-directed layout + zoom/pan for the map once N2/N1 points land.
* Deep links for explorer filters (`?q=`, `?tag=`, `?register=` → URL sync) and
  shareable searches.
* Conjugation explorer (07.3 of the grammar track) attached to `grammar_patterns`.
