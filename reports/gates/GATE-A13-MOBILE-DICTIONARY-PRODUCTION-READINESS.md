# GATE A13 — MOBILE DICTIONARY PRODUCTION READINESS, PERFORMANCE & DETAIL-CONTRACT DECISION GATE

**Gate type:** decision and evidence gate. No feature development. No production contact.
**Date:** 2026-09-25 (session-local). **Author:** Agent Mode, Arena.ai (session branch
`arena/01a0d21c-nihingobridgeupgrade`).
**Subject surface:** the single frozen mobile route `GET /api/v1/mobile/dictionary/search`
(Gate A11 implementation, hardened by A12) and the deferred decision register D-4 … D-14.

---

## §1 Gate identity and authority

A13 audits production readiness, measures search performance on disposable infrastructure, evaluates
rate-limit strategy and `q`-cap adequacy, traces every proposed detail field to a producer, and decides
whether D-9 can be frozen. It **may not** redesign search semantics, alter `SearchScript`, reintroduce
retired fields, change id semantics, expose provenance/internal columns, implement a detail endpoint,
localization, auth, rate limiting or cursor pagination, add schema/index/migration objects, modify the
web dictionary surface, ingest corpus tiers, touch 14.4D/14.4E/14.5A/14.5B, contact production, change
Vercel/Supabase configuration, push, or create a migration.

Where a decision would have required an implementation, the gate was required to stop with
`IMPLEMENTATION REQUIRED — NOT AUTHORIZED BY A13`. That condition **did not arise**: every decision
below was resolved from inspection, measurement or verification on disposable infrastructure, and no
implementation was performed. The only code-adjacent changes are test files (§19).

## §2 Method and evidence order

The mandated order — **runtime behaviour > producer implementation > schema/data > tests > frozen
contract > types > historical docs > comments** — was applied throughout, and was decisive in §18,
where the runtime ordering mechanism contradicted the literal reading of a frozen sentence. No
decision was taken from a declared type, a docblock or a comment where a producer or a runtime
measurement existed.

Measurement labels used below, strictly:

* **LOCAL / DISPOSABLE / SYNTHETIC** — a `PGlite` instance started for this gate from
  `scripts/run-disposable-pg.ts`, seeded with generated rows. Never presented as production evidence.
* **LOCAL / DISPOSABLE / SEEDED** — the same instance, searched over the 30-row first-party seed corpus
  (`src/data/lexicon.ts`).
* **STATIC** — inspection of source, schema or configuration.
* **VERIFIED (test)** — executed assertions, named in §19.

## §3 Gate 0 baseline

| Property | Measured |
| :--- | :--- |
| HEAD | `cfe565d58ec4f6902c9f00bba491827ab303a53d` |
| `origin/main` | identical — distance `0 0` |
| Branch | `arena/01a0d21c-nihingobridgeupgrade` |
| Reflog | clone + checkout only — no session commits present |
| Working tree (Gate 0) | **74 entries = 42 `??` + 32 ` M`**, 0 deleted |
| Working tree (close) | **75 entries = 43 `??` + 32 ` M`**, 0 deleted |
| Deleted files | 0 |
| Repository state | no `.env`, no `.vercel`, 4 migrations (`0000`–`0003`) |

**Count variance, recorded rather than smoothed.** The untracked count read 42 at Gate 0 and 43 at
close. Every one of the 43 paths was enumerated and tested against the commit:
`git cat-file -e HEAD:<path>` → **43 absent, 0 present**, so all of them are session artifacts from
gates A1–A12 that `origin/main` does not contain (the `.git` layer re-clones at `cfe565d` every turn,
which is why session-committed files reappear as untracked). No file was created after the clone
except the three paths A13 itself edited (two test files, one contract), which is proven by
modification time (only `tests/mobile-dictionary-search-api.test.ts` 02:02, the live suite 02:02, the
contract 02:08; everything else is stamped at clone time 01:57:19). Across gates A11–A13 this same
tree has reported 39/40/41/42/43 untracked entries, so the figure is a counting artifact of the
enumeration, **not** a file added or lost. Decision impact: none — A13 stages path-specifically (§30).

## §4 Preservation audit (PRESERVE-FIRST)

Twelve artifacts were re-hashed against the hashes recorded by A11.5/A12 **before any other work**:

| Artifact | Lines | SHA-256 (first 16) | vs recorded |
| :--- | :-: | :--- | :--- |
| `src/app/api/v1/mobile/dictionary/search/route.ts` | 125 | `5523860e48c88329` | IDENTICAL |
| `src/app/api/v1/mobile/dictionary/search/_lib.ts` | 130 | `b8a575399b8f9986` | IDENTICAL |
| `tests/mobile-dictionary-search-api.test.ts` | 1031 | `3159a7380a0633b1` | IDENTICAL |
| `tests/mobile-dictionary-search-api-live.test.ts` | 208 | `029c4331ee90f433` | IDENTICAL |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` | 946 | `5a8165e83385d4f1` | IDENTICAL |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-HARDENING.md` | 840 | `d26026298905ba7e` | IDENTICAL |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-CAPABILITY-EXPANSION.md` | 611 | `98ef6106a2868f09` | IDENTICAL |
| `reports/gates/GATE-A11-MOBILE-DICTIONARY-SEARCH-API.md` | 773 | `c114d3d1fe1d79d0` | IDENTICAL |
| `reports/gates/A11.5-DURABILITY-MANIFEST.md` | 269 | `3b6a86d92bde76d8` | IDENTICAL |
| `reports/gates/A11-TO-A12-HANDOFF.md` | 243 | `1040e109067ee03f` | IDENTICAL |
| `reports/gates/GATE-A11.5-DURABILITY-TRANSITION.md` | 524 | `728c8cfe7fb766c0` | IDENTICAL |
| `src/types/mobileDictionary.ts` | 353 | `aece3af08cb9300d` | IDENTICAL |

**Classifier result: PRESERVE — 12 IDENTICAL / 0 MODIFIED / 0 MISSING / 0 UNEXPECTED / drift 0 / 0
UNCERTAIN.** Nothing was restored from memory, regenerated, repaired or rewritten. The 32 ` M`
entries present at Gate 0 are the pre-existing session baseline (including the A2 comment-only
`schema.ts` and the Next-managed `next-env.d.ts` dev-form import); none was staged, reverted or
investigated as drift.

## §5 Dependency and environment audit

| Step | Result |
| :--- | :--- |
| `npm ci --no-audit --no-fund` | exit 0, 341 entries |
| Lockfiles after install | unchanged (`package-lock.json` not modified) |
| Disposable database | `disposable-postgresql-a13-e93ad355` on `127.0.0.1:5432` (data `/tmp/pg-a13`), loopback only |
| `npx drizzle-kit push --force` | exit 0 — schema created in the throwaway instance |
| Production contact | **none** (no request, no credential, no deploy command) |
| `DATABASE_URL` | per-command loopback only; never printed, never persisted |

Dependency inventory: 24 direct dependencies, **0 rate-limit / throttle / auth packages** (see §16).

## §6 Search pipeline — what the runtime actually does (D-12 foundation)

Traced on `DictionaryService.searchEntries` and confirmed by `EXPLAIN (ANALYZE, BUFFERS)`:

```
WHERE (4 OR'd ILIKE predicates incl. senses::text)  →  COUNT(*) [second scan, exact]
   →  ORDER BY (8-rank CASE + frequency_rank/is_common/id)  →  LIMIT / OFFSET
   →  1:1 publication overlay (replaces displayed values only)  →  stable exact-match re-sort
```

Facts established, all by measurement or source inspection:

1. **Sorting happens before the page is cut.** The `ORDER BY` is a global sort of the whole match set;
   `LIMIT/OFFSET` is applied afterwards.
2. **`total` is exact** and comes from a full second scan of the same predicate — there is no
   approximation and no cached count.
3. **The publication overlay is 1:1.** It substitutes displayed values (e.g. nulling
   `publicationStatus` on non-published rows); it never adds, drops or reorders rows for
   identity/ordering purposes. It *can* reduce the number of emitted DTO items on a page when
   non-published rows overlap it — measured: 50 raw rows → 29 emitted items at the deep offset of the
   broad class (LOCAL/DISPOSABLE/SYNTHETIC). The raw `LIMIT 50 OFFSET 100000` query returned 50.
4. **No post-limit filtering, no deduplication, no truncation** exists in the pipeline. This is what
   keeps the frozen `hasMore = offset + entries.length < total` invariant exact.
5. **Serialization is negligible.** Projection of 100 items: 1 ms; `JSON.stringify`: 0 ms; payload
   21 441 bytes.

## §7 D-4 — public identifier semantics

**DECISION.** Keep the canonical identifier verbatim; the opaque-alias variant stays unauthorized.
**EVIDENCE (STATIC, producer first).** `dictionary_entries.id` is `text("id").primaryKey()`
(`src/db/schema.ts:708`) — uniqueness and immutability are database-enforced. The producer is
deterministic: ``const id = `de-jmdict-${entSeq}` `` (`src/etl/dictionary/transformer.ts:263`); the
seed corpus uses hand-authored `de-*` ids. The projection is a pure pass-through: `id: row.id`
(`_lib.ts:61`) is the only occurrence of `id` in adapter or route; nothing derives, hashes, encodes or
truncates it, and no other module in the boundary reads it.
**MEASUREMENT.** Live, on the seeded corpus: `q=hon` → `["de-hon","de-nihon"]`; `q=a` → 29 ids in the
frozen tie-break order; two identical requests → byte-identical bodies (VERIFIED (test)).
**EXPECTED.** An id that is stable across requests, unique per row, and identical between service and
payload.
**ACTUAL.** Observed exactly that; the service output order and the payload order are the same id
sequence, and pagination windows are contiguous slices of it.
**VERDICT: PASS (KEEP VERBATIM).** The alternative (an opaque client id) was the only other option
recorded in the register and it is **not** authorized: it needs an alias table, i.e. a fifth migration.
**OWNER.** Mobile platform / API owner. **NEXT ACTION.** None; no code change. Re-open only with an
explicit migration authorization.

## §8 D-5 — resolved provenance display form

**DECISION.** Remains deferred; provenance must not be exposed.
**EVIDENCE (STATIC).** The constituent data exists — rows carry `source_ref`
(`dictionary_entries.sourceRef`), and `knowledge_sources` holds `id`, `name`, `license`, `url`,
`domain` — but **no module defines a resolved display form** (no formatter, no DTO field, no consumer).
Contract §6.1 forbids emitting the raw reference, and A10/A11 froze `sourceRef` as never-exposed.
**MEASUREMENT.** The audit in §20 finds 0 active references to `sourceRef` outside the never-expose
docblock and the guards that assert its absence.
**EXPECTED.** A display form (what the client shows a learner) that a producer generates, plus an
attribution/licence statement that survives review.
**ACTUAL.** No such producer exists; the decision is editorial/product, not derivable from the data.
**VERDICT: DEFERRED.** Blocking event: a defined display form. **OWNER.** Product/editorial owner with
the API owner; no engineering owner can close it from evidence alone.
**NEXT ACTION.** A14 may not expose provenance. D-9 stays blocked by this decision.

## §9 D-6 — localized gloss payload

**DECISION.** Remains deferred; `targetLanguage` stays validated and inert.
**EVIDENCE (RUNTIME).** `parseTargetLanguage` is called and its result deliberately discarded
(`route.ts`); the parsed value never reaches the service and is not echoed. A13 strengthened the proof
from *semantic* to *byte-level*: for `en`, `ta`, `ml`, `fr`, `english`, `""` and `" "` the response
**body text is byte-identical** and the options handed to the service are identical (VERIFIED (test)).
Absence of localization fields is additionally asserted (`localizedGlosses`, `glosses`).
**MEASUREMENT.** 7 variants compared on raw `res.text()`; 0 byte differences; 0 option differences.
**EXPECTED.** Either a provenance-safe translation read path or provable inertness. Only the latter is
achievable today (13.5C forbids wiring the translation storage primitive to an API route).
**ACTUAL.** Inertness holds at byte level; no read path exists.
**VERDICT: DEFERRED.** **OWNER.** Localization gate (13.5C owner). **NEXT ACTION.** A14 must not
implement localization without a producer; the byte-equality guarantee is now frozen and testable.

## §10 D-7 — keigo on a search item

**DECISION.** Remains deferred; no keigo field is added to the item.
**EVIDENCE (producer first).** A producer **does** exist, contrary to a read of the entry row alone:
`kanjiLexicalGraphService.getKeigoRelations(entryId)` returns `KeigoRelation[]` and is consumed by the
web route `GET /api/dictionary/entry/[id]` (`route.ts:60`, exposing `keigo`) — best-effort, degrading
to the canonical record on failure. It is a graph-layer derivation, not a stored column:
`dictionary_entries` has 12 columns and none relates to honourific register.
**MEASUREMENT.** Static trace of both call sites; no per-item cost measurement exists, and the
declared mobile shape (`MobileSwipeSectionKeigo`: `standardForm`, `teineigo[]`, `sonkeigo[]`,
`kenjougo[]`, optional `businessExample`) is an **object**, while the producer returns an **array** —
a mapping decision, not a rename.
**EXPECTED.** A producer, a shape decision and a per-item cost budget before any item field is frozen.
**ACTUAL.** Producer present; shape mismatch and cost unresolved.
**VERDICT: DEFERRED.** **OWNER.** Mobile payload owner with the lexical-graph owner. **NEXT ACTION.**
A14 may adopt keigo only after the shape decision and a cost measurement are recorded.

## §11 D-8 — audio (`hasAudio` / `audioUrl`)

**DECISION.** Remains deferred; no audio field on the item.
**EVIDENCE (STATIC).** No dictionary audio producer exists: `dictionary_entries` has no audio column,
no audio table exists in `src/db/schema.ts`, and the only `audioUrl` occurrences belong to the quiz
`questions` resource family (`src/app/api/questions/route.ts`) — a different resource, explicitly out
of this contract. `hasAudio`/`audioUrl` appear in the mobile types and in the never-expose docblock
that records the absence.
**MEASUREMENT.** Inventory of 27 tables: 0 audio-bearing dictionary objects.
**EXPECTED.** A stored or generated per-entry audio asset with provenance.
**ACTUAL.** None.
**VERDICT: DEFERRED.** **OWNER.** Content/provenance owner. **NEXT ACTION.** No A14 work without a
producer.

## §12 D-9 — entry-detail DTO and endpoint (producer matrix)

**DECISION.** **Not frozen.** A detail contract cannot be written from current storage; a subset
contract is *deliberately* not frozen by A13 either, because doing so now would create a second
divergent detail contract that a later gate must reconcile — exactly the trap A12 recorded for the
declared-but-unproduced types.
**EVIDENCE (producer trace, field by field).** `MobileDictionaryDetailResponse` declares 17 field
groups. Traced against storage, ETL and services:

| Field group | Producer | Status |
| :--- | :--- | :--- |
| `id`, `headword`, `reading`, `romaji`, `jlptLevel`, `isCommon` | `dictionary_entries` (12 columns) | producible today |
| `meanings` | `senses` jsonb → `glosses`, `note` | partial: `order`, `contextTags` have no source; `localizedGlosses` has no read path |
| `kanjiList` | `kanji_entries` (character, meaning, `readingsKun/On`, `strokeCount`, `primaryRadicalId`), `kanji_radicals`, `getVocabularyKanji` | partial: `strokeOrderSvgUrl`/`visualAsset` need the KanjiVG import, which is 14.4D and blocked |
| `keigo` | `getKeigoRelations` → `KeigoRelation[]` (array) | produced, **different shape** from the declared object |
| `exampleSentences` | `example_sentences` + `dictionary_entry_ids` link; web route exposes `sentences` | partial: link model exists, no mobile read path |
| `provenance.sourceId/license/attribution` | `knowledge_sources` + row `source_ref` | partial: display form is D-5, unresolved |
| `alternativeHeadwords`, `alternativeReadings` | **none persisted** — only the ETL in-memory `TransformedDictionaryEntry` (`transformer.ts`, `src/etl/dictionary/types.ts`); the persisted canonical record omits them and `dictionary_entries` has no such column | **not readable** without new storage |
| `conjugations` | none — the word appears only in quiz prose | out of scope |
| `synonyms`, `antonyms`, `phrases`, `collocations` | none — declared in `src/types/mobileDictionary.ts` only | out of scope |
| `userState`, `srsStatus` | storage only (`srs_*`, `user_id` default `anonymous-user`) | needs an attributable identity; D-13 deferred, route has no auth |
| `localizedGlosses`, `isKeigo`, `keigoType`, `hasAudio`, `audioUrl` | none (§§9–11) | out of scope |

**MEASUREMENT.** Verified against `src/db/schema.ts` (27 tables, `dictionary_entries` = 12 columns),
`src/etl/dictionary/transformer.ts`, `src/services/knowledge/kanjiLexicalGraphService.ts`,
`src/app/api/dictionary/entry/[id]/route.ts` and `src/types/mobileDictionary.ts`.
**EXPECTED.** Every field of a frozen detail payload traceable to a producer.
**ACTUAL.** 4 field groups have no producer at all, 2 are blocked by identity/D-5, 5 are partial, and
2 declared ETL fields were never persisted.
**VERDICT: DEFERRED — BLOCKED by D-5.** Blocking event: D-5 resolution (plus new storage for the
alternative headword/reading fields, which A13 does not authorize). This is the only BLOCKED verdict
in the gate; every other deferral has an owner but no unavailable evidence.
**OWNER.** API owner (contract), with the lexical-graph owner for kanji/keigo mapping.
**NEXT ACTION.** A14 may implement a detail endpoint **only** if a detail contract has been frozen
first, over a deliberate subset, never generated from the declared type.

## §13 D-10 — richer filters

**DECISION.** Remains deferred.
**EVIDENCE.** The service signature accepts exactly `query`, `jlptLevel`, `isCommon`
(`searchEntries`) — no `partsOfSpeech`, `hasKanji`, `hasExamples` or `register` filter exists. The
*data* for some of them does exist (`parts_of_speech`, `tags` jsonb columns; `kanji_characters`), so
the gap is plumbing plus a frozen filter contract, not missing storage.
**MEASUREMENT.** Static inspection of the only search entry point; the route parses `level|jlpt` and
`common` only.
**EXPECTED.** A filter with a defined semantics, an index/scan story and a frozen parameter name.
**ACTUAL.** Adding one changes the frozen search surface — expressly outside A13 authority.
**VERDICT: DEFERRED.** **OWNER.** Search/API owner. **NEXT ACTION.** Any A14 filter needs its own
decision record *and* a performance measurement, because the current predicate is already a full scan.

## §14 D-11 — `warnings` / offline self-description

**DECISION.** Remains deferred.
**EVIDENCE.** No producer of warning or offline-manifest data exists for the dictionary surface; the
retired `warnings` envelope field was retired by A9 decision 8 and is asserted absent. Offline dataset
semantics are declared in `src/types/mobileDictionary.ts` (`MobileSyncDatasetManifest`) with no
implementation and are client-owned.
**MEASUREMENT.** §20 audit: `warnings` has 0 active references; only retirement documentation and the
absent-key guard.
**EXPECTED.** A producer before a field.
**ACTUAL.** None.
**VERDICT: DEFERRED.** **OWNER.** Mobile client owner. **NEXT ACTION.** Not an A14 item.

## §15 D-12 — deep pagination and performance (measured)

All measurements **LOCAL / DISPOSABLE / SYNTHETIC**: 100 000 generated rows (`de-synth-*`, ids chosen
so they can never be confused with seed rows) on top of the 30-row seed corpus = **100 030 rows**,
seeded in 982 ms; the synthetic rows were deleted at the end of every probe (final state: 30 rows).

**A. Class × offset (ms), limit 50 unless noted**

| Class | offset | count | rows | service | returned | total |
| :--- | --: | --: | --: | --: | --: | --: |
| tiny (1 match) | 0 | 421 | 425 | 1 278 | 1 | 1 |
| tiny | 1 000 | 437 | 385 | 805 | 0 | 1 |
| tiny | 10 000 | 375 | 373 | 781 | 0 | 1 |
| tiny | 50 000 | 387 | 376 | 775 | 0 | 1 |
| tiny | 100 000 | 383 | 395 | 778 | 0 | 1 |
| moderate (kanji) | 0 | 306 | 305 | 760 | 50 | 20 001 |
| moderate | 1 000 | 305 | 305 | 757 | 50 | 20 001 |
| moderate | 10 000 | 306 | 312 | 842 | 50 | 20 001 |
| moderate | 50 000 | 310 | 312 | 764 | 0 | 20 001 |
| moderate | 100 000 | 306 | 310 | 779 | 0 | 20 001 |
| large (broad latin) | 0 | 240 | 255 | 991 | 50 | 100 029 |
| large | 1 000 | 238 | 263 | 1 007 | 50 | 100 029 |
| large | 10 000 | 245 | 269 | 1 102 | 50 | 100 029 |
| large | 50 000 | 240 | 291 | 1 129 | 50 | 100 029 |
| large | 100 000 | 238 | 295 | 1 195 | 29 | 100 029 |

**B. Limit sensitivity (large class)**

| limit | offset | rows | service |
| --: | --: | --: | --: |
| 1 | 0 | 268 | 995 |
| 1 | 100 000 | 302 | 1 190 |
| 50 | 0 | 258 | 998 |
| 50 | 100 000 | 298 | 1 170 |
| 100 | 0 | 258 | 994 |
| 100 | 100 000 | 299 | 1 205 |

**C. `EXPLAIN (ANALYZE, BUFFERS)`**

| Case | Plan facts | Execution |
| :--- | :--- | --: |
| large, offset 0, limit 50 | Seq Scan, `rows=100 029`, top-N heapsort 38 kB | 332 ms |
| large, offset 100 000, limit 50 | **external merge, 20 224 kB written to disk**, temp buffers read 2 528 / written 2 534 | 444 ms |
| moderate, offset 10 000, limit 100 | external merge 4 016 kB | 338 ms |
| tiny, offset 0, limit 50 | 100 029 rows removed by filter, quicksort 17 kB | 383 ms |

**D. Interpretation.** Cost is dominated by the `ILIKE '%…%'` scan — four OR'd predicates including
`senses::text`, none of them indexable by a btree — and it is paid **twice per request** (count + page).
`offset` is a near-flat penalty (≈ +30–45 ms rows, ≈ +195 ms service); `limit` changes nothing
measurable. There is **no offset cliff** inside the frozen `0…100 000` window: the worst measured case
is 1.2 s service time. Sorting is the second-order cost and only becomes disk-backed for large match
sets at deep offsets.

**Index feasibility (measured, never applied).**

* `CREATE EXTENSION pg_trgm` **fails in this `PGlite` build** (`Failed query`), so no GIN/trigram index
  could be built or measured. Trigram feasibility is therefore **EXTERNALLY BLOCKED** in this
  environment and is not claimed either way.
* A btree on the sort key `(frequency_rank ASC NULLS LAST, is_common DESC, id ASC)` (3 984 kB, created
  and dropped inside the throwaway instance only) helps exactly one case: **offset 0, 263 → 46 ms**
  (plan switches to Index Scan with a filter). At offset 100 000 it does nothing (326 → 353 ms; the
  external merge persists). Its downside cases: a 1-match query went 382 → 426/445 ms, and broad deep
  offsets were unchanged within noise. Conclusion: a sort-key index is a first-page latency candidate
  **only**; it is not a deep-pagination fix, and A13 does **not** authorize it.

**VERDICT: DEFERRED (measured).** No cursor pagination, no index, no schema change, no SQL change was
made or recommended as necessary. **OWNER.** API owner for any future pagination redesign.
**NEXT ACTION.** A14 may add an index only with its own authorization and a before/after measurement
on a representative corpus; the evidence above is the baseline such a decision must beat.

## §16 D-13 — rate limiting and abuse protection

**DECISION.** Remains deferred to the deployment layer (**Option B** upheld). No limiter is invented.
**EVIDENCE (STATIC).**

| Probe | Result |
| :--- | :--- |
| `route.ts` files under `src/app/api` | 73 |
| Mobile dictionary routes | **1** (the frozen search route) |
| `middleware.ts` (root or `src/`) | none |
| Direct dependencies | 24 — **0** rate-limit/throttle/auth packages |
| Rate-limit / auth code in the boundary | none (no `authorization`, `apiKey`, `rateLimit`, `429`, `Retry-After`) |
| `vercel.json` | absent |
| Deployment security config (`next.config.ts`) | none for rate limiting or headers |

**MEASUREMENT (A13, new — the residual cost is now quantified).** On 100 030 rows, one request at the
cap costs (count / service): 1 000 latin chars **4 381 / 9 145 ms**; 1 000 wildcard characters
**8 380 / 17 059 ms** (escaping doubles the pattern); 1 000 NUL-padded chars **4 374 / 9 046 ms**.
This reproduces A12's measurement on an independent instance (8.9/16.9 s → 9.1/17.1 s), so the figure
is stable, not a fluke. The `q` cap bounds *per-request* work; it does **not** make the endpoint cheap,
and it is **not** abuse protection.
**EXPECTED.** Either an enforced limiter with an owner and a response contract, or an explicit
delegation with the residual risk recorded and no false claims of protection.
**ACTUAL.** Delegation is recorded in contract §A12.7; nothing in the application enforces a limit;
no code claims otherwise.
**VERDICT: DEFERRED — DEPLOYMENT GATE.** **OWNER.** Deployment/platform owner (Vercel/Supabase
configuration is outside A13 and outside the session's authority).
**NEXT ACTION.** A14 may implement deployment security controls **only** if explicitly authorized;
until then the endpoint stays not-approved for production exposure.

## §17 D-14 — `q` cap adequacy (behaviour ladder + cost ladder)

**DECISION.** The cap (1 000 UTF-16 code units, implemented by A12) is adequate and stays unchanged.
**EVIDENCE (RUNTIME, VERIFIED (test)).** The cap was re-measured as a ladder over input classes A12
did not cover:

| Rung | Behaviour |
| :--- | :--- |
| empty / NUL-only / whitespace-only / mixed padding (≥1 500 chars) | `400 MISSING_QUERY` — sanitize precedes both emptiness and length |
| padding around content, 2 000 NULs + 1 000 chars | `200`, service receives exactly the 1 000-char content |
| Tamil / Malayalam / Japanese kana / Japanese kanji at 1 000 | `200`, echoed intact, service receives the full string |
| the same at 1 001 | `400 VALIDATION_ERROR`, service never called |
| 500 astral characters (1 000 code units) / 501 | `200` / `400` — UTF-16 units, not code points |
| 1 000 `%` wildcards | same cap as any other class (matching semantics unchanged: `escapeLikePattern`) |
| 100 000 chars | `400` before the service |
| over-cap rejection body | byte-exact frozen error, no fragment of the input, no `details`/`stack` |

**MEASUREMENT (A13 cost ladder, LOCAL / DISPOSABLE / SYNTHETIC, 100 030 rows, count/service ms):**
1 char broad **82 / 648**; 100 latin **760 / 1 537**; 999 latin **4 419 / 8 897**; 1 000 latin (cap)
**4 381 / 9 145**; 1 000 wildcards **8 380 / 17 059**; 1 000 NUL-padded **4 374 / 9 046**.
Cost is linear in pattern length, paid twice per request; the worst class is 2× the plain class because
escaping doubles the pattern.
**EXPECTED.** A cap that (a) is judged on the sanitized value, (b) rejects rather than truncates,
(c) behaves identically across scripts, (d) keeps the frozen error envelope, (e) bounds worst-case work.
**ACTUAL.** All five hold; the bound is ~9 s of database work per request at the cap on a 100 k corpus
— bounded but not cheap, which is precisely why §16 keeps D-13 open.
**VERDICT: PASS.** **OWNER.** API owner (implemented); deployment owner for the residual (§16).
**NEXT ACTION.** None. The behaviour ladder is now covered by tests (§19).

## §18 Ordering semantics — a contract description refined by runtime evidence

**DECISION.** Refine the contract's description of *where* exact-match promotion happens; change no
behaviour.
**EVIDENCE (RUNTIME, highest order; conflicts with the literal reading of a frozen sentence).**
Contract §5 describes the pipeline ending in a "stable exact-match re-sort", which read literally
places promotion *after* `LIMIT/OFFSET`. Runtime inspection of `searchEntries` shows promotion is a
global rank inside the SQL `ORDER BY`: an 8-rung `CASE` (headword exact with/without a real JLPT
level, reading exact with/without, `lower(romaji)` exact, `senses` quoted match with/without `isCommon`)
followed by `frequency_rank ASC NULLS LAST, is_common DESC, id ASC`. The trailing JavaScript `sort`'s
predicate is a **strict subset** of ranks 1–5, so within any page it is a stable, order-preserving
no-op.
**MEASUREMENT.** Live, seeded corpus: `q=hon` → `["de-hon","de-nihon"]`, where `de-hon` is a rank-5
romaji-exact match with `frequency_rank` 150 and `de-nihon` is a rank-8 substring match with
`frequency_rank` 90 — frequency order alone would invert them, so the rank demonstrably wins. `q=a`
(no exact match exists in the class, asserted as a premise) → 29 rows in pure tie-break order, matched
against an independently computed sort; 6 successive pages are exact slices of that order; two
identical requests produce byte-identical bodies.
**EXPECTED.** A client-visible order that is deterministic, total and stable across pages.
**ACTUAL.** Exactly that, by a global SQL rank rather than a post-page pass.
**CONFLICT RESOLUTION.** Recorded, not silently overridden: contract §5's literal wording is refined by
the appended `§A13.1`, quoting the old sentence rather than editing it (evidence order puts runtime
above the contract text). No "conflicting" behaviour was found; the contract's *consequence* statement
(exact matches come first) was already correct.
**VERDICT: PASS (documentation deepened; behaviour unchanged).**
**OWNER.** API contract owner. **NEXT ACTION.** None; the enriched statement is frozen and tested.

## §19 Tests added (and why no new test file was needed)

The brief allowed `tests/mobile-dictionary-a13-readiness.test.ts` **only if existing tests could not
prove the decisions**. They could not prove three things, and those three were added to the files that
own them, rather than to a new gate-shaped file:

| Test | File | Proves |
| :--- | :--- | :--- |
| cap ladder across Tamil/Malayalam/kana/kanji at 1 000 and 1 001 | mocked suite | D-14 script-independence |
| astral input counted as two code units **on the wire** (500 / 501) | mocked suite | D-14 UTF-16 unit convention end-to-end |
| NUL-only, whitespace-only, mixed padding → `MISSING_QUERY`; padding around content stripped | mocked suite | sanitize-before-judge ordering |
| over-cap mixed-script rejection leaks no input fragment, no `details`/`stack` | mocked suite | D-13/D-9 leakage |
| byte-identical body + identical service options across 7 `targetLanguage` values | mocked suite | D-6 inertness at byte level |
| exact match promoted above a **better-ranked** row on real data (`q=hon`) | live suite | §18 ordering, D-4 id pass-through |
| full real page in frozen tie-break order; pages are slices; byte determinism | live suite | pagination/order safety (D-12 baseline) |

Executed counts: mocked suite **59 → 64**, live suite **7 → 9** (+7 total). No assertion was weakened,
renamed or deleted; the change is purely additive. Per the standing rule that database-dependent tests
stay separate, the ordering tests live in the live (disposable-database) file, and the cap/inertness
tests in the DB-free file.

## §20 Stale-term and never-expose audit (17 terms)

Terms audited: `queryEcho`, `results`, `matchType`, `jlptKnown`, `page`, `returned`, `apiVersion`,
`meta`, `warnings`, `pagination`, `totalResults`, `executionTimeMs`, `sourceRef`, `frequencyRank`,
`partsOfSpeech`, `tags`, `ent_seq`.

Classification of every hit in the mobile surface (route, adapter, declared types, both test files):

| Term | Hits | Classification |
| :--- | --: | :--- |
| `queryEcho`, `results`, `returned`, `apiVersion`, `meta`, `warnings`, `pagination`, `totalResults`, `executionTimeMs` | 1–24 | **RETIREMENT DOCUMENTATION** (docblocks that record the retirement; note `page`/`pagination`/`meta` also match unrelated words such as "page-local" and "pagination bounds") + **TEST ASSERTION** (each is asserted absent from `data`) |
| `sourceRef`, `frequencyRank`, `partsOfSpeech`, `tags`, `ent_seq` | 2–10 | **RETIREMENT DOCUMENTATION** + **TEST ASSERTION** — all five are in `ROW_ONLY_KEYS` and asserted absent from every item; `senses` and internal ids likewise |
| `jlptKnown` | 2 | **TEST ASSERTION** (`not.toHaveProperty("jlptKnown")`) + docblock |
| `matchType` | **0** | none — covered **structurally**: the item key set and the `data` key set are asserted *exactly*, so an unforeseen key cannot ride along |

**ACTIVE: 0.** No retired or never-expose term is produced, emitted or consumed anywhere in the mobile
boundary. The strongest guard is structural rather than enumerated: `Object.keys(body)` = `["data",
"success"]`, `Object.keys(body.data)` = the 8 frozen keys, `Object.keys(entry)` = the 9 frozen keys —
all asserted exactly, plus the A12 `DETAIL_ONLY_KEYS` (20 keys) and `ROW_ONLY_KEYS` (8 keys) guards.

## §21 Web API isolation

| Check | Result |
| :--- | :--- |
| `src/app/api/dictionary/**` modifications | **0** |
| Web search route shape | untouched (still carries `sourceRef`/`senses`/`frequencyRank`, no `hasMore`) |
| Web entry-detail route | untouched (read only, as D-7/D-9 evidence) |
| Modified `src/app` paths | none created by A13 (the two untracked mobile files date from A11/A12) |
| Frozen `route.ts` / `_lib.ts` | hashes unchanged: `5523860e48c88329` (125 L) / `b8a575399b8f9986` (130 L) |

## §22 Schema, migration and index status

* Migrations: **4** (`0000`–`0003`), unchanged; no migration created.
* `src/db/schema.ts`: unchanged by A13 (its pre-existing ` M` state is the A2 comment-only baseline).
* Indexes: **none added**. The sort-key btree and the trigram attempt (§15) were created and dropped
  inside the disposable instance only; nothing was written to `schema.ts` or `drizzle/`.
* SQL: no production SQL executed; disposable-loopback only.
* Verification: the app was never run against a non-loopback database.

## §23 Regression

| Metric | Baseline | A13 final |
| :--- | :--- | :--- |
| Test files | 56 | **56** |
| Executed | 1 137 (A13 brief) / 1 141 (A12 fifth issuance, measured) | **1 148** |
| Failed | 0 | **0** |
| Skipped | 55 | **55** |
| Total | 1 192 / 1 196 (measured) | **1 203** |

Arithmetic check: 1 203 − 55 = 1 148 executed; 1 141 + 7 = 1 148 (the seven A13 additions);
1 196 + 7 = 1 203. Skips unchanged at 55 → the A6 corpus tier skip set is intact, no test was skipped
to obtain green. **NEW FAILURES: 0. NEW SKIPS: 0.** `npx tsc --noEmit`: no diagnostics.
`npm run lint`: 0 errors / 4 warnings (unchanged pre-existing warnings).

## §24 REQUIRED OUTPUT BLOCK

```
STATUS: GATE A13 COMPLETE — DECISION/EVIDENCE GATE, NO IMPLEMENTATION
BASELINE (as recorded): 56 files / 1137 executed / 0 failed / 55 skipped / 1192 total
BASELINE (A12 fifth issuance, measured in-session): 56 / 1141 / 0 / 55 / 1196
FINAL: 56 files / 1148 executed / 0 failed / 55 skipped / 1203 total
NEW FAILURES: 0
NEW SKIPS: 0
D-4  KEEP VERBATIM ID ........... PASS (decision closed; opaque alias DEFERRED, needs a migration)
D-5  provenance display ......... DEFERRED (no display form exists; owner product/API)
D-6  localized glosses .......... DEFERRED (byte-level inertness proven; owner localization gate)
D-7  keigo on item .............. DEFERRED (producer exists; shape mismatch + cost unresolved)
D-8  audio ...................... DEFERRED (no dictionary audio producer)
D-9  detail contract ............ DEFERRED — BLOCKED by D-5 (4 field groups have no producer)
D-10 richer filters ............. DEFERRED (no filter plumbing; search-surface change unauthorized)
D-11 warnings / offline ......... DEFERRED (no producer; client-owned)
D-12 deep pagination ............ DEFERRED (measured; no cursor, no index, no schema change)
D-13 rate limiting .............. DEFERRED — DEPLOYMENT GATE (Option B; residual cost quantified)
D-14 q cap ...................... PASS (implemented by A12; re-verified + ladder extended by A13)
PRODUCTION: NOT CONTACTED
PRODUCTION EVIDENCE: NOT AVAILABLE IN A13 / LOCAL/DISPOSABLE EVIDENCE ONLY
SCHEMA / MIGRATION / INDEX CHANGES: 0
WEB API CHANGES: 0
MOBILE ROUTE INVENTORY: 1 (unchanged)
CONTRACT: 946 → 1042 lines (# A13 appended), sha256 3e56b84b8b393fab…
FROZEN ARTIFACT DRIFT: 0 of 12 (PRESERVE; hash 12/12 IDENTICAL)
COMMIT DURABILITY: NOT VERIFIED — path + content + SHA-256 is the durable identity
HARD STOP: NO A14 IMPLEMENTATION STARTED
```

## §25 Contract change record

The contract was appended to (never rewritten): **946 → 1 042 lines**, `sha256 3e56b84b8b393fab…`.
Appended sections: `# A13 — PRODUCTION-READINESS CONFIRMATION` containing §A13.1 (ordering mechanism,
refining §5 by quotation), §A13.2 (guarantees verified: byte-inertness, script-independent cap,
sanitize order, no payload echo, structural absence of retired terms), §A13.3 (declared detail fields —
producer status, explicitly *not* a detail contract), §A13.4 (status after A13, listing exactly which
earlier statements are superseded/refined). All A10/A11/A12 text remains verbatim; the only earlier
statement refined is the pipeline clause of §5, and it is quoted rather than edited.

## §26 Artifact identity after A13

| Artifact | Lines | SHA-256 (first 16) | Changed by A13 |
| :--- | :-: | :--- | :--- |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` | 1 042 | `3e56b84b8b393fab` | yes (append-only) |
| `tests/mobile-dictionary-search-api.test.ts` | 1 180 | `8d258fb1d049c3c6` | yes (+5 tests) |
| `tests/mobile-dictionary-search-api-live.test.ts` | 307 | `a787c36bcd42fd1f` | yes (+2 tests) |
| `.../search/route.ts` | 125 | `5523860e48c88329` | **no** |
| `.../search/_lib.ts` | 130 | `b8a575399b8f9986` | **no** |
| `src/types/mobileDictionary.ts` | 353 | `aece3af08cb9300d` | **no** |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-HARDENING.md` | 840 | `d26026298905ba7e` | no |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-CAPABILITY-EXPANSION.md` | 611 | `98ef6106a2868f09` | no |
| `reports/gates/GATE-A11-MOBILE-DICTIONARY-SEARCH-API.md` | 773 | `c114d3d1fe1d79d0` | no |
| `reports/gates/A11.5-DURABILITY-MANIFEST.md` | 269 | `3b6a86d92bde76d8` | no |
| `reports/gates/A11-TO-A12-HANDOFF.md` | 243 | `1040e109067ee03f` | no |
| `reports/gates/GATE-A11.5-DURABILITY-TRANSITION.md` | 524 | `728c8cfe7fb766c0` | no |

New in A13: this report and `reports/gates/A13-TO-A14-HANDOFF.md`.
`LOCAL INFORMATIONAL HASH — NOT DURABLE UNLESS VERIFIED`: the session's git layer re-clones at
`cfe565d` every turn, so paths, line counts and hashes are the durable identity — never a commit hash.

## §27 Production status

**PRODUCTION EVIDENCE: NOT AVAILABLE IN A13 / LOCAL/DISPOSABLE EVIDENCE ONLY.**
No request was made to `nihingobridge.vercel.app` or any production service; no Vercel or Supabase
configuration was read or changed; no deployment was performed; no secret or `DATABASE_URL` was printed
or persisted. Every measurement in §15/§17 came from a loopback `PGlite` instance seeded for this gate
and is labelled as such. **No local measurement is presented as a production fact.**

## §28 Measurable thresholds for the deployment gate (proposed, not owned)

A13 was asked to define measurable security thresholds rather than vague intent. These are **proposed
for the deployment gate to accept or reject**; they are not enforced anywhere and are not claims of
protection. Basis: §16/§17 measurements (one request at the cap = 9.1 s plain / 17.1 s wildcard of
database CPU on a 100 030-row corpus, two scans per request).

| # | Threshold | Measurable form |
| :-: | :--- | :--- |
| T1 | Concurrent search requests per instance | a hard cap, so aggregate worst-case database CPU cannot exceed `cap × 17.1 s` |
| T2 | Sustained request rate per client identity | a token-bucket rate with a documented burst, enforced at the edge (not in-process) |
| T3 | Over-limit behaviour | `429` with `Retry-After`, before the route is entered, and never a partial payload |
| T4 | Fails closed | if the limiter is unavailable, the endpoint must not silently become unlimited |
| T5 | p95 latency budget | measured under T1/T2 on a representative corpus; today's baseline is 0.6–1.2 s service time for normal classes, 9–17 s for cap-length input |
| T6 | Detection | alert on sustained `q` near the cap plus sustained 17 s-class service times |

Until T1–T4 have an owner and an enforced implementation, the endpoint remains **not approved for
production exposure**.

## §29 Risk register and open tensions

| # | Risk / tension | Status |
| :-: | :--- | :--- |
| R-1 | Unauthenticated endpoint whose worst case is ~17 s of database CPU per request | **OPEN** — D-13 deferred to the deployment gate; quantified in §16; not mitigated in-app by design |
| R-2 | Full-scan `ILIKE` predicate paid twice per request; trigram feasibility unmeasurable here | **OPEN** — externally blocked in `PGlite`; §15 records the sort-key index as a first-page-only candidate |
| R-3 | Deep offset (100 000) with a large match set writes a 20 MB disk sort | **OPEN, bounded** — 444 ms in the worst measured case; no cliff inside the frozen window |
| R-4 | Declared detail fields with no producer could be mistaken for a specification | **CONTAINED** — §12 matrix + §A13.3 + the A12 `DETAIL_ONLY_KEYS` guards |
| R-5 | `alternativeHeadwords`/`alternativeReadings` exist in ETL types but were never persisted | **RECORDED** — would need new storage; not authorized |
| R-6 | Session commits are absent from the git layer each turn | **RECORDED** — identity is path + content + SHA-256; `COMMIT DURABILITY: NOT VERIFIED` |
| R-7 | Untracked-entry count reads 39–43 across gates for the same tree | **DOCUMENTED VARIANCE** — all 43 enumerated and absent from HEAD; no file gained or lost (§3) |

## §30 Boundary compliance — what A13 did **not** do

No search-semantics redesign; no `SearchScript`/`detectedScript` change; no reintroduction of
`queryEcho`, `matchType`, `jlptKnown` or `page`; no id semantics change; no exposure of `ent_seq`,
`sourceRef`, provenance, `frequencyRank`, `partsOfSpeech` or `tags`; no detail endpoint, localization,
auth, rate limiting or cursor pagination implemented; no schema, migration, index or SQL change; no web
dictionary change; no corpus ingestion (Tatoeba/KanjiVG/JMdict/KANJIDIC2 untouched, `data/tatoeba/*`
unmodified); no 14.4D/14.4E/14.5A/14.5B activity; no production contact; no Vercel/Supabase/env change;
no push; no reset/clean/checkout/cherry-pick/merge/rebase/amend/rewrite; no prior gate report deleted;
nothing staged outside the authorized path list. Temporary probe files created for measurement were
deleted (`tests/tmp-a13-*.test.ts` → 0 remaining), and the disposable instance's synthetic rows were
removed (100 000 deleted; final row count 30).

**Staging rule observed.** Path-specific staging only: this report, the A13 handoff, the two modified
test files and the appended contract — and `git diff --cached --name-only` is verified against that
list before the commit is made.

## §31 Handoff to A14 (summary; authoritative document: `reports/gates/A13-TO-A14-HANDOFF.md`)

A14 may implement only explicitly approved A13 decisions. Concretely: **nothing in the D-register is
approved for implementation** except the already-implemented D-14, which A13 re-verified. D-4 is
decided (keep verbatim) and needs no code. D-9 must not be implemented before a detail contract is
frozen over a deliberate, producer-backed subset. D-12 and D-13 need their own authorization
(index/schema work; deployment controls) before any change. The most valuable A14 moves, in evidence
order: (1) freeze a producer-backed detail contract for the subset in §12 if the product need is
confirmed; (2) resolve D-5 (a display form) since it blocks D-9; (3) obtain an authorization decision
on the deployment security controls with T1–T4 accepted or rejected.

## §32 Conclusion

Gate A13 confirms the frozen mobile search surface is internally consistent, leak-free under a 17-term
audit, script-independent at its input cap, byte-stable with respect to `targetLanguage`, and
performance-bounded inside its frozen pagination window — with the residual abuse risk explicitly
owned by a deployment gate that A13 cannot close. The one substantive error found was in *prose*, not
behaviour: the contract described exact-match promotion as a post-page re-sort, while the runtime
promotes globally in SQL. That description is refined by appended contract text, the behaviour is
unchanged, and the guarantee is now covered by tests on real data. Nothing was implemented; nothing was
weakened; nothing was claimed about production.

```
STATUS: GATE A13 COMPLETE — DECISION/EVIDENCE GATE, NO IMPLEMENTATION
FINAL: 56 files / 1148 executed / 0 failed / 55 skipped / 1203 total
NEW FAILURES: 0
NEW SKIPS: 0
PRODUCTION: NOT CONTACTED
PRODUCTION EVIDENCE: NOT AVAILABLE IN A13 / LOCAL/DISPOSABLE EVIDENCE ONLY
SCHEMA / MIGRATION / INDEX CHANGES: 0
WEB API CHANGES: 0
COMMIT DURABILITY: NOT VERIFIED — path + content + SHA-256 is the durable identity
HARD STOP: NO A14 IMPLEMENTATION STARTED
```
