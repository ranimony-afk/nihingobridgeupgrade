# GATE A12 — MOBILE DICTIONARY API HARDENING, DETAIL CONTRACT & DEFERRED DECISIONS

**Verdict**: **PASS WITH CONDITIONS** (see §27, §28, §29)

---

## §1 Gate identity

| Property | Value |
| :--- | :--- |
| Gate | **A12 — Mobile Dictionary API Hardening, Detail Contract & Deferred Decisions** |
| Date | 2026-09-24 |
| Branch | `arena/01a0d21c-nihingobridgeupgrade` |
| Mode | PRESERVE-FIRST decision gate — read-only on history; one evidence-supported implementation |
| Predecessors | A9 (design decisions) · A10 (implementation-readiness freeze) · A11 (search implementation) · A11.5 (durability + handoff, `PASS WITH CONDITIONS`) |
| Authority | `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` §A10.1–§A10.18 (frozen) + `reports/gates/A11-TO-A12-HANDOFF.md` (authoritative A12 start document) |
| Deliverable | this report + the A12 contract section + the D-14 implementation and its tests |

**Operating rules honoured.** No reset/clean/checkout/cherry-pick/merge/rebase/amend/rewrite/discard;
no commit reconstruction; no overwriting of unrelated working-tree changes; no staging of unrelated
files; no push; no production contact; no Vercel/Supabase/env/deployment change; no corpus ingestion
(Tatoeba/KanjiVG/JMdict/KANJIDIC2); no Phase 14.4D/14.4E/14.5A/14.5B work; no redesign of the frozen
A11 search API; no web-API change; no schema/migration/index/SQL change.

**No rule conflict was encountered** — the brief's rules and the repository's standing rules were
consistent in every case that arose.

---

## §2 Gate 0 baseline

| Property | Value |
| :--- | :--- |
| HEAD | `cfe565d58ec4f6902c9f00bba491827ab303a53d` |
| `origin/main` | `cfe565d58ec4f6902c9f00bba491827ab303a53d` — distance **`0 0`** |
| Branch | `arena/01a0d21c-nihingobridgeupgrade` |
| Reflog | clone `13:33:25` + checkout `13:33:26` — **no session commits** |
| `git status --short` | **72 entries = 41 `??` + 31 ` M`**, 0 deleted |

Expected artifacts, all present:

| Artifact | Present |
| :--- | :--- |
| A12 handoff (`reports/gates/A11-TO-A12-HANDOFF.md`, 243 L) | **yes** |
| A11 durability manifest | **yes — as `reports/gates/A11.5-DURABILITY-MANIFEST.md`** (269 L); see §2.1 |
| Frozen A10 contract (`docs/api/MOBILE-DICTIONARY-API-CONTRACT.md`) | **yes** |
| A11 route + adapter (`src/app/api/v1/mobile/dictionary/search/{route,_lib}.ts`) | **yes** |
| A11 test files (DB-free 722 L + live 208 L) | **yes** |
| A11.5 transition report (`GATE-A11.5-DURABILITY-TRANSITION.md`, 524 L) | **yes** |

Read in full before implementation, as required: the contract, `src/types/mobileDictionary.ts`, both
A11 source files, both A11 test files, `tests/mobile-api-implementation-readiness.test.ts`, the A11
report, the A11.5 manifest, the A12 handoff and the A11.5 transition report.

### §2.1 The brief's manifest path — naming reconciliation, not a missing artifact

The brief lists `reports/gates/A11-DURABILITY-MANIFEST.md`. That path does not exist because gate
**A11.5 renamed the file** to `reports/gates/A11.5-DURABILITY-MANIFEST.md`, as its own brief required
(A11.5 §17/§22: the `A11.5-` prefix). The content is present, complete and hash-verified (§3). The
old path was deliberately **not** recreated: doing so would duplicate a manifest and diverge from the
A11.5 record. **Nothing is missing; no STOP condition was triggered.**

### §2.2 Working-tree inventory

72 entries = 41 `??` + 31 ` M`. Decomposed with `-uall`, the untracked files are: 21
`reports/gates/*` (including this report) + 15 `tests/*` + the contract in `docs/api/` + the two
`src/app/api/v1/mobile/dictionary/search/` files + `src/lib/japanese/kanjiText.ts` +
`docs/architecture/CI-DATA-CONTRACT.md`. No tracked file is deleted. Every path named in the A11.5
manifest still exists.

> **Inventory note (carried correction).** A11.5's close-out wrote the pre-A12 tree as
> `71 = 41 ?? + 31 M`; that split is arithmetically inconsistent (41+31 = 72). The correct split at
> that time was **40 `??` + 31 ` M` = 71** (the 41 *files* came from one collapsed directory holding
> two). Today A12 adds exactly one untracked file (this report), giving **41 `??` + 31 ` M` = 72**.
> The total is consistent in every measurement and no file was ever lost.

**The `M` count is tool-state dependent, and this was measured rather than assumed.** During the
fourth verification pass the count read **32 ` M`** instead of 31. The cause was identified, not
guessed: `next-env.d.ts` is a Next.js-managed file (its own header: *"This file should not be edited"*)
whose single import path is rewritten by whichever Next.js command ran last.

| Last command run | `next-env.d.ts` content | vs HEAD | `M` count |
| :--- | :--- | :--- | ---: |
| `npm run build` | `import "./.next/types/routes.d.ts"` | **matches** | **31** |
| `npx next dev` (verification server) | `import "./.next/dev/types/routes.d.ts"` | differs | 32 |

Running `npm run build` afterwards returned the file to its committed content and the tree to exactly
**72 = 41 `??` + 31 ` M`** — reproduced on demand. This file is therefore **never staged**, is not an
A12 change, and is not evidence of drift; the earlier `31`/`32` difference is a side effect of running
the mandatory verification commands, reported here so a future gate does not misread it.

---

## §3 A11 artifact hashes and content integrity

SHA-256 recalculated for every A11 implementation artifact and compared with the A11.5 manifest §2:

| Artifact | Lines | SHA-256 (16) at A11.5 | SHA-256 (16) at A12 entry | Classification |
| :--- | ---: | :--- | :--- | :--- |
| `src/app/api/v1/mobile/dictionary/search/route.ts` | 108 | `a9a06987bd9cf761` | `a9a06987bd9cf761` | **IDENTICAL** |
| `src/app/api/v1/mobile/dictionary/search/_lib.ts` | 94 | `582d725faf96404f` | `582d725faf96404f` | **IDENTICAL** |
| `tests/mobile-dictionary-search-api.test.ts` | 722 | `a84b39fe09412717` | `a84b39fe09412717` | **IDENTICAL** |
| `tests/mobile-dictionary-search-api-live.test.ts` | 208 | `029c4331ee90f433` | `029c4331ee90f433` | **IDENTICAL** |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` | 769 | `84da9e4a7dddc2c8` | `84da9e4a7dddc2c8` | **IDENTICAL** |
| `reports/gates/GATE-A11-MOBILE-DICTIONARY-SEARCH-API.md` | 773 | `c114d3d1fe1d79d0` | `c114d3d1fe1d79d0` | **IDENTICAL** |

Supporting artifacts also IDENTICAL: `src/types/mobileDictionary.ts` (`aece3af08cb9300d`),
`tests/mobile-api-implementation-readiness.test.ts` (`b842abaa92788a29`),
`tests/mobile-payload-design-freeze.test.ts` (`c682c4f3943cc469`),
`tests/mobile-dictionary-script-contract.test.ts` (`204336b3bf968f63`),
`tests/mobile-dictionary-payload-contract.test.ts` (`d0d4c0dd057e4747`).

**At A12 entry: IDENTICAL 6 · MODIFIED 0 · MISSING 0 · UNEXPECTED 0.** Nothing to repair, nothing
repaired.

**Re-verification after the A12 change set (latest pass).** Re-hashing every artifact the manifest
records (the 6 A11-owned plus the 5 supporting) gives **IDENTICAL 7 · MODIFIED 4 · MISSING 0 ·
UNEXPECTED 0**. The four modifications are exactly the authorized A12 change set — `route.ts`,
`_lib.ts`, the DB-free suite and the contract — each with a recorded before → after hash in §17.

They are **A12-created**, not pre-existing drift and not a silent restoration. Three independent
proofs:

1. **The contract is append-only.** The manifest's §6 anchors still sit at their original lines and
   still contain their frozen text: `MOBILE-CANONICAL: \`id\`, and only \`id\`` at **L425**,
   `1…200 at the boundary; applied 1…100` at **L372**, `RATE LIMIT:        none in v1` at **L572**.
   The A12 block begins at L773 and nothing before it moved.
2. **The A11 test groups still execute exactly 42 tests.** Per-group executed counts are
   `3 + 3 + 6 + 8 + 5 + 4 + 5 + 4 + 4 = 42` for the A11 groups and `6 + 2 + 1 + 2 + 2 = 13` for the
   five A12 groups = 55, with zero duplicate titles and zero skips.
3. **The frozen 9-field projection is intact** — `projectEntry` still maps exactly `id`, `headword`,
   `reading`, `romaji`, `primaryGlosses`, `jlptLevel`, `jlptStatus`, `isCommon`, `kanjiCharacters`.

No file was restored from memory, and no diff was resolved by rewriting history.

---

## §4 Git durability result

| Probe | Result |
| :--- | :--- |
| `bcc5384` (A12, previous turn) | *"Not a valid object name"* |
| `fa16e09`, `694c0e2` (A11) | *"Not a valid object name"* |
| `ff1f644` (A11.5) | *"Not a valid object name"* |

The `.git` directory is re-cloned at `cfe565d` each session while **file contents persist**. Thus:

- **Commit durability: NOT VERIFIED** — no historical commit from this project's session work is
  reachable in this clone.
- **Content durability: VERIFIED** — every artifact survives byte-identically (§3).
- No commit was reconstructed, and no hash was treated as meaningful. Durable identity is
  **path + content + SHA-256**.

---

## §5 Scope

**Four primary workstreams:** D-14 (query-length boundary) · D-13 (abuse-protection decision) ·
D-12 (deep-pagination evidence) · D-9 (entry-detail contract) — plus secondary audits D-4 … D-11.

**Outcome:** exactly **one** item was implemented (D-14). One was resolved as a *deployment gate*
(D-13 → OPTION B). Two were decided on measurement and evidence (D-12 DEFERRED, D-9 DEFERRED/BLOCKED).
The remaining seven were re-audited and left deferred with their producers re-traced. **No item was
implemented because it appeared in a list.**

Each decision below carries evidence → decision → implementation status → tests → explicit verdict.

---

## §6 D-12 evidence (deep-pagination performance)

### §6.1 Method

The seed corpus is 30 rows, which cannot exercise the frozen `offset` ceiling of 100 000 at all. A
scale fixture was therefore inserted into the **disposable** PGlite instance (100 000 synthetic rows in
964 ms; 100 030 total). The **real** `DictionaryService.searchEntries` (the same call the route makes,
`limit` 50) was driven at offsets 0 / 100 / 1 000 / 10 000 / 50 000 / 100 000 across query classes;
the `count` and `rows` queries were timed separately; the plan was read with `EXPLAIN (ANALYZE,
BUFFERS)`. **All figures are local, disposable, synthetic-fixture measurements — never production
performance.**

### §6.2 Per-class results (limit 50)

| class | 0 | 100 | 1 000 | 10 000 | 50 000 | 100 000 | total |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| broad latin (`a`) | 992 ms | 1 024 | 1 044 | 1 107 | 1 124 | 1 164 | 100 029 |
| narrow, no match (`zzqq`) | 749 ms | 772 | 766 | 758 | 805 | 751 | 0 |
| Japanese kanji (`水`) | 822 ms | 812 | 791 | 783 | 912 | 1 025 | 20 001 |

A kana/kanji query class was measured separately for the length cap (§12.2: `水`×1000 → 15.7 s, the
length effect dominating any offset effect). At offset 100 000 the kanji class returned **0 rows as
200 with `total = 20 001`** — the frozen empty-page behaviour holds at the deep boundary.

### §6.3 Component attribution — why wall clocks are flat

| offset | `count` query | `rows` query |
| ---: | ---: | ---: |
| 0 | 235 ms | 260 ms |
| 10 000 | 295 ms | 266 ms |
| 100 000 | 241 ms | 303 ms |

The PGlite/WASM driver contributes a large fixed overhead (~750 ms floor), which masks offset effects
in end-to-end timings; the component split, the plan and the JS-side behaviour below show the truth.

### §6.4 Query plan at offset 100 000

```text
Limit  (cost=19756.23..19756.23 rows=1 width=325) (actual time=410.530..410.583 rows=29.00 loops=1)
  Buffers: shared hit=2850, temp read=2528 written=2534
  ->  Sort  (cost=19592.35..19756.23 rows=65550 width=325) (actual time=327.617..390.675 rows=100029.00)
        Sort Key: frequency_rank, is_common DESC, id
        Sort Method: external merge  Disk: 20224kB
        ->  Seq Scan on dictionary_entries  (actual time=0.082..264.083 rows=100029.00)
              Filter: ((headword ~~* '%a%') OR (reading ~~* '%a%') OR (romaji ~~* '%a%') OR (senses::text ~~* '%a%'))
              Rows Removed by Filter: 1
Planning Time: 0.168 ms      Execution Time: 413.150 ms
```

### §6.5 The four behavioural questions the brief asks

| Question | Answer (measured / read from the implementation) |
| :--- | :--- |
| Does the service filter **after** the database limit? | **Yes, partially.** SQL applies `LIMIT`/`OFFSET`, then `searchEntries` re-sorts the returned page in JavaScript to float exact headword/reading/romaji matches first (`dictionaryService.ts`, the `entries.sort(...)` block). It re-orders **at most one page** (≤100 rows) — it does not filter rows out, so pagination cardinality is unaffected. |
| Does deduplication occur? | **No.** No `DISTINCT`, no `Set`-based dedup, no column on which duplicates could arise: `id` is the primary key and the query is a single-table scan with no joins. `LIMIT 50 OFFSET n` returns exactly 50 rows while `n + 50 ≤ total`. |
| Does the publication overlay change cardinality? | **No — it is 1:1.** `resolveLearnerEntries` → `resolveDictionaryEntries` maps `canonicalRows.map(...)` one output per input row (overrides *replace the displayed representation* of a row; orphan/duplicate overrides produce diagnostics, not extra or dropped rows). A failed overlay degrades to canonical rows. |
| Is degradation linear or otherwise significant? | **Offset-insensitive.** The rows query costs 260 ms at offset 0 and 303 ms at offset 100 000. Cost is dominated by a full sequential scan plus an external merge sort of the entire match set (20 MB spilled to disk for 100 029 matches) — work that is nearly independent of the offset and is repeated on every page. |

---

## §7 D-12 decision

**Verdict: DEFERRED** (measurement does not justify a redesign).

| Observation | Consequence |
| :--- | :--- |
| `ILIKE '%…%'` has a leading wildcard → always a **full seq scan** | A btree index cannot serve this predicate; adding one would be unmeasured theatre and is forbidden for performance assumptions alone (§19) |
| The **whole match set** is sorted, spilling 20 MB to disk, before `LIMIT/OFFSET` | A keyset/cursor API would **not** remove the sort: the ordering keys are not selective, so a cursor still leaves ~the same rows to sort |
| Cost is **offset-insensitive** (260–303 ms across the full range) | Deep offsets are not the pathological case; *per-request* cost is |
| Every page costs about the same, and the same scan+sort repeats per page | The real levers are caching/abuse protection (D-13) or a different match strategy — a **design** change, not a boundary tweak |

No cursor, no index, no SQL change was introduced. The measurement is recorded so a future gate starts
from "the scan and the sort are the cost, offsets are not" instead of repeating the experiment.
Because the cost is acceptable-but-unmeasured-in-production, D-12 is additionally carried as a
**condition** (§27: production monitoring), not as PASS.

---

## §8 D-13 evidence (abuse protection)

| Probe | Evidence |
| :--- | :--- |
| Deployment architecture | No `vercel.json`, no `.vercel/`, no `netlify.toml`, `fly.toml`, `Dockerfile`, `railway.json` or `render.yaml`. The only deployment-shaped artifact is `.github/workflows/ci.yml` (CI, not runtime) |
| Middleware | `middleware.ts` and `src/middleware.ts` **absent** — there is no request-interception layer at all |
| Rate-limit / KV / cache utilities | **None.** No `rateLimit`/limiter module in `src`; the only `rateLimit` symbols are the AI provider's *error taxonomy* (`provider.ts` `rateLimited()`, `anthropic.ts` mapping HTTP 429, `mock.ts` scenarios) |
| Dependencies | **24 total** (deps + devDeps). Zero packages matching rate/limit/upstash/redis/ioredis/kv/cache/arcjet/throttle |
| Authentication infrastructure | `src/lib/auth/*` actor/permission/role boundary (+ Supabase client libraries `@supabase/ssr`, `@supabase/supabase-js`), used by **CMS write paths only** (`cmsService`, `src/app/api/cms/_shared.ts`) |
| Public API conventions | Dictionary/kanji/search routes are unguarded and read-only by design; no public route throttles |
| Existing provider configured? | **No.** No rate-limit provider, no credentials, no configuration |
| Can it be implemented without new infrastructure / credentials / paid services / schema / unrelated changes? | **No** — a correct limiter needs shared state (a new external dependency or paid service) plus thresholds and failure behaviour that are product/ops decisions, and possibly middleware and deployment configuration |

---

## §9 D-13 decision

**Verdict: DEFERRED — OPTION B (DEPLOYMENT GATE).**

| Option | Assessment |
| :--- | :--- |
| **A — implementable now** | **Rejected.** Nothing suitable exists in the repository (§8). The only A12-scope option would be a per-instance in-memory counter — which on any multi-instance/serverless deployment throttles nothing real. A12 is forbidden to add fake or in-memory protection and label it production-safe, and must never claim a development-only mechanism is production protection |
| **B — deployment gate** | **Chosen.** The condition is specific: no shared, spoof-resistant throttle exists; `middleware.ts` does not exist; provider, thresholds and failure behaviour are undecided. Owner: deployment/ops with security review. Blocking stage: **production exposure** |
| **C — deferred without recording** | **Rejected.** D-13 is the single item whose absence makes production exposure unsafe; it must remain visible as a gate rather than fade into a backlog |

**Explicit distinction recorded:**

```text
implemented          D-14 q length cap (bounds one request)   — NOT abuse protection
production-approved  nothing. The endpoint is NOT approved for production exposure.
```

The endpoint remains **public read-only without authentication or throttling**, exactly as A11
recorded, and A12 adds no protection beyond the length cap.

---

## §10 D-14 decision

**Verdict: IMPLEMENTED.**

| Property | Frozen value |
| :--- | :--- |
| Maximum `q` length | **1000 UTF-16 code units** (`String#length`) |
| Measured on | the **sanitized** value (NUL-strip + trim), after the emptiness check |
| Over-limit behaviour | **400, rejected — never truncated**; the service is never called |
| Error code / status | `VALIDATION_ERROR` / **400** |
| Message | `Query parameter 'q' must be at most 1000 characters` |
| Envelope | unchanged `{ "success": false, "error": { "code", "message" } }` |
| Boundaries | exactly 1000 → **200**; 1001 → **400**; empty/blank/NUL-only → `MISSING_QUERY` (unchanged) |
| Internal details exposed | **none** — a fixed sentence, no length of the received input, no SQL, no stack |

**Order of operations (documented and tested):**

```text
raw q → sanitizeSearchQuery(NUL-strip + trim) → empty? → 400 MISSING_QUERY
                                             → length > 1000? → 400 VALIDATION_ERROR
                                             → detectSearchScript → service (ILIKE)
```

Sanitation runs **before** length validation so that both judgements describe the same string the
service would receive: padding can neither smuggle content past the cap nor reject a legitimate query.

**Why a cap exists — measured.** Search cost is linear in the escaped pattern length, because
`ILIKE '%' || escapeLikePattern(q) || '%'` is attempted at every scanned row:

| `q` | length | measured | matches |
| :--- | ---: | ---: | ---: |
| `a` | 1 | 1 001 ms | 100 029 |
| `a`×100 | 100 | 1 557 ms | 0 |
| `a`×1000 | 1 000 | **8 863 ms** | 0 |
| `a`×1001 | 1 001 | 9 958 ms | 0 |
| `a`×10000 | 10 000 | **83 730 ms** | 0 |
| `%`×1000 | 1 000 | **16 886 ms** | 0 |
| `_`×1000 | 1 000 | **16 895 ms** | 0 |
| `水`×1000 | 1 000 | 15 691 ms | 0 |

With D-13 unresolved, an unbounded `q` lets one unauthenticated request buy ~9 s of CPU at the cap and
~84 s at 10 000 characters.

**Why 1000 — an existing convention, not an invented number.** `src/app/api/ai/answer/route.ts` holds
`const MAX_QUERY_LENGTH = 1000` and rejects overlong input with `VALIDATION_ERROR`/400. The value is
**mirrored, not imported** (that constant is unexported and the AI route is not a dependency of the
mobile boundary). No new validation framework was created; there is no Zod or schema-validation layer
in `src/app/api`.

**Not silently truncated.** The over-limit branch returns before the service call, so the service can
never receive a shortened query that the client did not ask for.

**Wildcard safety (audited, since it is the obvious attack on such a predicate).**
`escapeLikePattern` **is** applied on the search path (`dictionaryService.ts:66`). Verified through the
real service: `q="%"` → **0 matches** (unescaped, it would have matched all 100 030 rows); `q="_"` → 0;
`mizu%` → 0; `mi_u` → 0; control `q="n"` → 25 030. An earlier A12 *working note* claimed wildcards were
not sanitized; measurement disproved it, and both the code comment and this report were corrected
before any commit.

**Residual cost is not claimed away.** At the cap the query still costs 8.9–16.9 s locally. The cap
bounds one request's work; it does not make abuse protection exist.

---

## §11 D-9 field matrix

Traced from real producers — never from memory. Every declared mobile shape was audited, including the
**unimplemented** `MobileDictionaryDetailResponse` and `MobileSwipeSection*` family in
`src/types/mobileDictionary.ts`, which has no route, service method, test or code path emitting it.

| Field | Producer | Authorized now | Detail v1 | Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `dictionary_entries.id` | yes | yes | IN SEARCH DTO (verbatim, §13) |
| `headword` / `reading` / `romaji` | columns | yes | yes | IN SEARCH DTO |
| `primaryGlosses` | `senses[].glosses[]` flattened | yes | yes | IN SEARCH DTO |
| `jlptLevel` + `jlptStatus` | column + `classifyJlptLevel` | yes | yes | IN SEARCH DTO |
| `isCommon` | column | yes | yes | IN SEARCH DTO |
| `kanjiCharacters` | column | yes | yes | IN SEARCH DTO |
| `partsOfSpeech` | `parts_of_speech` | verify | decision | DETAIL CANDIDATE — available but not exposed; also a D-10 filter question |
| `tags` | `tags` | verify | decision | internal classification → NEVER EXPOSE without a taxonomy decision |
| `frequencyRank` | `frequency_rank` | verify | decision | metric with no learner-facing contract (A4: never influences relevance) → NEVER EXPOSE as v1 |
| `sourceRef` | `source_ref` | **no** | no | NEVER EXPOSE — raw provenance string (D-5) |
| `source` (row) | `knowledge_sources` | **no** | no | raw row: `url`, `license`, `imported_at`, `record_count` → NEVER EXPOSE |
| `provenance.sourceId` | `knowledge_sources.id` | **no** | no | **internal source identifier** → NEVER EXPOSE (declared shape does this — §12) |
| `kanji[]` | `kanji_entries` | verify | decision | raw rows carry `source_ref`, `vocabulary`; curated subset only after a decision |
| `kanji[].{meaning, readingsKun, readingsOn, strokeCount, gradeLevel, mnemonic}` | `kanji_entries` | verify | decision | DETAIL CANDIDATE; `mnemonic` provenance unresolved |
| `sentences[]` | `example_sentences` | verify | decision | raw rows carry `source_ref`, `dictionary_entry_ids`; curated projection needed |
| `sentences[].{japanese, reading, english, jlptLevel}` | `example_sentences` | verify | decision | DETAIL CANDIDATE |
| `grammar[]` | `grammar_patterns` | verify | decision | DETAIL CANDIDATE (`slug`, `title`, `structure`, `meaning` only) |
| `conjugations` | **none** | — | no | **NO PRODUCER** — types only |
| `synonyms` / `antonyms` | **types only** (`SynonymRelation`, `AntonymRelation` interfaces; no table, no service) | — | no | **NO PRODUCER** — requires future ingestion/design |
| `phrases` / `collocations` | **none** for dictionary entries (only JLPT quiz seed tags) | — | no | **NO PRODUCER** |
| `alternativeHeadwords` / `alternativeReadings` | computed in the JMDICT ETL transformer but **not persisted** (no columns) | — | no | requires schema → DEFER |
| `keigo` | `kanjiLexicalGraphService.getKeigoRelations` | verify | defer | producer exists; semantics + per-item cost undecided (D-7) |
| `kanjiEdges` | `getVocabularyKanji` | verify | decision | DETAIL CANDIDATE (derived, graph layer) |
| `userState` (`isBookmarked`, `userLists`, `hasPersonalNote`, `srsStatus`) | **none** (requires auth + user state) | — | no | **NO PRODUCER** — and out of A12 scope |
| `hasAudio` / `audioUrl` | **none** for dictionary entries | — | no | **NO PRODUCER** (D-8) |
| `localizedGlosses` | **none** (no read path) | — | no | **NO PRODUCER** (D-6) |

Conclusion: **the detail DTO cannot be frozen from existing evidence.** Four of its natural fields have
no producer at all; several others need a curated projection plus the D-5 provenance display form; and
the declared shape would expose an internal source identifier.

---

## §12 D-9 decision

**Verdict: DEFERRED — BLOCKED** (blocked by D-5, and by the absence of a frozen detail contract).

| Reason | Evidence |
| :--- | :--- |
| The frozen contract defers the detail *payload* and requires its own field-set decision | §A10.7 |
| The authoritative handoff binds A12 to **freeze its own detail contract before implementing** (decide → freeze → implement) | `A11-TO-A12-HANDOFF.md` §5 |
| Blocked by D-5 (resolved provenance display form), still unimplemented | handoff §4 table |
| The only producer returns raw rows of four adjacent tables, which the never-expose rules forbid at the boundary | `getEntryDetail` → `{ entry, source, kanji, sentences, relatedGrammar }` |
| The two web detail routes return *different* payloads and both spread a canonical row inside `entry` | §A10.7; `src/app/api/dictionary/[id]/route.ts`, `.../entry/[id]/route.ts` |
| A declared detail shape exists but violates binding rules and has no producer | §11, §12.1 |

### §12.1 The `MobileDictionaryDetailResponse` trap (recorded)

`src/types/mobileDictionary.ts` declares a detail response containing: `provenance.sourceId` (internal
identifier), `userState` (auth-dependent), `conjugations`, `synonyms`, `antonyms`, `phrases`,
`collocations` (no producers), `alternativeHeadwords`/`alternativeReadings` (not persisted),
`keigo` (D-7 undecided) and sentences carrying `sourceRef` (never-expose). **Had A12 built the detail
endpoint "from the declared types", it would have shipped forbidden fields and invented data.** The
type is a design sketch, not a contract.

**No detail route, no detail DTO and no third detail shape were created.** The field matrix (§11) and
the contract's §A12.6 are the deliverables, and they are what a future detail gate must start from.

### §12.2 Detail-endpoint design preconditions (brief §9) — recorded, deliberately **NOT DESIGNED**

The brief permits endpoint design **only after the DTO is frozen**. The DTO is not frozen (§11), so
each design question is recorded as an open precondition rather than answered — answering them now
would be the design decision this gate is not authorized to make.

| Design question (brief §9) | Status | Note |
| :--- | :--- | :--- |
| HTTP method | **NOT DETERMINED** | A11's GET-only precedent is the natural direction, but it must follow a frozen DTO, not lead it |
| Path | **NOT DETERMINED** | must not collide with or mirror the two existing web detail routes |
| Identifier parameter | **NOT DETERMINED** | the two web routes disagree: one accepts the canonical id only, the other accepts id **or** headword — that divergence must be resolved, not copied |
| Not-found behaviour | **NOT DETERMINED** | `NOT_FOUND` is in the frozen error vocabulary but is explicitly scoped to detail and was never frozen for a v1 detail endpoint |
| Malformed-identifier behaviour | **NOT DETERMINED** | the web routes differ (`MISSING_ID` 400 vs headword fallback); a mobile decision is required |
| Success envelope | **CONSTRAINED, NOT FROZEN** | the repository-wide `{success,data}` envelope would apply; no detail payload exists to put in it |
| Error envelope | **CONSTRAINED, NOT FROZEN** | the frozen `{success:false,error:{code,message}}` shape plus the safe-500 rule from A11 would apply |
| Cache behaviour | **NOT DETERMINED** | A11 uses `dynamic = "force-dynamic"`; whether detail follows is undecided |
| Service reuse | **CONSTRAINED** | must reuse `DictionaryService.getEntryDetail` (no second read engine), but its raw-row return value requires a projection layer that does not exist yet |

None of these were implemented, and none were invented to make the section look complete.

**The absence of a detail route is itself pinned by an existing test**, so D-9 cannot be reversed by
accident: the A11 test `implements the frozen path exactly once` walks `src/app/api/v1` for every
`route.ts` and asserts the inventory equals exactly
`["src/app/api/v1/mobile/dictionary/search/route.ts"]`. Adding a detail endpoint under this prefix
without a contract update therefore fails a test that already exists — the same guard pattern the
D-13 deferral uses.

---

## §13 D-4 decision

**Verdict: KEEP VERBATIM ID (DEFERRED as a change).**

| Evidence | Finding |
| :--- | :--- |
| `dictionaryEntries.id` | `text` primary key, exposed publicly today |
| ID format | `de-jmdict-${entSeq}` (`src/etl/dictionary/transformer.ts:263`, documented in `src/etl/dictionary/types.ts:147`) — i.e. the ETL's deterministic identifier is *derived from* the upstream JMDICT sequence number |
| `ent_seq` as a column | **does not exist** in the schema (12 columns, none named `ent_seq`); nothing named `ent_seq` is emitted anywhere |
| External consumers | the web detail routes accept the canonical id (`de-jmdict-…`) **or** a headword; `src/services/knowledge/kanjiLexicalGraphService.ts` references concrete ids (`de-jmdict-1158520`, …); `src/types/lexicalGraph.ts` documents the format |
| Public documentation | the frozen A10 contract freezes `id` verbatim (§A10.5); `MobileDictionaryEntryCard` documents `de-jmdict-1358280` |
| Opaque-id convention | none in the repository; no alias table; 4 migrations, no id-rewriting migration |

**Decision: keep the identifier verbatim.** It is already the repository's stable public identifier,
the mobile API is read-only, and no boundary requirement exists that an opaque identifier would
satisfy. Renaming it would break the web surface and every internal graph reference for theoretical
purity. **No alias table, no migration, no hashing.** Recorded nuance: the identifier *embeds* the
upstream sequence number, but it is not itself a raw upstream field and `ent_seq` is never exposed as
a field; if a future gate wants to hide even that, it needs its own schema decision (D-4 stays open as
a change, not as a defect).

---

## §14 D-5 decision

**Verdict: DEFERRED.**

Traced provenance model: each canonical row carries `source_ref` (e.g. `upstream:jmdict:…`), and
`knowledge_sources` holds `id, name, version, license, url, description, domain, record_count,
imported_at`. A4/A9-era rules forbid exposing the raw reference string or internal source identifiers
before a *resolved display form* exists. A12 did not design one; it recorded the constraint and
verified that **no provenance field of any kind reaches the mobile payload** (§22, and asserted by
test: the response contains no `sourceRef`, `source`, `provenance` or `sourceId` even though the mock
row's `sourceRef` is a realistic `upstream:jmdict:2023-08`). D-5 remains the named blocker for D-9.

---

## §15 D-6 decision

**Verdict: DEFERRED — `targetLanguage` KEEP INERT.**

No authorized read path for localized glosses exists: nothing in `src/app/api` reads translation
storage for glosses; the 13.5C rule keeps the translation storage primitive off API routes. No query
was issued against translation tables, no translation was inferred, no AI provider was called, no new
translation system was introduced, and `primaryGlosses` was not altered. The parameter remains
validated against `SUPPORTED_LANGUAGES` (`en|ta|ml`) and inert — proven over HTTP: `targetLanguage=ta`
returns a response **byte-identical** to the same request without it.

---

## §16 D-7 / D-8 / D-10 / D-11 statuses

| # | Item | Evidence | Verdict |
| :-: | :--- | :--- | :--- |
| D-7 | Keigo item fields (`isKeigo`, `keigoType`) | Producer exists (`getKeigoRelations(entryId)` → `KeigoRelation[]`) but is graph-layer and derived, not per-entry attestation; semantics and per-item cost are undecided; the search item declares neither field | **DEFERRED** |
| D-8 | Audio (`hasAudio`, `audioUrl`) | No dictionary-entry audio producer. `audioUrl` exists only on the JLPT questions surface (`src/app/api/questions/route.ts`) — a different resource family. No audio was generated and no external audio was ingested | **DEFERRED** |
| D-10 | Richer filters (`partsOfSpeech`, `hasKanji`, `hasExamples`, `register`) | The service's complete filter surface is `DictionarySearchOptions = { query, jlptLevel, isCommon, limit, offset }`. No producer exists for the other predicates; adding them would introduce **new SQL semantics** | **DEFERRED** (nothing exposed) |
| D-11 | `warnings` / offline / degraded / stale / fallback | No producer. Failures remain HTTP status + the fixed error envelope; offline remains client-owned. No warning was fabricated | **DEFERRED** |

### §16.1 D-10 filter inventory (brief §15 taxonomy)

| Filter | Classification | Evidence |
| :--- | :--- | :--- |
| `query` | **already implemented** (and exposed) | `DictionarySearchOptions.query` → ILIKE across headword/reading/romaji/senses |
| `jlptLevel` (`level` / legacy `jlpt`) | **already implemented** (and exposed) | `DictionarySearchOptions.jlptLevel` → `eq(jlptLevel)` |
| `isCommon` (`common`) | **already implemented** (and exposed) | `DictionarySearchOptions.isCommon` → `eq(isCommon)` |
| `limit` / `offset` | **already implemented** (and exposed) | clamp + applied-value echo (§A10.4) |
| `partsOfSpeech` | **not implemented** | no predicate in the service; `parts_of_speech` is returned but never filtered |
| `hasKanji` | **not implemented** | no predicate; derivable only by scanning `kanji_characters` |
| `hasExamples` | **not implemented** | would require joining `example_sentences` — new SQL semantics |
| `register` | **not implemented** | no register column or predicate exists |

**"Available but not exposed": none.** Every filter the canonical service already implements is
already exposed by the mobile contract; every richer filter the brief names would require **new SQL
semantics**, which this gate is forbidden to introduce. That is why D-10 is deferred rather than
partially implemented.

---

## §17 Implementation inventory

| Path | Change | Class | SHA-256 (16) | Lines |
| :--- | :--- | :--- | :--- | ---: |
| `src/app/api/v1/mobile/dictionary/search/_lib.ts` | `MAX_QUERY_LENGTH = 1000`, `isQueryLengthValid`, docblocks | A12 IMPLEMENTATION | `582d725faf96404f` → `b8a575399b8f9986` | 94 → 130 |
| `src/app/api/v1/mobile/dictionary/search/route.ts` | cap enforcement + docblock corrections (§17.1) | A12 IMPLEMENTATION | `a9a06987bd9cf761` → `5523860e48c88329` | 108 → 125 |
| `tests/mobile-dictionary-search-api.test.ts` | 42 → 55 tests (caps + decision guards) | A12 TESTS | `a84b39fe09412717` → `309bebdba659efd0` | 722 → 964 |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` | appended `# A12 …` §A12.1–§A12.6 | A12 CONTRACT | `84da9e4a7dddc2c8` → `037eccda5e471b71` | 769 → 914 |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-HARDENING.md` | this report | A12 EVIDENCE | `sha256-16` recorded in the gate's final output | — |
| `tests/mobile-dictionary-search-api-live.test.ts` | unchanged | A11 FROZEN | `029c4331ee90f433` | 208 |
| `reports/gates/GATE-A11-MOBILE-DICTIONARY-SEARCH-API.md` | unchanged | A11 FROZEN | `c114d3d1fe1d79d0` | 773 |

**No other file was created or modified by A12.** No detail route, no helper for one, no new service
method, no schema change, no migration, no middleware.

### §17.1 Documentation corrections inside the changed files (no behaviour change)

1. The A11 route docblock said *"A10 deferred authentication (D-13) and rate limiting (D-14)"* — the
   numbers were swapped against the handoff's own table (D-13 = rate limiting, D-14 = `q` cap). Now
   named correctly.
2. The same docblock said `q` has *"no maximum length in v1"* → superseded by §A12.1.
3. `_lib.ts` said *"Two boundaries live here"* → now three.
4. An A12 working note claimed wildcards bypass sanitation; measurement disproved it (§10). The claim
   never reached a commit.

Contract correction: §A12.2 names every superseded statement **by location** (`§A10.4` line 371;
§A11.8 lines 767–769; §A11.7's test count) instead of rewriting it — the A10/A11 text is byte-preserved.

---

## §18 Test inventory

### §18.1 Added by A12 (13 new tests, all DB-free)

| Group | Tests | What they pin |
| :--- | ---: | :--- |
| D-14 cap (`A12 §D-14 …`) | 6 | cap value frozen at 1000; 1000 accepted; 1001 rejected with `VALIDATION_ERROR` and no service call; sanitize-then-measure (NUL padding); wildcard-laden over-limit rejected; code-unit semantics (`𠮷`×500 in, ×501 out) |
| D-9 summary-not-detail (`A12 §D-9 …`) | 2 | no detail-only field (`alternativeHeadwords` … `userState`, `provenance`, `sourceId`, `sourceRef`) appears in any item; the serialized response does not contain the row's realistic `sourceRef` string |
| D-4 id semantics | 1 | the canonical id is echoed **verbatim** for several id shapes; no `ent_seq` key |
| D-13 (`A12 §D-13 …`) | 2 | 25 consecutive identical requests are never throttled (**documents the absence** of a limiter); the route source imports no rate-limit/middleware/provider mechanism |
| D-12 / recording | 2 | the contract records the A12 decisions; the pagination surface stays offset-based with no cursor and exactly 8 `data` keys |

### §18.2 Suites

| Suite | Tests | Layer |
| :--- | ---: | :--- |
| `tests/mobile-dictionary-search-api.test.ts` | **55** | contract + adapter, DB-free (mocked service) |
| `tests/mobile-dictionary-search-api-live.test.ts` | **7** | live route over the seeded corpus in a disposable DB |
| Targeted mobile/kanji run | 173 → **180** passing | A11 + A10 + A9 contract suites, readiness, kanji experience routes |

### §18.3 Honest limitations of the test layer

- The D-13 "no throttling" test **documents an absence**; it is not a protection test and must never
  be read as one.
- The ten-thousand-character timing measurements are reported in §10/§6 from probe scripts that were
  **deleted** after measurement; they are not part of the suite (they would add ~2.5 minutes of runtime
  for a documented decision).
- Detail-endpoint tests (malformed identifier, missing entry, success envelope, error envelope) are
  **not applicable**: no detail endpoint exists (D-9 deferred). They are listed here so their absence
  is a recorded decision, not an oversight.

---

## §19 Regression comparison

| Metric | A11 baseline (recorded, reproduced at A12 entry) | Final (after A12) | Delta |
| :--- | :--- | :--- | :--- |
| Files | 56 | **56** | 0 |
| Passed | 1124 | **1137** | **+13** |
| Failed | 0 | **0** | 0 |
| Skipped | 55 | **55** | 0 |
| Total | 1179 | **1192** | **+13** |

**NEW FAILURES: 0. NEW SKIPS: 0.** The +13 is fully attributed: 6 D-14 tests + 7 decision-guard tests,
all inside `tests/mobile-dictionary-search-api.test.ts` (42 → 55). No suite was added, removed,
renamed, weakened or skipped; no assertion was lowered.

**A6 skip set — identical** (9 files / 55 skips), compared against the recorded baseline set:
`corpus-preflight` 1 · `dictionary-architecture-corpus` 1 · `dry-run-jmdict` 1 ·
`full-jmdict-ingestion` 7 · `kanji-lexical-graph` 11 · `kanjidic2-canonical-ingestion` 11 ·
`kanjidic2-etl-foundation` 4 · `kanjivg-etl` 7 · `pilot-jmdict-db` 12.

**Re-verified on the fourth issuance of this brief, against byte-identical artifacts:** the totals
(`56/1137/0/55/1192`), the partition (`1082 = 1124 − 42`), the A6 skip set, the live suite (7/7) and
the full HTTP regression matrix all reproduce exactly. Three consecutive passes over unchanged bytes
have produced identical numbers, which is the strongest available evidence that the A12 delta is
fully accounted for.

> **Baseline handling — how the brief's §3 "STOP if baseline differs" rule was discharged.**
> The A11 baseline (`56/1124/0/55/1179`) describes a tree *before* the authorized A12 change set. Once
> A12's tests exist, a direct re-run can only produce the post-A12 totals, and reverting the tree to
> re-observe the old number is exactly the discard operation the operating rules forbid. The rule was
> therefore satisfied by a **partition proof** instead of by reverting:
>
> | Partition | Tests | Passed | Failed | Skipped |
> | :--- | ---: | ---: | ---: | ---: |
> | The one file A12 modified (`mobile-dictionary-search-api.test.ts`) | 55 | 55 | 0 | 0 |
> | The other **55 files** | 1137 | **1082** | **0** | **55** |
> | Required for baseline parity: `1124 − 42` | — | **1082** | — | — |
>
> The 55 untouched files contribute **exactly the baseline's non-A11-suite total**, so no other suite
> changed behaviour by even one test; and the modified file's A11 groups still execute **exactly 42**
> tests (`3+3+6+8+5+4+5+4+4`) with the five A12 groups adding exactly 13. Every artifact other than
> the authorized four is byte-identical by SHA-256 (§3), which closes the partition. **Difference
> explained, not reinterpreted; no STOP condition was triggered.**
>
> Measurement note carried from the earlier pass: the pre-A12 baseline was measured on this tree
> earlier in the session (its JSON artefact under `/tmp` does not survive the session boundary), and
> the skip-set list below is the one recorded with it. The arithmetic closes exactly and the
> partition above is measured now, in this pass.

---

## §20 Static audit

Every mandated term, counted over the four A11/A12 implementation and test files, each hit classified:

| Term | route.ts | _lib.ts | test (DB-free) | live test | Classification of every hit |
| :--- | ---: | ---: | ---: | ---: | :--- |
| `queryEcho` | 0 | 0 | 1 | 0 | test assertion that it is **absent** from the response |
| `matchType` | 0 | 0 | 0 | 0 | **zero** — no re-entry |
| `jlptKnown` | 0 | 0 | 1 | 0 | test assertion that the item has no `jlptKnown` (tri-state instead) |
| `returned` | 1 | 0 | 3 | 1 | docblock retirement list (route) + test prose/comments |
| `page` | 1 | 0 | 5 | 4 | docblock retirement list + `?page=` **inputs** in the ignored-parameter tests |
| `apiVersion` | 1 | 0 | 1 | 0 | docblock retirement list + test assertion of absence |
| `meta` | 1 | 0 | 1 | 0 | same |
| `warnings` | 1 | 0 | 1 | 0 | same |
| `results` | 0 | 0 | 1 | 0 | absent from implementation; one test/prose mention |
| `totalResults` | 0 | 0 | 1 | 0 | forbidden-keys assertion list |
| `executionTimeMs` | 0 | 0 | 1 | 0 | forbidden-keys assertion list |
| `ent_seq` | 0 | 0 | 2 | 0 | forbidden-keys list + D-4 assertion; never emitted |
| `sourceRef` | 1 | 1 | 4 | 2 | docblocks (never-expose) + mock **input** row + forbidden-keys list |
| `...row` | 0 | 1 | 1 | 0 | docblock forbidding it + the test that proves the 9-key projection |
| `error.message` | 1 | 0 | 0 | 1 | docblock explaining why the web route's echo is **not** copied |

**No stale term is an active field.** Zero hits in emitted code paths; every occurrence is either a
docblock that retires/forbids the term or a test that asserts its absence (or supplies it as an input
precisely to prove it is ignored). Emitted client-visible error codes are exactly `MISSING_QUERY`,
`VALIDATION_ERROR` and `INTERNAL_ERROR`; the client-visible strings are fixed literals.

---

## §21 Web API isolation

| Check | Evidence |
| :--- | :--- |
| Files changed | `git status` shows **no modification** under `src/app/api/dictionary`, `src/lib/api` or `src/services/dictionary` attributable to A12 |
| Shared helpers | `parseLimit` / `parseOffset` / `parseBooleanFlag` / `errorBody` reused **unchanged**; `MAX_PAGE_LIMIT`, `DEFAULT_PAGE_LIMIT`, `MAX_OFFSET` untouched; default `limit` parity holds (both routes share `parseLimit`) |
| Shared service | `DictionaryService.searchEntries` byte-identical to A11 entry (no file in `src/services/dictionary` modified at all) |
| Live behaviour | the web route still answers `200` with its own shape — envelope `{success,data}`, data keys `appliedJlptLevel, detectedScript, entries, limit, offset, query, total`, and items that legitimately carry `frequencyRank`, `partsOfSpeech`, `senses`, `sourceRef`, `tags` |
| CMS routes | untouched (no A12 edit anywhere in `src/app/api/cms`) |
| Interpretation | the web surface's broader fields are **its own** contract; the mobile DTO's 9-field projection exists precisely because rows must not be spread. A12 changed neither |

No shared service needed modification, so no adapter-versus-shared-semantics conflict arose.

---

## §22 Schema / migration audit

| Check | Result |
| :--- | :--- |
| Migrations on disk | **4** (`0000_absurd_emma_frost`, `0001_multilingual_translations`, `0002_cms_content_lifecycle`, `0003_users_auth_identity`) — unchanged |
| `drizzle/` modified by A12 | **0 entries** |
| `src/db/schema.ts` | shows a pre-existing ` M` (Gate A2, comment-only, 11 insertions / 1 deletion) with **0 A12-related lines** — verified by grepping that diff for A12 terms |
| Indexes added | **none** — D-12 was measured *before* any index was considered, and the measurement showed an index cannot serve a leading-wildcard `ILIKE` |
| Columns/tables/constraints changed | **none** |
| Existing data changed | **none** (writes were confined to a throwaway PGlite instance; the synthetic fixture was created there) |

**A12 changed no schema, no migration, no index and no SQL structure**, as the brief requires by
default.

---

## §23 Production-contact audit

| Check | Result |
| :--- | :--- |
| Production `DATABASE_URL` | never set or read; every DB command used the loopback PGlite URL explicitly |
| `.env` | **absent** (only the tracked `.env.example`); no `.env` access occurred |
| `.vercel` / deployment operation | **absent**; no CLI deployment, no Vercel/Supabase configuration touched |
| Supabase | only the pre-existing `@supabase/ssr` + `@supabase/supabase-js` libraries in `package.json`; no client instantiated, no write, no read |
| Deployment | none |
| Push | none |
| External corpus access | none — no Tatoeba/KanjiVG/JMdict/KANJIDIC2 download or ingestion; `data/tatoeba` untouched |
| Secrets printed | none |
| Runtime processes | one disposable PGlite (stopped at gate end) and one local `next dev` verification server (stopped); no stray processes left |

**A12 touched no production system.** Production approval remains a separate gate.

---

## §24 Conditions

1. **D-13 unresolved (deployment gate)** — owner: deployment/ops + security review; blocking stage:
   production exposure; evidence: no middleware, no limiter dependency, no provider, no thresholds
   (§8/§9). Until then the endpoint is **not approved for production exposure**.
2. **The `q` cap hardens but does not protect** — residual measured cost at the cap is 8.9–16.9 s; no
   rate limiting exists (§10).
3. **D-12 requires production monitoring before any performance claim** — all measurements are local,
   disposable and synthetic (§6). If a production-like environment shows the 100 000-offset range is
   operationally unacceptable, that gate reopens D-12 with its own measurement.
4. **D-9 remains blocked by D-5** and needs its own frozen detail contract before implementation
   (§11/§12).
5. **Commit durability NOT VERIFIED** — the git layer is ephemeral; durable identity is path +
   content + SHA-256 (§4).
6. **The declared `MobileDictionaryDetailResponse` must not be adopted as-is** — it would expose an
   internal source id and fields with no producer (§12.1).
7. **Pre-existing tree modifications are unattributed and preserved** — 31 ` M` files (including
   `schema.ts`, `search/types.ts`, `kanjiLexicalGraphService.ts`-adjacent work and the Phase 14.4D/14.5A
   reports) were never staged, reverted or attributed to A12 (§2.2).

---

## §25 Unresolved decisions

| Item | State | What would resolve it |
| :--- | :--- | :--- |
| D-4 opaque identifier | **open as a change** (verbatim id kept) | a demonstrated boundary/security requirement + a schema decision |
| D-5 provenance display form | **unresolved** | a design decision producing a public label/URL form without internal ids |
| D-6 localization | **blocked** | an authorized, provenance-labelled read path |
| D-7 keigo | **open** | field semantics + per-item graph cost decision |
| D-8 audio | **no producer** | an audio ingestion/authorization decision |
| D-9 detail DTO + endpoint | **BLOCKED** | D-5 + its own frozen detail contract |
| D-10 richer filters | **no producer** | stable semantics for new predicates |
| D-11 warnings/offline | **client-owned** | a real producer |
| D-12 deep pagination | **deferred pending production monitoring** | production-like measurement |
| D-13 abuse protection | **deployment gate** | provider + thresholds + middleware/deployment decision |
| `targetLanguage` inertness | **by design** (not externally observable while inert) | D-6 authorization |

`BLOCKED ≠ DEFERRED`: only D-9 is blocked, and its blocker is named.

---

## §26 A13 handoff

**State A12 leaves behind:**

```text
mobile search endpoint   GET /api/v1/mobile/dictionary/search — IMPLEMENTED, frozen, hard-boundaried
detail endpoint          NOT IMPLEMENTED — DTO unfrozen, blocked by D-5
rate limiting            NOT IMPLEMENTED — deployment gate
pagination               offset-based, unchanged, deep range DEFERRED pending production data
schema                   unchanged (4 migrations)
web API                  unchanged
```

**A13 may (if explicitly authorized):** resolve D-5 and thereby unblock D-9 by freezing a detail
contract; implement localization with provenance labelling; design abuse protection together with its
deployment configuration; re-measure D-12 against production-like data.

**A13 must not (without a new, explicit authorization):** redesign the frozen search surface; expose
`sourceRef`, `provenance.sourceId`, raw rows, `ent_seq`, `frequencyRank`, `tags` or any no-producer
field; introduce cursors, indexes, schema changes or new SQL semantics; add authentication or a fake
limiter; ingest corpora; begin Phase 14.4D/14.4E/14.5A/14.5B; push or deploy.

**First actions for A13:** re-verify A11/A12 content by SHA-256 (never by commit hash), re-read
`reports/gates/A11-TO-A12-HANDOFF.md` §5 before touching D-9, and treat §11's field matrix as the
starting point for a detail contract.

---

## §27 Final PASS/FAIL matrix (per decision)

| Decision | Implementation status | Tests | Verdict |
| :--- | :--- | :--- | :--- |
| **D-12** deep pagination | not implemented (measurement only) | 1 recorder test | **DEFERRED** (acceptable-with-monitoring; no redesign) |
| **D-13** abuse protection | not implemented (OPTION B) | 2 guard tests | **DEFERRED — DEPLOYMENT GATE** |
| **D-14** `q` length cap | **IMPLEMENTED** | 6 boundary tests | **PASS WITH CONDITIONS** (condition: D-13) |
| **D-9** detail DTO + endpoint | not implemented | field matrix; no endpoint tests (N/A) | **DEFERRED — BLOCKED** (by D-5) |
| **D-4** id policy | unchanged (KEEP VERBATIM) | 1 semantics test | **DEFERRED** (change not justified) |
| **D-5** provenance display | not implemented | leak assertions | **DEFERRED** |
| **D-6** localization | inert, unchanged | inertness tests | **DEFERRED** (KEEP INERT) |
| **D-7** keigo | not implemented | absence assertions | **DEFERRED** |
| **D-8** audio | not implemented | absence assertions | **DEFERRED** |
| **D-10** richer filters | not implemented | — | **DEFERRED** |
| **D-11** warnings/offline | not implemented | — | **DEFERRED** |

No decision is recorded as PASS that was not implemented, and no deferral is recorded as BLOCKED.

---

## §28 Final verdict

**PASS WITH CONDITIONS.**

The gate's mandatory criteria are all satisfied (§29): A11 survives byte-identical, D-12 was measured
rather than guessed, D-13 is formally deployment-gated, D-14 is bounded and tested, D-9 is
evidence-backed and deferred with a producer-traced field matrix, no raw row or internal field is
exposed, no stale A9 term returned as an active field, the web API and schema are unchanged, the
regression has **zero** unexplained failures and **zero** unexplained new skips, production was never
contacted, and every claim above carries direct evidence.

The conditions (§24) are genuine external dependencies — a deployment-security decision and
production-scale validation — not unresolved work inside A12's scope. Neither was silently upgraded.

---

## §29 Required final table

| Gate criterion | Evidence | Result |
| :--- | :--- | :--- |
| A11 baseline intact | SHA-256 vs A11.5 manifest §2: 6/6 IDENTICAL, 0 MODIFIED/MISSING/UNEXPECTED (§3) | **PASS** |
| `q` bounded | 6 boundary tests + live HTTP: 1000 → 200, 1001 → 400 `VALIDATION_ERROR` (§10, §18) | **PASS** |
| Abuse protection decision | dependency/middleware/config/provider audit → OPTION B, explicitly not claimed as implemented (§8/§9) | **CONDITIONAL** (deployment gate; conditions §24.1–2) |
| Deep pagination | per-class offsets 0…100 000, component split, `EXPLAIN ANALYZE`, scan+20 MB sort, offset-insensitive (§6/§7) | **CONDITIONAL** (deferred pending production monitoring, §24.3) |
| Detail DTO | producer-traced field matrix; declared shape shown unusable (§11/§12) | **DEFERRED** (blocked by D-5) |
| Detail endpoint | not implemented; N/A tests recorded explicitly (§12, §18.3) | **DEFERRED** |
| ID policy | id format, consumers, docs, absence of alias/opaque conventions audited (§13) | **PASS** (KEEP VERBATIM; change deferred) |
| Provenance | producer audit + leak assertions; no provenance field emitted (§14, §20) | **PASS** (display form deferred) |
| Localization | no authorized read path; inertness proven byte-identical over HTTP (§15) | **PASS** (KEEP INERT) |
| Stale terms | all 15 mandated terms enumerated with per-file hits and classification (§20) | **PASS** |
| Raw-row leakage | 9-key projection test, forbidden-key list, live serialized response scan (§18, §21) | **PASS** |
| Web isolation | no web file modified; shared helpers/service unchanged; live web route serving its own shape (§21) | **PASS** |
| Regression | 56/1137/0/55/1192 vs 56/1124/0/55/1179; +13 attributed; A6 skip set identical (§19) | **PASS** |
| Schema isolation | 4 migrations unchanged, `drizzle/` unchanged, no index/column/constraint change (§22) | **PASS** |
| Production isolation | no production URL/env/`.vercel`/Supabase/deploy/push/corpus access (§23) | **PASS** |

**No mandatory criterion is FAIL**, so the gate is not FAIL. **A12 IS COMPLETE.**
