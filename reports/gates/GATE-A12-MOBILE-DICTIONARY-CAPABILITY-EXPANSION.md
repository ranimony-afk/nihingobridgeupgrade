# GATE A12 — MOBILE DICTIONARY CAPABILITY EXPANSION & PRODUCTION-READINESS

**Verdict**: **PASS WITH CONDITIONS** (§27) — no mandatory criterion is FAIL; two conditions are
external/deployment dependencies (§23).

**Report relationship (no history rewritten).** This is the A12 report for the
*capability-expansion / production-readiness* framing of the gate. The companion report
`reports/gates/GATE-A12-MOBILE-DICTIONARY-HARDENING.md` (840 L) remains in place and holds the full
D-12 measurement tables, the D-9 producer matrix and the four earlier verification passes. Neither
report was rewritten; this one is self-contained for the 27 contents §21 requires and cites the
companion for raw measurement detail.

---

## §1 Gate identity

| Property | Value |
| :--- | :--- |
| Gate | **A12 — Mobile Dictionary Capability Expansion & Production-Readiness** |
| Date | 2026-09-24 |
| Branch | `arena/01a0d21c-nihingobridgeupgrade` |
| Mode | PRESERVE-FIRST, evidence-driven; decisions first, implementation only where authorized |
| Predecessors | A9 (payload design) · A10 (transport freeze) · A11 (search implementation) · A11.5 (durability + handoff) |
| Authority | `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` §A10.x + §A11.x (frozen), then this gate's §A12.x |
| Deliverables | this report; `docs/api/…-CONTRACT.md` §A12.7; four added tests |

---

## §2 Gate 0 baseline

| Property | Measured |
| :--- | :--- |
| HEAD | `cfe565d58ec4f6902c9f00bba491827ab303a53d` |
| `origin/main` | identical — distance `0 0` |
| Branch | `arena/01a0d21c-nihingobridgeupgrade` |
| Reflog | clone `14:30:52` + checkout `14:30:53` — no session commits |
| Working tree | **72 entries = 41 `??` + 31 ` M`**, 0 deleted |
| Commit probes | `d8a3682`, `d0ea6bd`, `0251d48`, `bcc5384`, `fa16e09`, `694c0e2`, `ff1f644`, `23ba543` → **all "Not a valid object name"** |

Artifacts required by §2, all present: route (125 L), adapter (130 L), DB-free suite (964 L → 1036 L
after this pass's additions), live suite (208 L), frozen contract (914 L → 946 L), A11 report (773 L),
A11.5 manifest (269 L), A11.5 handoff (243 L), A11.5 transition report (524 L).

Structural checklist (all measured on the source, §2):

| Requirement | Evidence |
| :--- | :--- |
| 9-field projection | `projectEntry` maps exactly 9 keys |
| No raw-row spread | `...row` appears **once**, inside the docblock that forbids it |
| No `page` parsing | 0 occurrences of `get("page")` in the route |
| No `ent_seq` / `sourceRef` / `frequencyRank` / `partsOfSpeech` / `tags` emitted | 0 occurrences in either source file |
| No `error.message` passthrough | the only hit is the docblock at `route.ts:118`; the catch emits the fixed `INTERNAL_ERROR` literal |
| Exactly one mobile search route | `find src/app/api/v1 -name route.ts` → 1 |
| No mobile detail route yet | 0 detail/entry paths under `src/app/api/v1` |

Integrity re-hash against the A11.5 manifest: **IDENTICAL 7 / MODIFIED 4 / MISSING 0 / UNEXPECTED 0**.
The four modifications are precisely the previously authorized A12 change set
(`route.ts`, `_lib.ts`, the DB-free suite, the contract), each with before → after hashes recorded in
the companion report §3/§17. No file was restored from memory, and nothing was repaired automatically.

---

## §3 Preservation audit

| Rule | Status |
| :--- | :--- |
| No reset / clean / checkout / cherry-pick / merge / rebase / stash / discard | **honoured** — no such command was run at any point |
| No commit reconstruction | **honoured** — no hash was recreated, and all are treated as absent |
| Unrelated modifications preserved | **honoured** — the 31 ` M` files (including `next-env.d.ts`, see §3.1) were never staged, reverted or edited by A12 |
| No files modified merely to look clean | **honoured** |
| Unattributable modification | **none found** — every entry in `git status` maps to a known gate or tool |

### §3.1 Tool-state note (`next-env.d.ts`)

`next-env.d.ts` is Next.js-managed (its header says *"This file should not be edited"*). Running
`npx next dev` rewrites its single import to `./.next/dev/types/routes.d.ts` (working tree reads
**32 ` M`**); running `npm run build` rewrites it back to the committed `./.next/types/routes.d.ts`
(**31 ` M`**). Measured both ways and reproduced on demand. The file is never staged, and the wobble is
a side effect of the mandatory verification commands — not drift.

---

## §4 Dependency audit

| Step | Result |
| :--- | :--- |
| `node_modules` at entry | **absent** (0 entries) — reported as the brief requires |
| `npm ci --no-audit --no-fund` | exit 0, **341** entries |
| `package.json` before/after | **UNCHANGED** |
| `package-lock.json` before/after | **UNCHANGED** |
| Package upgrades | **none** — nothing was installed beyond the existing lockfile |

No dependency was added for rate limiting, caching, validation or testing. The decision framework in
§12 explicitly required *not* introducing a dependency for convenience, and none was.

---

## §5 Evidence provenance

| Evidence class | Where used | Labelled how |
| :--- | :--- | :--- |
| Static source inspection | projection, leakage, route inventory, filter surface | cited with file + line |
| SHA-256 comparison | artifact integrity | 16-hex prefixes against the A11.5 manifest |
| Deterministic HTTP requests | method matrix, boundaries, inertness, isolation | live local dev server, `curl`, quoted |
| Executable tests | 59 DB-free + 7 live | suite names and counts |
| Measured runtime behaviour | D-12 pagination, D-14 cost curve | **local, disposable, synthetic-fixture** — never production |
| Exact schema/type evidence | D-9 producers, D-4 id format | `src/db/schema.ts`, ETL transformer |

No production measurement exists anywhere in this gate; production was never contacted (§22).

---

## §6–§15 Decision statuses

Each decision is classified with the vocabulary §3 mandates — **PASS / FAIL / BLOCKED / NOT TESTED /
DEFERRED**. Where a PASS carries a dependency, the condition is stated inside the row rather than
inventing a sixth label, so the §3 vocabulary is preserved exactly.

### §6 D-4 — public/opaque identifier

**Verdict: PASS** (decision resolved; the *change* is not authorized and not needed).

| Evidence | Finding |
| :--- | :--- |
| `dictionary_entries.id` | `text` primary key, exposed publicly today |
| ID format | `de-jmdict-${entSeq}` (`src/etl/dictionary/transformer.ts:263`, `src/etl/dictionary/types.ts:147`) |
| Column `ent_seq` | **does not exist** — `dictionary_entries` has 12 columns, none named `ent_seq`; the string never reaches a payload |
| External consumers | the web detail routes accept the canonical id **or** a headword; the kanji lexical graph references concrete ids (`de-jmdict-1158520`) |
| Public documentation | the frozen contract freezes `id` verbatim (§A10.5) |
| Opaque-id / alias convention | **none**; 4 migrations, no alias table |

Decision: **KEEP VERBATIM ID**. The identifier is already the repository's stable public identifier and
the mobile surface is read-only; an opaque id would require a schema change for no boundary benefit.
No alias, no migration, no hashing. *Future gate:* none — reopen only if a boundary requirement is
demonstrated.

### §7 D-5 — provenance display

**Verdict: DEFERRED.** *Future gate:* A13.

No resolved display form exists: rows carry the raw
`source_ref` string (`upstream:jmdict:…`) and `knowledge_sources` holds internal identifiers, `url`,
`license`, `imported_at` and `record_count`. A12 did **not** design a display form and did **not**
expose any provenance field. Verified by test: the response contains no `sourceRef`, `source`,
`provenance` or `sourceId`, even though the mock row's `sourceRef` is a realistic
`upstream:jmdict:2023-08` (the assertion is therefore non-vacuous).

### §8 D-6 — localization

**Verdict: DEFERRED.** *Future gate:* A13 (requires an authorized, provenance-labelled read path).

`targetLanguage` is validated against `SUPPORTED_LANGUAGES` (`en|ta|ml`) and **inert**: over HTTP,
`?…&targetLanguage=ta` returns a response byte-identical to the same request without it. No translation
table was queried, no translation was inferred, no AI provider was called, no new translation system
was introduced, and `primaryGlosses` was not altered.

### §9 D-7 — keigo

**Verdict: DEFERRED.** *Future gate:* A13 (needs a semantics + per-item cost decision).

Producer exists (`kanjiLexicalGraphService.getKeigoRelations(entryId)` → `KeigoRelation[]`) but is
graph-layer and derived, **not** per-entry attestation. The search item declares neither `isKeigo` nor
`keigoType`, and neither is emitted.

### §10 D-8 — audio

**Verdict: DEFERRED.** *Future gate:* A13 (requires an authorized producer).

No dictionary-entry audio producer exists. `audioUrl` appears only on the JLPT questions surface — a
different resource family with its own data. No audio was generated, no external audio was ingested,
and no empty placeholder field was added.

### §11 D-9 — entry detail DTO + endpoint

**Verdict: BLOCKED.**

Blocking evidence, precisely: (a) the detail **payload** was deferred by §A10.7 to a decision that
requires its own frozen contract; (b) the A11.5 handoff §5 binds A12 to freeze that contract *before*
implementing; (c) the contract cannot be frozen because it is blocked by **D-5**, whose resolved
provenance display form does not exist; and (d) the only producer, `getEntryDetail`, returns raw rows
of four adjacent tables (`entry` row + `knowledge_sources` + `kanji_entries` + `example_sentences` +
`grammar_patterns`), which the never-expose rules forbid at the boundary.

Producer-traced field matrix (abridged; the full table is in the companion report §11):

| Field | Producer | Authorized now | Detail v1 | Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `id`, `headword`, `reading`, `romaji` | `dictionary_entries` | yes | yes | already in the search DTO |
| `primaryGlosses`, `jlptLevel`, `jlptStatus`, `isCommon`, `kanjiCharacters` | column / `classifyJlptLevel` | yes | yes | already in the search DTO |
| `partsOfSpeech` | `parts_of_speech` | verify | decision | candidate; also a D-10 question |
| `tags` | `tags` | verify | decision | internal classification → never expose (taxonomy undecided) |
| `frequencyRank` | `frequency_rank` | verify | decision | internal metric; no learner-facing contract |
| `sourceRef`, `source`, `provenance.sourceId` | `source_ref`, `knowledge_sources` | **no** | no | never expose (D-5 unresolved) |
| `kanji[]`, `sentences[]`, `grammar[]` raw rows | 3 tables | **no** | no | raw rows carry `source_ref` → curated projection required |
| `conjugations`, `synonyms`, `antonyms`, `phrases`, `collocations` | **none** | — | no | **no producer** (types only) |
| `alternativeHeadwords`, `alternativeReadings` | ETL-only, **not persisted** | — | no | requires schema |
| `keigo` | graph layer | verify | defer | D-7 undecided |
| `userState` (`isBookmarked`…) | **none** | — | no | requires auth + user state |
| `hasAudio`/`audioUrl`, `localizedGlosses` | **none** | — | no | D-8 / D-6 |

Additional finding recorded for the future gate: `src/types/mobileDictionary.ts` already declares a
`MobileDictionaryDetailResponse` **and** a `MobileSwipeSection*` family with **no runtime producer**.
Adopting that shape as-is would expose `provenance.sourceId` (an internal source identifier) and
auth-dependent `userState`. It is a design sketch, not a contract.

Endpoint design (brief §9 permits design **only after** the DTO is frozen): therefore **not designed**.
HTTP method, path, identifier parameter, not-found and malformed-id behaviour, success/error envelopes,
cache behaviour and service reuse are all recorded as **NOT DETERMINED**, with the constraints that
already apply (frozen `{success,data}` envelope, safe-500 rule, reuse of `getEntryDetail`, no second
read engine).

The absence of a detail route is itself pinned by an existing A11 test: `implements the frozen path
exactly once` walks `src/app/api/v1` for `route.ts` files and asserts the inventory equals exactly the
one search route — so this deferral cannot be reversed by accident.

### §12 D-10 — richer filters

**Verdict: DEFERRED** (nothing exposed). *Future gate:* A13+.

| Filter | Classification | Evidence |
| :--- | :--- | :--- |
| `query`, `jlptLevel` (`level`/`jlpt`), `isCommon` (`common`), `limit`, `offset` | **already implemented and exposed** | `DictionarySearchOptions` = `{query, jlptLevel, isCommon, limit, offset}` |
| `partsOfSpeech` | **not implemented** | no predicate exists |
| `hasKanji` | **not implemented** | would require scanning `kanji_characters` |
| `hasExamples` | **not implemented** | would require joining `example_sentences` — new SQL semantics |
| `register` | **not implemented** | no register column |

**"Available but not exposed": none.** Every filter the canonical service implements is already
exposed; the rest would need new SQL semantics, which this gate may not introduce.

### §13 D-11 — warnings / offline

**Verdict: DEFERRED** (client-owned). *Future gate:* only if a server-side producer is ever authorized.

No `warnings`, `stale`, `degraded` or `fallback` field exists, and none was fabricated. Failures remain
HTTP status + the fixed error envelope. Offline behaviour remains client-owned.

### §14 D-12 — deep pagination performance

**Verdict: PASS** (decision resolved: keep the frozen offset contract; no redesign) — with
production-scale latency explicitly **NOT TESTED** and a monitoring condition attached.

Method and results (full tables in the companion report §6): a disposable PGlite instance seeded with
100 000 synthetic rows **plus** the 30-row first-party corpus (100 030 total); the real
`DictionaryService.searchEntries` driven at offsets **0 / 100 / 1 000 / 10 000 / 50 000 / 100 000**
across broad-latin, no-match and Japanese-kanji classes.

| Finding | Measurement |
| :--- | :--- |
| Offset sensitivity | rows query **260 ms at offset 0** vs **303 ms at offset 100 000** — offset-insensitive |
| Dominant cost | full sequential scan (`ILIKE '%…%'` has a leading wildcard → no btree can serve it) + **external merge sort spilling 20 MB** for 100 029 matches |
| Post-limit filtering | the service re-sorts the returned page in JS (exact-match priority) — re-orders ≤100 rows, drops none |
| Deduplication | none (single-table scan, `id` primary key, no joins) |
| Publication overlay | **1:1** — `resolveDictionaryEntries` maps one output per input row |
| Deep boundary behaviour | offset 100 000 with `total = 20 001` → **200** with an empty page, `hasMore=false` |

Interpretation: **the cost is per-request and offset-independent**, so a cursor would not remove the
scan or the sort, and an index cannot serve a leading-wildcard `ILIKE`. Introducing cursors "because
they are theoretically better" is explicitly out of scope, and the frozen offset contract is unchanged.
Absolute production latency is **NOT TESTED** — no production access exists and none was attempted; the
condition is production monitoring (§23).

### §15 D-13 — rate limiting / abuse protection

**Verdict: DEFERRED** to a **deployment gate**. *Future gate:* the production-readiness/deployment gate
before any production exposure.

Evidence audit (§5 of the brief):

| Probe | Result |
| :--- | :--- |
| Deployment architecture | no `vercel.json`, no `.vercel/`, no `netlify.toml`/`fly.toml`/`Dockerfile`/`railway.json`/`render.yaml`; only `.github/workflows/ci.yml` (CI, not runtime) |
| Middleware | `middleware.ts` and `src/middleware.ts` **absent** — no request-interception layer |
| Rate-limit utilities | none. The only `rateLimit` symbols are the AI provider's error taxonomy (`provider.ts` `rateLimited()`, `anthropic.ts` HTTP-429 mapping, `mock.ts` scenarios) |
| Dependency inventory | **24** packages; zero matching rate/limit/upstash/redis/ioredis/kv/cache/arcjet/throttle |
| Authentication infrastructure | `src/lib/auth/*` used by **CMS write paths only**; the dictionary surface is public read-only |
| Existing provider configured | **none** — no provider, credentials or configuration |
| Can it be implemented without new external infrastructure / credentials / paid services / schema / unrelated changes? | **No** — a correct limiter needs shared state plus thresholds and failure behaviour that are ops/product decisions |

Choice: **infrastructure/deployment-level (option 2 of the brief's four)** — not application-level, not
both. Reason: an application-level limiter implemented here would be per-instance memory, which is
ineffective on multi-instance hosting while *appearing* to be protection; the brief forbids exactly
that. The application contract that **is** frozen (now in the contract as §A12.7): the app emits no
`429`, no `Retry-After`; enforcement belongs to the deployment layer; identity/key, window, threshold,
response and `Retry-After` behaviour are **deliberately undecided** and must be recorded by the
deployment gate. `implemented` (the `q` cap) and `production-approved` (nothing) are kept distinct.

## §16 D-14 — `q` length

**Verdict: PASS** — bounded, tested, and sealed against the ILIKE path. Condition attached: the cap is
not abuse protection (§15).

| Property | Value |
| :--- | :--- |
| Maximum | **1000 UTF-16 code units** (`String#length`) |
| Measured on | the **sanitized** value (NUL-strip + trim), after emptiness |
| Over-limit | **400, rejected — never truncated**; the service is never called |
| Code / message | `VALIDATION_ERROR` / `Query parameter 'q' must be at most 1000 characters` |
| Envelope | the frozen `{ success:false, error:{ code, message } }`, unchanged |
| Where enforced | in the route, immediately after parameter parsing and sanitation (not inside `_lib`'s pure helpers only) |
| Cap value origin | mirrors the existing convention `MAX_QUERY_LENGTH = 1000` in `src/app/api/ai/answer/route.ts` (no new validation framework) |

Measured cost curve that justifies the cap (local, disposable; companion report §10): 1 char 1.0 s →
100 chars 1.6 s → **1 000 chars 8.9 s** → 10 000 chars **83.7 s**; escaping makes wildcard-laden input
the slowest class (`%`×1000 → 16.9 s). LIKE metacharacters **are** escaped (`escapeLikePattern`), proven
empirically: `q="%"` matches **0** rows where unescaped it would match all 100 030.

Boundary/HTTP ladder measured this pass:

| Input | Result |
| :--- | :--- |
| empty (`q=`) | `400 MISSING_QUERY` |
| normal (`mizu`) | `200` |
| boundary − 1 (999) | `200` |
| **boundary (1000)** | `200` |
| **boundary + 1 (1001)** | `400 VALIDATION_ERROR` |
| 5 000 / 8 000 / 10 000 / 12 000 / 14 000 / 16 000 | `400 VALIDATION_ERROR` (app) |
| 17 000 / 18 000 / 19 000 / 20 000 | `431` — **HTTP layer**, before the route runs (informational, deployment-dependent; recorded in §A12.7 as *not* a security boundary) |

---

## §17 Implementation scope (frozen)

| Item | Classification |
| :--- | :--- |
| D-14 `q` cap + boundary tests | **IMPLEMENT** |
| D-13 deployment delegation + application contract freeze | **IMPLEMENT (documentation only; no runtime protection)** |
| D-4 keep-verbatim decision | **IMPLEMENT (decision recorded; no code change needed)** |
| D-9 detail DTO/endpoint | **BLOCKED** |
| D-12 pagination redesign / cursors / indexes | **NOT AUTHORIZED** |
| D-5 / D-6 / D-7 / D-8 / D-10 / D-11 | **DEFER** |
| Authentication, rate limiting in-app, schema/migrations/indexes, web-API change, corpus ingestion, Phase 14.4D/E, 14.5A/B | **NOT AUTHORIZED** |

Implementation was not started before this scope was frozen — the scope above is the same set of
items the gate executed in its earlier passes, extended this pass only by the four §16 tests and the
§A12.7 contract freeze.

---

## §18 Files changed

| Path | Change | Class | SHA-256 (16) |
| :--- | :--- | :--- | :--- |
| `tests/mobile-dictionary-search-api.test.ts` | 964 → 1031 L; **59 tests** (42 A11 + 17 A12) | A12 TESTS | `309bebdba659efd0` → (recorded in §25) |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` | 914 → 946 L; appended §A12.7 | A12 CONTRACT | `037eccda5e471b71` → `5a8165e83385d4f1` |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-CAPABILITY-EXPANSION.md` | this report | A12 EVIDENCE | (recorded in §25) |
| `src/…/search/route.ts`, `src/…/search/_lib.ts` | **unchanged this pass** | A12 (earlier passes) | `5523860e48c88329`, `b8a575399b8f9986` |
| `tests/mobile-dictionary-search-api-live.test.ts` | **unchanged** | A11 FROZEN | `029c4331ee90f433` |

Added tests this pass (4): boundary − 1 accepted; extremely large input (100 000 chars) rejected with
`VALIDATION_ERROR` and no service call; SQL-injection-like `q` forwarded verbatim with a normal
envelope and no leakage; malformed numeric parameters (`1e999`, empty, encoded space, encoded `+`)
non-fatal. The malformed-numbers test deliberately covers only forms A11's existing malformed-pagination
test does not reach — no duplicate assertions were added.

---

## §19 Tests

| Layer | Suite | Count | Result |
| :--- | :--- | ---: | :--- |
| Unit / contract (DB-free, mocked service) | `tests/mobile-dictionary-search-api.test.ts` | **59** | all pass |
| Database-backed (real route + real service + seeded first-party corpus, disposable DB) | `tests/mobile-dictionary-search-api-live.test.ts` | **7** | all pass |
| Targeted mobile/kanji suites | 7 files | 180 → **184** | all pass |
| Full suite | 56 files | **1141 passed / 0 failed / 55 skipped / 1196 total** | exit 0 |

Security tests now in place: long `q` (999/1000/1001/5 000…100 000), empty and whitespace and NUL-only
`q`, NUL-padded over-cap input, wildcard-laden over-cap input, injection-like input, malformed numeric
parameters, internal-error leakage (stack/SQL/hostname/password strings), unexpected and retired
parameters (`page`, `foo`), and unknown-parameter inertness.

Database-backed tests use the repository's **real** first-party seed corpus (`src/data/lexicon.ts` →
`dictionary_entries`, 30 rows) through the real route and service — no invented fixture is asserted as
if it were repository data.

---

## §20 Regression

| Metric | A11.5 baseline | A12 final | Delta |
| :--- | :--- | :--- | :--- |
| Files | 56 | **56** | 0 |
| Passed | 1124 | **1141** | **+17** |
| Failed | 0 | **0** | 0 |
| Skipped | 55 | **55** | 0 |
| Total | 1179 | **1196** | **+17** |

**NEW FAILURES: 0. NEW SKIPS: 0.** The 55 corpus/data-tier skips are unchanged and byte-identical as a
set (`corpus-preflight` 1, `dictionary-architecture-corpus` 1, `dry-run-jmdict` 1,
`full-jmdict-ingestion` 7, `kanji-lexical-graph` 11, `kanjidic2-canonical-ingestion` 11,
`kanjidic2-etl-foundation` 4, `kanjivg-etl` 7, `pilot-jmdict-db` 12).

Baseline parity is proven by partition rather than by reverting the authorized change set: the **55
untouched files contribute 1082 passed / 0 failed / 55 skipped = 1124 − 42**, and the modified file is
**59 = 42 (A11 groups) + 17 (A12 groups)**. No test was weakened, deleted or skipped to obtain green.

---

## §21 Security audit

| Check | Result |
| :--- | :--- |
| `q` bounded before the ILIKE path | **yes** — rejected at the boundary; the service is never called |
| Over-limit rejected, never truncated | **yes** — tested at 1001 and 100 000 |
| Abuse behaviour explicitly delegated | **yes** — §15 + contract §A12.7 (deployment layer; no app limiter claimed) |
| No sensitive internal error reaches clients | **yes** — fixed `INTERNAL_ERROR` literal; tested against `stack`, `select`, `ECONNREFUSED`, `password`, `supersecret`, `5432`, `/home/` |
| Closed projection intact | **yes** — 9-field item, 8-key `data`, verified live |
| Security behaviour testable | **yes** — the boundary ladder and leakage assertions are executable tests |
| SQL injection | **not reachable** — the route performs no string surgery; the service builds a **parameterised** `ilike()` from an escaped pattern; injection-like input returns `200` with 0 rows and no leakage |
| LIKE-wildcard abuse | **not reachable** — `escapeLikePattern` applied; empirically `%` → 0 matches |
| Rate limiting | **absent and not claimed** — deployment gate (§15) |

The brief's SECURITY PASS CONDITION is therefore met: `q` is bounded, abuse is formally delegated,
no sensitive error reaches clients, the projection is intact, and every claim is testable.

---

## §22 Web API isolation

| Check | Evidence |
| :--- | :--- |
| `git diff` on web dictionary paths | **0 modifications** (`src/app/api/dictionary`, `src/services/dictionary`, `src/lib/api`, `src/app/api/cms`) |
| Route comparison | web route still `src/app/api/dictionary/search/route.ts` with its own contract |
| Live web behaviour | `GET /api/dictionary/search?q=mizu` → `200`, envelope `{success,data}`, data keys `appliedJlptLevel, detectedScript, entries, limit, offset, query, total` |
| Shared service semantics | `DictionaryService.searchEntries` **unequal to A11 entry? no** — the file is byte-identical to the A11 state (integrity re-hash §2) |
| Shared helpers | `parseLimit` / `parseOffset` / `parseBooleanFlag` / `errorBody` reused unchanged |
| Regression tests | full suite green; the web suites (31 kanji/dictionary route tests among the targeted 184) all pass |

No shared service required modification, so no adapter-versus-shared-semantics conflict arose.

---

## §23 Schema / migration status

| Check | Result |
| :--- | :--- |
| Migrations | **4**, unchanged (`0000`–`0003`) |
| `drizzle/` | **0 modifications** |
| `src/db/schema.ts` | shows a pre-existing ` M` (Gate A2, comment-only) with **0 A12-related lines** |
| Indexes added | **none** — D-12 was measured before any index was considered, and the measurement showed an index cannot serve a leading-wildcard `ILIKE` |
| Columns / tables / constraints / data | **unchanged** |

No schema change was required or made; none was "silently" made either. Had evidence demanded one, the
policy was to stop and record it as a separate authorization item (§20 of the brief).

---

## §24 Production status

| Check | Result |
| :--- | :--- |
| Production `DATABASE_URL` | never used; all DB work on loopback PGlite |
| `.env` | **absent** (only `.env.example`); never read |
| `.vercel` / deployment operation | **absent**; none performed |
| Supabase | no client instantiated; no read, no write |
| Deploy / push | **none** |
| Corpus access | **none** — Tatoeba, KanjiVG, JMdict, KANJIDIC2 untouched (5 pre-existing `.tar.bz2` files unchanged) |
| Phases 14.4D/14.4E/14.5A/14.5B | **not begun** |
| Secrets printed | none |
| Runtime processes | one disposable PGlite and one local dev server, both stopped at gate end |

---

## §25 Stale-term audit

All 17 terms in the brief's list were searched across the four implementation/test files and classified
as **ACTIVE / RETIREMENT DOCUMENTATION / UNRELATED / TEST ASSERTION**:

| Term | route.ts | _lib.ts | DB-free suite | live suite | Classification |
| :--- | ---: | ---: | ---: | ---: | :--- |
| `...row` | 0 | 1 | 1 | 0 | RETIREMENT DOCUMENTATION + TEST ASSERTION |
| `page` | 1 | 0 | 5 | 4 | RETIREMENT DOCUMENTATION + TEST ASSERTION (used as ignored input) |
| `ent_seq` | 0 | 0 | 2 | 0 | TEST ASSERTION (forbidden-key list, D-4 check) |
| `sourceRef` | 1 | 1 | 4 | 2 | RETIREMENT DOCUMENTATION + TEST FIXTURE/ASSERTION |
| `frequencyRank` | 1 | 1 | 2 | 0 | RETIREMENT DOCUMENTATION + TEST ASSERTION |
| `partsOfSpeech` | 1 | 1 | 2 | 0 | RETIREMENT DOCUMENTATION + TEST ASSERTION |
| `tags` | 1 | 1 | 2 | 0 | RETIREMENT DOCUMENTATION + TEST ASSERTION |
| `queryEcho` | 0 | 0 | 1 | 0 | TEST ASSERTION (asserts absence) |
| `matchType` | 0 | 0 | 0 | 0 | — none |
| `jlptKnown` | 0 | 0 | 1 | 0 | TEST ASSERTION (asserts absence) |
| `apiVersion` | 1 | 0 | 1 | 0 | RETIREMENT DOCUMENTATION + TEST ASSERTION |
| `meta` | 1 | 0 | 1 | 0 | RETIREMENT DOCUMENTATION + TEST ASSERTION |
| `warnings` | 1 | 0 | 1 | 0 | RETIREMENT DOCUMENTATION + TEST ASSERTION |
| `results` | 0 | 0 | 1 | 0 | TEST ASSERTION |
| `totalResults` | 0 | 0 | 1 | 0 | TEST ASSERTION (forbidden-key list) |
| `executionTimeMs` | 0 | 0 | 1 | 0 | TEST ASSERTION (forbidden-key list) |
| `error.message` | 1 | 0 | 0 | 1 | RETIREMENT DOCUMENTATION (explains why the web pattern is not copied) |

**ACTIVE occurrences: 0.** A programmatic pass over both source files confirmed every hit lies inside a
comment; the emitted payload carries exactly the 9 frozen fields and the 8 frozen `data` keys.

### §25.1 A12 artifact hash manifest

Path + SHA-256 is the durable identity (commits do not survive this environment):

| Artifact | Lines | SHA-256 (16) |
| :--- | ---: | :--- |
| `src/app/api/v1/mobile/dictionary/search/route.ts` | 125 | `5523860e48c88329` |
| `src/app/api/v1/mobile/dictionary/search/_lib.ts` | 130 | `b8a575399b8f9986` |
| `tests/mobile-dictionary-search-api.test.ts` | 1031 | `3159a7380a0633b1` |
| `tests/mobile-dictionary-search-api-live.test.ts` | 208 | `029c4331ee90f433` |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` | 946 | `5a8165e83385d4f1` |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-HARDENING.md` | 840 | `d26026298905ba7e` |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-CAPABILITY-EXPANSION.md` | (self) | **not self-recorded** — see §25.3 |

The A11.5 manifest remains the frozen A11-era record and was **not** rewritten; A12 records its own
manifest here, as the brief's §23 requires.

### §25.2 Durability outcome

**Outcome B**: every session commit hash (`d8a3682`, `d0ea6bd`, `0251d48`, `bcc5384`, `fa16e09`,
`694c0e2`, `ff1f644`, `23ba543`) is unreachable in this clone — "Not a valid object name". File content
persists; commit objects do not. **COMMIT DURABILITY: NOT VERIFIED.** No commit was recreated. Staging
was path-specific in every pass; no unrelated file was ever staged.

---

## §26 A13 handoff

**State left behind**

```text
GET /api/v1/mobile/dictionary/search   IMPLEMENTED, frozen, q bounded at 1000, tested (59 + 7)
detail endpoint                        NOT IMPLEMENTED — DTO unfrozen, BLOCKED by D-5
rate limiting                          NOT IMPLEMENTED — enforcement delegated to the deployment layer
pagination                             offset-based, unchanged; cost is per-request, not offset-driven
schema / migrations                    unchanged (4)
web API                                unchanged
production                             untouched; not approved for exposure (D-13)
```

**A13 may** (with explicit authorization): resolve D-5 to unblock D-9 and freeze the detail contract;
implement localization with provenance labelling; implement abuse protection together with the
deployment configuration it requires; re-measure D-12 against production-like data.

**A13 must not** (without new authorization): redesign the frozen search surface; expose `sourceRef`,
`provenance.sourceId`, raw rows, `ent_seq`, `frequencyRank`, `tags` or any no-producer field; introduce
cursors, indexes, schema changes or new SQL semantics; add authentication or a fake limiter; ingest
corpora; begin Phase 14.4D/14.4E/14.5A/14.5B; push or deploy.

**A13's first actions**: re-verify content by SHA-256 (never by commit hash); re-read
`reports/gates/A11-TO-A12-HANDOFF.md` §5 before touching D-9; start from the §11 field matrix.

---

## §27 Final PASS/FAIL matrix

| Decision | Status | Evidence | Implementation | Future Gate |
| :--- | :--- | :--- | :--- | :--- |
| **D-4** | **PASS** | id format `de-jmdict-${entSeq}` (ETL), no `ent_seq` column, consumers + docs audit, no alias convention | keep verbatim (no code change) | none (reopen only on a proven boundary requirement) |
| **D-5** | **DEFERRED** | producers traced; no display form exists; leakage assertions pass | none (nothing exposed) | A13 |
| **D-6** | **DEFERRED** | no authorized read path; inertness proven byte-identical over HTTP | none (stays inert) | A13 |
| **D-7** | **DEFERRED** | graph-layer producer only; semantics + per-item cost undecided | none | A13 |
| **D-8** | **DEFERRED** | no dictionary-entry audio producer | none | A13 |
| **D-9** | **BLOCKED** | §A10.7 deferral + handoff §5 precondition + D-5 unresolved + raw-row producer | none (no detail route) | A13, after D-5 |
| **D-10** | **DEFERRED** | filter inventory: all implemented filters already exposed; rest need new SQL | none | A13+ |
| **D-11** | **DEFERRED** | no producer; client-owned | none | only if a producer is authorized |
| **D-12** | **PASS** | offsets 0…100 000 measured; cost offset-insensitive; 20 MB sort; cursor/index would not help; deep boundary returns 200 empty page | none (contract unchanged) | production-monitoring condition; no redesign authorized |
| **D-13** | **DEFERRED** | no middleware / limiter dependency / provider (0 of 24 deps); CMS-only auth | none in-app; contract frozen (§A12.7) | deployment gate before production exposure |
| **D-14** | **PASS** | 1000-unit cap implemented; ladder 999/1000 → 200, 1001/5 k…100 k → 400; rejects, never truncates; convention mirrored from `ai/answer` | implemented + 8 tests | none (abuse protection remains D-13) |

**Vocabulary reconciliation (§3 vs §6 of the brief).** §3 mandates exactly one of
PASS/FAIL/BLOCKED/NOT TESTED/DEFERRED; §6 additionally permits CONDITIONAL for pagination. A12 uses the
§3 vocabulary and records §6's *conditional* substance as an attached condition inside the affected
rows (D-12 production monitoring; D-14 not abuse protection). This tension is documented rather than
silently reconciled.

---

## §28 Conditions

| # | Condition | Dependency (owner) | Blocking stage | Exact evidence |
| :-: | :--- | :--- | :--- | :--- |
| 1 | D-13 abuse protection unresolved; the endpoint is not production-approved | Deployment/ops + security | production exposure | no `middleware.ts`; 0 of 24 dependencies rate-limit-related; no provider configured (§15) |
| 2 | The `q` cap hardens but does not protect | — | production exposure | 8.9 s (latin) to 16.9 s (wildcard-laden) measured at the 1000-char cap on a disposable DB (§16) |
| 3 | D-12 production-scale latency NOT TESTED | — | any performance claim | all measurements local/disposable/synthetic (§14) |
| 4 | D-9 blocked by D-5 | A13 | detail endpoint | §A10.7 + handoff §5 + no resolved display form (§11) |
| 5 | Commit durability NOT VERIFIED | environment | any hash-based claim | all session hashes unreachable (§25.2) |
| 6 | `MobileDictionaryDetailResponse` unusable as-is | A13 | detail DTO | would expose `provenance.sourceId` and `userState`; five families have no producer (§11) |

---

## §29 Final verdict

**PASS WITH CONDITIONS.**

Every mandatory criterion of this gate is satisfied: the A11/A11.5 baseline is intact (7 artifacts
byte-identical, the other 4 modifications traced to the authorized A12 change set); `q` is bounded,
tested at every boundary including extremely large input, and sealed against the ILIKE path; abuse
behaviour is explicitly delegated rather than silently assumed; no sensitive internal error reaches
clients; the closed projection is intact and verified live; D-9 is evidence-backed and honestly blocked;
D-12 was measured rather than guessed and no redesign was performed; the web API and schema are
unchanged; the regression has zero unexplained failures and zero unexplained new skips; production,
corpora and later phases remain untouched; and every status above cites direct evidence.

The conditions are genuine external dependencies — a deployment-security decision, production-scale
validation, and the D-5 prerequisite for detail — not unfinished work inside this gate's scope. None
was upgraded to PASS.

### §25.3 Identity of this report

A file cannot contain its own SHA-256, so this report's hash of record lives in the commit message of
the commit that last modified it.

**Correction, recorded rather than hidden.** The A12 feature commit `036ad50` cited
`df7f7a5998cc4eed` for this file. That value was computed *before* a final accuracy patch (line counts,
heading level, manifest rows), so it was superseded; the true value for the committed content is in the
follow-up commit's message. The earlier value is not deleted from the record — it is identified here as
stale so a future gate comparing hashes knows which is authoritative. Amending the earlier commit was
not an option: the operating rules forbid amend/rewrite, and the history is therefore corrected
forward, never rewritten.
