# GATE A11 — MOBILE DICTIONARY SEARCH API IMPLEMENTATION

**Gate:** A11 (implementation)
**Date:** 2026-09-24
**Branch:** `arena/01a0d21c-nihingobridgeupgrade`
**Route:** `GET /api/v1/mobile/dictionary/search`
**Verdict:** **PASS WITH CONDITIONS** (§28)

A11 implemented the single read-only mobile dictionary **search** endpoint frozen by A9 and A10.
It is an adapter over the existing dictionary search infrastructure: no second search engine, no web
behaviour change, no schema change, no new dependency. Nothing in A9/A10 was redesigned, and no
semantic decision was made silently.

---

## 1. Gate identity

| Item | Value |
| :--- | :--- |
| Gate | A11 — Mobile Dictionary Search API Implementation |
| Type | **Implementation** (not a design gate) |
| Input contract | `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` — A9 freeze + A10 implementation-readiness freeze |
| Output | one route, one co-located adapter module, two test suites, contract §A11, this report |
| Authorized scope | exactly one read-only route (`/api/v1/mobile/dictionary/search`) |

---

## 2. Gate 0 baseline

Measured before any A11 write (§0.1 PRESERVE-FIRST record).

| Item | Measured value |
| :--- | :--- |
| `git status --short` | 33 `??` + 31 `M` = **64 entries** |
| `git branch --show-current` | `arena/01a0d21c-nihingobridgeupgrade` |
| `git rev-parse HEAD` | `cfe565d58ec4f6902c9f00bba491827ab303a53d` |
| `git rev-parse origin/main` | `cfe565d58ec4f6902c9f00bba491827ab303a53d` |
| `git rev-list --left-right --count HEAD...origin/main` | `0  0` |
| `git reflog --date=iso -20` | `clone` (11:50:06) + `checkout` (11:50:07) only |
| `node_modules` | **0 entries** |
| Mobile route trees under `src/app/api` | **none** (`find` for `*v1*`/`*mobile*` → empty) |
| Database | no `:5432` listener at Gate 0 |
| Production contact | none |

**`.git` history reset again (7th consecutive turn).** The A10 commit `23ba543` is **ABSENT as an
object** (`git cat-file -t` → `fatal: Not a valid object name`). This is not treated as a
deliverable loss: the A9/A10 files persist as working-tree content, which §0.1 makes authoritative.
No recovery, reset, clean, restore, cherry-pick or history rewrite was attempted.

---

## 3. A9/A10 artifact verification

All expected artifacts verified **present and non-empty** by path and line count (not assumed):

| Artifact | Lines | Status |
| :--- | ---: | :--- |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` | 644 → **763** | A9 body + A10 `§A10.1–§A10.18` verified §2, then A11 §A11.1–§A11.8 appended |
| `src/types/mobileDictionary.ts` | 353 | frozen request/item/envelope types read and implemented against |
| `tests/mobile-api-implementation-readiness.test.ts` | 360 | A10 pins, preserved unmodified, still green |
| `reports/gates/GATE-A10-MOBILE-API-IMPLEMENTATION-READINESS.md` | 616 | present |
| `tests/mobile-payload-design-freeze.test.ts` | 370 | A9 pins, preserved unmodified, still green (18) |
| `tests/mobile-dictionary-script-contract.test.ts` | 235 | preserved unmodified, still green (35) |
| `tests/mobile-dictionary-payload-contract.test.ts` | 338 | A8 pins, preserved unmodified, still green (14) |
| `reports/gates/GATE-A9-MOBILE-PAYLOAD-DESIGN-DECISIONS.md` | 340 | present |

The frozen A10 section was **read in full** before implementation (not implemented from memory):
transport §A10.1, parameters §A10.2, defaults §A10.3, limits §A10.4, identifier §A10.5, projection
§A10.6, detail §A10.7, JLPT §A10.8, pagination §A10.9, `hasMore` §A10.10, axes §A10.11, glosses
§A10.12, warnings §A10.13, auth §A10.14, rate limiting §A10.15, errors §A10.16, deferrals §A10.17,
A11 boundaries §A10.18.

---

## 4. Repository preservation audit

| Rule | Outcome |
| :--- | :--- |
| target files inspected before modification | done — `src/types/mobileDictionary.ts` (modified by A9/A10, read only), `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` (A9-created, appended to) |
| unattributed modification found? | **no** — every pre-existing delta was attributed before A11 began |
| `git reset` / `clean` / `restore` / `checkout --` / `stash` / `cherry-pick` | **none executed** |
| history rewritten | no |
| another session's work overwritten | no |

Provenance of the two shared modules A11 *reads* but did **not** modify:

- `src/services/search/matcher.ts` (` M`) — **Gate 6 kanji-detection delegation** (`containsKanji`),
  pre-existing session work;
- `src/services/dataquality/jlptChecks.ts` (` M`) — **Gate 14 JLPT audit** docstring corrections,
  pre-existing session work. `classifyJlptLevel` itself exists at `origin/main`
  (`git show cfe565d:… | grep -c classifyJlptLevel` → 2), so the classifier is canonical, not
  session-invented.

Tree census after A11: **31 `M` (unchanged) + 36 `??`**. A11 added exactly **three** new untracked
paths (`src/app/api/v1/`, the two new test files) and modified **no** pre-existing tracked file.
The `M` count being unchanged is the check that proves it.

---

## 5. Transport implementation

```
METHOD:       GET
PATH:         /api/v1/mobile/dictionary/search
REQUEST:      query-string parameters, no request body
CONTENT TYPE: application/json
```

`src/app/api/v1/mobile/dictionary/search/route.ts` exports `GET` and `dynamic = "force-dynamic"`,
and **no other method**, so Next.js (not a custom framework) owns method handling. Verified over
real HTTP against a running dev server and a disposable database:

| Request | Measured result |
| :--- | :--- |
| `GET ?q=mizu` | `200` + frozen success envelope |
| `GET` (no `q`) | `400` + `MISSING_QUERY` |
| `POST` / `PUT` / `PATCH` / `DELETE` | **`405`** each |
| `HEAD` | `200` — Next.js derives `HEAD` from `GET` per HTTP semantics; no separate handler exists |
| `GET ?q=mizu&page=2` | `200` — `page` ignored, never translated into `offset` |

The route also appears in the production build manifest as a dynamic route
(`ƒ /api/v1/mobile/dictionary/search`), confirming Next.js registered it correctly.

Response headers: `content-type: application/json` only. No caching header is invented — cache
policy is a deployment/performance concern (§29), not A11's.

---

## 6. Request validation

| Wire name | Validation implemented | Evidence |
| :--- | :--- | :--- |
| `q` | `sanitizeSearchQuery` (NUL-strip + trim); empty ⇒ `400 MISSING_QUERY`; **no length cap** (A10 §A10.4 parity) | `?q=%20%20`, `?q=%00%20%00` → 400; `?q=mi%00zu` → `query: "mizu"` |
| `limit` | shared `parseLimit` (min 1, max `MAX_PAGE_LIMIT`=200, default 50); service then applies ≤100 | `500`→200→applied 100; `0`/`-5`/`abc`/`Infinity`→50; `999999999`→200 |
| `offset` | shared `parseOffset` (min 0, max `MAX_OFFSET`=100 000, default 0) | `-5`/`abc`/`NaN`→0; `999999999`→100 000 |
| `level` | **not validated** (A10 §A10.2 measured) — passed through; out-of-domain ⇒ empty page, not 400 | `level=N9` → 200, `appliedJlptLevel: "N9"`, `entries: []` |
| `jlpt` | legacy alias, used only when `level` is absent/empty | `level=N5&jlpt=N4` → `N5` |
| `common` | literal `"true"`/`"false"` only via shared `parseBooleanFlag` | inherited |
| `targetLanguage` | validated against `SUPPORTED_LANGUAGES`; **inert** | §9 |
| unknown params (incl. `page`, `perPage`, `sort`) | ignored, never an error | 200, no effect |

**Never possible:** negative offset, non-numeric offset, `NaN`, `Infinity`, arbitrarily large
limits, or unbounded page sizes — every numeric path goes through the shared bounded parsers, and
the response is additionally asserted finite and in range.

---

## 7. Search service reuse

No second dictionary search engine was created. Every domain concern has one owner:

| Concern | Owner | A11's role |
| :--- | :--- | :--- |
| matching (`ILIKE` over headword/reading/romaji/senses) | `DictionaryService.searchEntries` | delegate |
| ranking / deterministic ordering | same (SQL `CASE` + exact-match re-sort) | delegate |
| JLPT + `isCommon` filtering | same | delegate |
| pagination clamping (service ceiling 100) | same | read back applied values |
| LIKE-pattern escaping | `services/search/matcher.escapeLikePattern` (inside the service) | delegate |
| query sanitation | `services/search/matcher.sanitizeSearchQuery` | reuse |
| script classification | `services/search/matcher.detectSearchScript` | reuse |
| route parameter bounds | `lib/api/routeParams` | reuse |
| JLPT tri-state | `services/dataquality/jlptChecks.classifyJlptLevel` | reuse |
| publication overlay (CMS) with canonical fallback | `services/publication.resolveLearnerEntries` | inherited via the service |
| error envelope | `lib/api/routeParams.errorBody` | reuse |

The only new code is the transport shell plus the pure projection/validation adapter
(`_lib.ts`) — i.e. A11 is an adapter, exactly as the architectural principle requires.

---

## 8. Script classification

Delegated to `detectSearchScript`; the classifier was **not** modified and not re-implemented in
tests. Measured behaviour of the route:

| Query | `detectedScript` |
| :--- | :--- |
| `水` | `kanji` |
| `みず` | `kana` |
| `水みず` | `japanese` |
| `mizu` | `romaji` |
| `தண்ணீர்` (Tamil) | `mixed` |

The vocabulary stays the canonical six-value `SearchScript`. `english`, `tamil` and `malayalam`
are never emitted as script values — the Tamil case is the positive proof that a **script** class is
not a language, and `water`/`mizu` both classifying as `romaji` proves no query-language inference
happens.

**Correction recorded during A11:** an initial A11 test asserted `"mizu 水" → "mixed"`. The real
classifier returns `"kanji"` (kanji present, kana absent; the latin branch is only consulted when
neither kanji nor kana is present). The **test** was corrected to the measured behaviour, not the
implementation — evidence that the classifier is genuinely reused rather than shadowed.

---

## 9. Target language

`targetLanguage` (`en` | `ta` | `ml`) is **validated and inert**, exactly as frozen:

- `_lib.parseTargetLanguage` checks the value against the canonical `SUPPORTED_LANGUAGES` and
  returns a typed value or `undefined`;
- the parsed value is passed to **neither** the service nor the response;
- an unsupported value (`fr`, `english`, `klingon`) is **ignored, never an error** — A10 §A10.16 has
  no error row for it and §A10.12 forbids inventing a rejection.

Tested: all three vocabulary members → 200; and `en`/`ta`/`ml`/`fr`/`english`/empty produce
**byte-identical payloads** to no-param, with the service receiving identical options. No
`localizedGlosses` field is emitted, no translation is generated, no fallback is invented, and the
script axis is untouched.

**Honest limitation recorded:** because the value is inert, "validated" is a code-level boundary
whose effect is unobservable in v1. It is not claimed as an observable behaviour; the observable,
tested guarantee is inertness. A12 consumes the validated value when D-6 lands.

---

## 10. JLPT

| Aspect | Implementation |
| :--- | :--- |
| filter | `level`, else `jlpt`; trimmed; **not** validated against the vocabulary (measured, frozen) |
| echo | `data.appliedJlptLevel` = the applied filter, or `null` when none |
| item field | `jlptLevel` stored verbatim, **including the `"NONE"` sentinel** |
| item status | `jlptStatus` derived via `classifyJlptLevel` → `known` \| `unknown` \| `invalid` |
| boolean | none — `jlptKnown` is not emitted |

The distinction between the two JLPT fields is preserved and tested: a response can legitimately
carry `appliedJlptLevel: "N5"` while an item carries `jlptLevel: "NONE"` /
`jlptStatus: "unknown"`. Live data confirms `N5` rows classifying as `known`; the `"NONE"`/invalid
paths are covered DB-free by projecting explicit rows, and `classifyJlptLevel` is the same
canonical function those expectations are derived from (no new parser, no invented interpretation).

---

## 11. Entry projection

**The mobile payload is a projection, never a row.** The route maps
`result.entries.map(projectEntry)`, and `projectEntry` returns the declared
`MobileDictionaryEntryCard`, so a `{ ...row }` regression fails to compile rather than leaking
fields.

Emitted (9): `id`, `headword`, `reading`, `romaji`, `primaryGlosses`, `jlptLevel`, `jlptStatus`,
`isCommon`, `kanjiCharacters`.

`primaryGlosses` flattens `senses[].glosses[]` in storage order. Storage is `jsonb`, so the
adapter is total over malformed input (non-array groups, non-string glosses and null groups are
skipped) — it can never throw inside a read path.

Absent by decision: `sourceRef` (**never**), `frequencyRank`/`partsOfSpeech`/`tags` (deferred),
and the five no-producer fields (`localizedGlosses`, `isKeigo`, `keigoType`, `hasAudio`,
`audioUrl`).

**Verified against real rows over HTTP**, which is what makes the leak claim meaningful — live
seeded rows *do* carry `frequencyRank`, `tags`, `partsOfSpeech` and `sourceRef`, and a real
response was observed to contain none of them:

```json
{"id":"de-mizu","headword":"水","reading":"みず","romaji":"mizu",
 "primaryGlosses":["water"],"jlptLevel":"N5","jlptStatus":"known",
 "isCommon":true,"kanjiCharacters":["水"]}
```

---

## 12. Public identifier

`id` verbatim (`de-mizu`, `de-jmdict-…`) is the sole public identifier. No rename, no migration, no
alias, no second identifier. `ent_seq` is **not** emitted — it exists only inside `id`, and
`dictionary_entries` has no such column. A test asserts `ent_seq`/`entSeq` never appear.

---

## 13. Pagination

Flat `offset` + `limit` on `data`; `page`, `pagination` and `returned` absent (asserted). The
response echoes the **applied** values, proven by clamps measured through the route:

| Request | Applied & echoed |
| :--- | :--- |
| (absent) | `limit: 50`, `offset: 0` |
| `limit=500&offset=7` | `limit: 100` (service ceiling), `offset: 7` |
| `limit=200` (live) | `limit: 100` |
| `offset=999999999` | `offset: 100000` |
| `limit=0` / `-5` / `abc` / `Infinity` | `limit: 50` |
| `offset=-5` / `abc` / `NaN` | `offset: 0` |

Clamping is silent and never an error; a client detects it by reading the echoed values. No cursor
pagination, no redesign, no index.

---

## 14. `hasMore`

`hasMore = offset + entries.length < total`, over the **applied** window — computed inline in the
same response, never as a second count query, never approximated. Tested at the exact boundary:

- `offset 0` + 10 of 30 → `true`
- `offset 20` + 10 of 30 → `false`
- `offset 10` + 10 of 20 → `false` (exact equality)
- `offset 10` + 10 of 21 → `true`
- live: first page, second page, final page (`offset = total − 5`) → `false`, and one page beyond
  the end → empty page, still `200`

---

## 15. Success envelope

Exactly the frozen shape, and nothing else:

```json
{ "success": true,
  "data": { "query", "detectedScript", "appliedJlptLevel",
            "entries", "total", "limit", "offset", "hasMore" } }
```

Asserted: top-level keys are exactly `["data","success"]`; `data` keys are exactly the eight above;
and `results`, `totalResults`, `executionTimeMs`, `page`, `pagination`, `returned`, `queryEcho`,
`apiVersion`, `meta`, `warnings` are all absent.

---

## 16. Error envelope

```json
{ "success": false, "error": { "code": "MISSING_QUERY", "message": "Query parameter 'q' is required" } }
{ "success": false, "error": { "code": "INTERNAL_ERROR", "message": "Dictionary search failed" } }
```

| Condition | Status | Code |
| :--- | :--- | :--- |
| `q` missing/blank/NUL-only | 400 | `MISSING_QUERY` (service never called — asserted) |
| unexpected failure | 500 | `INTERNAL_ERROR` |
| zero matches | 200 | — (`entries: []`, `total: 0`, `hasMore: false`) |
| clamped pagination | 200 | — |
| unknown parameter | 200 | — |
| unsupported method | 405 | Next.js standard |

**One deliberate deviation, in the safe direction (recorded, not hidden).** The implemented web
route returns `error.message` on 500; the mobile route returns a fixed string. A test injects a
failure whose message contains a SQL statement, `ECONNREFUSED`, a host, a port, `password=` and a
filesystem path, then asserts the serialized response contains none of them. The diagnostic is
logged server-side instead. The frozen contract fixes the envelope and the code, and states that
`message` "may change without a contract revision" — so this is hardening under A11 §14/§16, not a
contract change.

---

## 17. Security boundary

A10 deferred authentication (D-13) and rate limiting (D-14); **A11 implemented neither** — no key,
session, guard or limiter was added. Hardening that *is* in scope:

| Control | Implementation |
| :--- | :--- |
| SQL injection | all querying stays inside `DictionaryService`; parameters are Drizzle-bound; the user string reaches SQL only through `escapeLikePattern` — no user-controlled SQL fragment exists |
| raw SQL / stack / host / path / secret leakage | fixed messages; asserted against a poisoned error; `DATABASE_URL` never printed by A11 |
| bounded query parameters | shared bounded parsers; `limit` ≤ 100 applied, `offset` ≤ 100 000 |
| bounded response size | ≤ 100 entry objects; each a 9-field projection |
| no arbitrary column selection | the projection is a closed set; a column added to the table later cannot appear (tested with a synthetic future column) |
| no internal metadata leakage | `sourceRef`, `frequencyRank`, `partsOfSpeech`, `tags`, `senses` asserted absent from real and synthetic payloads |

```text
PUBLIC READ-ONLY ENDPOINT
NO RATE LIMIT IN A11
SECURITY GATE REQUIRED BEFORE/AT DEPLOYMENT
```

This condition is carried unchanged, not reinterpreted: the search predicate is an `ILIKE` scan, so
unbounded unauthenticated traffic is a real cost vector (A10 §A10.15).

---

## 18. Web API isolation

Web dictionary behaviour is untouched. `git diff --quiet cfe565d` for every web dictionary
surface: `api/dictionary/route.ts`, `api/dictionary/search/route.ts`, `api/dictionary/[id]/route.ts`,
`api/dictionary/entry/[id]/route.ts`, `services/dictionary/dictionaryService.ts`,
`lib/api/routeParams.ts`, `services/publication/dictionaryPublicationResolver.ts` → **all
UNMODIFIED**. No shared-service change was necessary, so no such change was made and no web
expectation was adjusted to make mobile tests pass.

Targeted web regression re-run: `dictionary-kanji-experience-routes.test.ts` 31/31 and
`mobile-dictionary-payload-contract.test.ts` 14/14 pass. The full suite (§20) confirms no web
regression anywhere.

---

## 19. Tests

| Suite | Tests | Layer |
| :--- | ---: | :--- |
| `tests/mobile-dictionary-search-api.test.ts` | **42** | route contract + adapter units, **DB-free** |
| `tests/mobile-dictionary-search-api-live.test.ts` | **7** | live route, real service, seeded first-party corpus |

The mocked suite pins: transport/method surface and route inventory; query sanitation and the 400
path; the six-value script vocabulary incl. Tamil → `mixed`; defaults, clamps and applied-value
echo; `hasMore` at exact boundaries; empty page as 200; `page`/unknown params ignored; JLPT
precedence, no server-side level validation, `appliedJlptLevel` ≠ item `jlptLevel`, tri-state;
`targetLanguage` vocabulary + byte-identical inertness; the 9-field projection incl. deep equality
and the future-column leak test; `flattenGlosses` totality; success/error envelopes with retired
keys absent; safe 500 with server-side logging.

The live suite seeds the first-party corpus through the real service and asserts: real rows
projected to the frozen item with `frequencyRank`/`tags`/`partsOfSpeech`/`sourceRef` absent;
headword and kana lookups; real pagination with exact `hasMore`, no page overlap and a correct
final page; the service ceiling at the route boundary; real JLPT filtering; a real zero-match 200;
and inertness against real data. It **skips with an explicit reason** when no database is
reachable (verified: 7 skipped with the connection error printed), and never fabricates rows.

Two test expectations were corrected during A11 after measurement disagreed with my assumption
(the `"mizu 水"` script case and a `q=de` row-count assumption). In both cases the **test** was
aligned to measured behaviour — the implementation was not bent to satisfy a guess, and no fixture
data was invented.

---

## 20. Regression

| | Files | Passed | Failed | Skipped | Total |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **BASELINE** (A10, re-measured this turn) | 54 | 1075 | 0 | 55 | 1130 |
| **FINAL** (A11) | **56** | **1124** | **0** | **55** | **1179** |
| **NEW PASSED** | +2 files | **+49** | — | — | +49 |
| **NEW FAILURES** | — | — | **0** | — | — |
| **NEW SKIPS** | — | — | — | **0** | — |

The delta is exactly the two new suites (42 + 7). The A6 corpus-tier skip set is **byte-identical**
to baseline — the same nine files with the same counts (`pilot-jmdict-db` 12,
`kanjidic2-canonical-ingestion` 11, `kanji-lexical-graph` 11, `full-jmdict-ingestion` 7,
`kanjivg-etl` 7, `kanjidic2-etl-foundation` 4, `corpus-preflight` 1,
`dictionary-architecture-corpus` 1, `dry-run-jmdict` 1). No skip was removed, added or converted
into a pass; no corpus was downloaded or accessed.

---

## 21. Typecheck

`npx tsc --noEmit` → **clean** (no diagnostics), with `node_modules` restored by `npm ci`
(444 packages; `package.json` and `package-lock.json` verified clean before **and** after —
no version change, so no STOP).

## 22. Lint

`npm run lint` → **0 errors / 4 warnings**, identical to the A10 baseline (the four warnings are
pre-existing `react-hooks/exhaustive-deps` warnings in unrelated review-session pages). No new
error, no new warning, and no lint rule was disabled.

## 23. Drizzle validation

`npx drizzle-kit check` → **Everything's fine**. The schema pushed to the disposable database is the
repository's existing schema (`npx drizzle-kit push --force`), unmodified by A11.

## 24. Build

`npm run build` → **exit 0**. The route is registered as a dynamic route
(`ƒ /api/v1/mobile/dictionary/search`), which also proves the export surface is valid for Next.js
(a stray export would fail the build). Build used a loopback `DATABASE_URL`.

---

## 25. Schema / migrations

**None.** No `src/db/schema.ts` edit, no `drizzle/*.sql`, no migration, no index, no constraint, no
table. Verify: `git diff --quiet cfe565d -- src/db/schema.ts` is **false**, but that delta is
**pre-existing and comment-only** (11 insertions / 1 deletion inside the `provenanceType` doc
comment; the `ai_generated` value added by Gate A2, which explicitly requires no migration). A11
added nothing to it, proven by the `M` count staying at 31 all gate long. No production migration
was run; `push --force` was applied only to the disposable local PGlite instance.

---

## 26. Production safety

No Supabase production connection, no production read or write, no Vercel change, no environment
change, no production ingestion, no secret printed (`DATABASE_URL` was used only as a loopback
`127.0.0.1` connection string). `nihingobridge.vercel.app` was never contacted. Nothing was pushed.
The disposable PGlite instance was used for validation and stopped afterwards.

---

## 27. Deferred A12 work

Unchanged by A11 — each remains exactly as A10 recorded it:

| # | Item | Consequence |
| :-: | :--- | :--- |
| D-4 | opaque public identifier | would need a migration or alias table |
| D-5 | resolved provenance display form | prerequisite for any provenance field, and for D-9 |
| D-6 | localized gloss payload | needs a read path + authorization + per-gloss labelling; `targetLanguage` stays inert until then |
| D-7 | keigo item fields | needs a per-item graph cost decision |
| D-8 | audio fields | no dictionary-entry audio exists |
| D-9 | entry-detail DTO + endpoint | **not implemented**; blocked by D-5 |
| D-10 | richer filters (`partsOfSpeech`, `hasKanji`, `hasExamples`, `register`) | no producers |
| D-11 | `warnings` / offline self-description | no producer; offline is client-owned |
| D-12 | deep/cursor pagination past offset 100 000 | performance gate + index decision |
| D-13 | rate limiting / abuse protection | **deployment-blocking** |
| D-14 | defensive maximum `q` length | security decision; parity with web frozen for v1 |

---

## 28. Final verdict

### `A11 VERDICT: PASS WITH CONDITIONS`

The endpoint is implemented and behaves as frozen:

- exactly **one** new route, GET-only, `405` for other methods;
- the frozen request semantics, sanitation, six-value script vocabulary, JLPT tri-state, canonical
  identifier, 9-field projection, offset/limit echo and exact `hasMore` are all implemented and
  pinned by tests;
- `page`, `returned`, `queryEcho`, `matchType`, `apiVersion`, `meta`, `warnings` and raw-row
  spreading are provably absent (exported payloads and database-row columns both asserted);
- web dictionary surfaces are unmodified and green; no schema, migration or dependency change;
- regression is 56/1124/0/55/1179 against a 54/1075/0/55/1130 baseline — **0 new failures, 0 new
  skips**; typecheck, lint, drizzle check and build all pass.

**Conditions** (each an owned, documented dependency rather than a defect):

1. **D-13 — no rate limiting and no abuse protection.** The contract notes the search predicate is
   an `ILIKE` scan, so this endpoint is **not approved for production exposure** until a deployment
   security gate decides it.
2. **D-14 — no `q` length cap.** Frozen for v1 by parity with the web route; a defensive cap is a
   security decision, not an A11 one.
3. **D-12 — deep pagination past offset 100 000** remains out of contract and requires a performance
   gate; A11 added no cursor and no index.
4. **No authentication** (by decision, not omission) — a public read-only endpoint carries no
   identity requirement, and no auth was invented.
5. **D-9 — the entry-detail endpoint is not implemented**, so a mobile client cannot be built
   end-to-end from A11 alone.
6. **D-6 — `targetLanguage` is inert**, so a client must not expect localized glosses.
7. **`targetLanguage` validation is not externally observable** in v1 (the value is discarded by
   design); only inertness is proven.
8. **Commit durability is not verified** — the sandbox's `.git` layer has reset on seven
   consecutive turns, so the durable deliverable is the working-tree content identified by path,
   not any commit hash.

`BLOCKED` was **not** declared: no frozen requirement was unimplementable, no required service was
unavailable, no security boundary was unmaintainable, no schema change was needed, no unrelated work
had to be overwritten, no regression was unexplained, and no production access was required.

---

---

## 29. Stale-term audit (§26)

The A10 audit was repeated after implementation. The critical question is narrow: **did A11
reintroduce a retired field into the mobile response?** It did not — and that is proven by the
emitted payload, not by a repository-wide grep.

### 29.1 Occurrences across the repository (measured after implementation)

| Term | `src` | `tests` | `docs` | Classification |
| :--- | ---: | ---: | ---: | :--- |
| `queryEcho` | 0 | 5 | 9 | **SUPERSEDED** — retirement assertions + historical prose |
| `matchType` | 0 | 8 | 11 | **SUPERSEDED** — tests assert absence; docs record history |
| `jlptKnown` | 1 | 8 | 12 | **HISTORICAL** — the `src` hit is the A9 retirement note in `mobileDictionary.ts` |
| `returned` | 18 | 18 | 19 | **UNRELATED** — ordinary English word / `rowsReturned`-style identifiers |
| `page` | 12 | 34 | 33 | **UNRELATED** — `page.tsx` modules, CMS page-size prose, local variables; contract-relevant hits are the `page`-retirement notes and negative assertions |
| `apiVersion` | 1 | 4 | 16 | **HISTORICAL** — no producer; the `src` hit is the A11 docblock listing retired keys |
| `meta` | 44 | 4 | 11 | **UNRELATED** — `CATEGORY_META` and local bindings; no route emits a `meta` key |
| `warnings` | 21 | 10 | 15 | **UNRELATED** — ETL-internal (`kanjiVgTransformer`); no API-route producer |
| `results` | 93 | 100 | 23 | **UNRELATED** — `UnifiedSearchResponse.results`, JLPT results routes/pages; mobile uses `entries` |
| `totalResults` | 4 | 6 | 5 | **UNRELATED** — a live field of `UnifiedSearchResponse`, a different payload |
| `executionTimeMs` | 1 | 5 | 3 | **HISTORICAL** — retirement note only |

### 29.2 The mobile payload path

`grep` of the *retired-term set* over the two A11 implementation files returns **one** line, and it
is a docblock enumerating what is retired (`route.ts:42`). No retired term is read, computed or
emitted anywhere in the mobile path.

The decisive evidence is behavioural, not textual: the route test asserts the response `data` keys
are **exactly** the eight frozen ones and that `results`, `totalResults`, `executionTimeMs`, `page`,
`pagination`, `returned`, `queryEcho`, `apiVersion`, `meta` and `warnings` are all **absent**; and
every mobile-file occurrence of those names in the test suites is a *negative* assertion
(`not.toHaveProperty`), i.e. a pin against reintroduction. That is the check the brief asks for —
not a ban on the words appearing elsewhere in the repository, which none was.

`UnifiedSearchResponse` was verified again to be a **different** payload from the mobile response
and was not conflated with it; its `results`/`totalResults` fields remain legitimately active on the
web unified-search surface.

---

## 30. Required-report-item index (§38)

| Brief §38 item | Report section |
| :--- | :--- |
| 1. Gate identity | header + §1 |
| 2. Gate 0 baseline | §2 |
| 3. A9/A10 artifact verification | §3 |
| 4. Repository preservation audit | §4 |
| 5. Transport | §5 |
| 6. Request validation | §6 |
| 7. Query sanitation | §6 (first row) + §8 |
| 8. SearchScript | §8 |
| 9. targetLanguage | §9 |
| 10. JLPT | §10 |
| 11. Search service reuse | §7 |
| 12. Entry projection | §11 |
| 13. Public ID | §12 |
| 14. Pagination | §13 |
| 15. hasMore | §14 |
| 16. Success envelope | §15 |
| 17. Error envelope | §16 |
| 18. HTTP methods | §5 (method table) |
| 19. Security | §17 |
| 20. Web API isolation | §18 |
| 21. Tests | §19 |
| 22. Regression | §20 |
| 23. Typecheck | §21 |
| 24. Lint | §22 |
| 25. Drizzle | §23 |
| 26. Build | §24 |
| 27. Schema/migrations | §25 |
| 28. Production safety | §26 |
| 29. Deferred A12 work | §27 |
| 30. Final verdict | §28 |
| 31. Exact A12 handoff | **§31** |

---

## 31. Exact A12 handoff (brief §39)

```text
A12 MAY:
- implement the separately frozen entry-detail contract
- resolve/implement the detail DTO
- perform deep-pagination performance investigation
- address deployment security requirements
- address rate limiting if separately authorized
- address any remaining explicitly deferred mobile contract items

A12 MUST NOT:
- silently redesign A11 search semantics
- change SearchScript
- reintroduce queryEcho
- reintroduce matchType
- reintroduce jlptKnown
- introduce page pagination
- expose raw database rows
- change the web dictionary contract
- modify schema without separate authorization
- ingest Tatoeba
- ingest KanjiVG
- push, or begin any Phase 14.4D/14.4E/14.5A/14.5B work, without explicit authorization
```

The first block is the mandated handoff, verbatim. The final added line narrows it further and is
consistent with it: it forbids more, never less. Where the frozen contract is more precise, the
contract governs — specifically `§A10.17` (D-4…D-14) and `§A10.18`, which A12 must read before
starting and must not contradict.

---

**HARD STOP.** A11 ends here. No entry detail, localization, authentication, rate limiting, cursor
pagination, deep-pagination optimization, schema/index change, Tatoeba or KanjiVG work, and no
Phase 14.4D/14.4E/14.5A/14.5B work was started.

---

## A11 success criteria (§41)

```text
[x] A10 baseline verified                          [x] no schema changes
[x] PRESERVE-FIRST audit completed                 [x] no migrations
[x] exactly one mobile search route implemented    [x] no indexes
[x] GET transport implemented                      [x] no production access
[x] frozen request semantics preserved             [x] no Tatoeba access
[x] query sanitation preserved                     [x] no KanjiVG access
[x] six-value SearchScript preserved               [x] no detail endpoint
[x] targetLanguage semantics preserved (inert)     [x] no localization
[x] JLPT semantics preserved                       [x] no auth
[x] hand-built 9-field DTO implemented             [x] no rate limiting
[x] raw database-row spreading impossible          [x] A6 corpus gating unchanged
[x] canonical id preserved                         [x] DB-free tests pass (42)
[x] offset/limit preserved                         [x] route tests pass (42 + 7 live)
[x] page not introduced                            [x] regression passes (56/1124/0/55/1179)
[x] hasMore implemented exactly                    [x] typecheck passes
[x] returned not introduced                        [x] lint has no new errors (0 err / 4 warn)
[x] success envelope frozen                        [x] drizzle validation passes
[x] error envelope frozen                          [x] build passes (exit 0)
[x] internal errors not leaked                     [x] report written
[x] web dictionary behavior preserved              [x] unrelated working-tree changes preserved
```

---

## A11 final output (§42)

```text
GATE: A11 — MOBILE DICTIONARY SEARCH API IMPLEMENTATION

STATUS: COMPLETE — route implemented and validated

GATE 0: HEAD cfe565d = origin/main (0/0); branch arena/01a0d21c-nihingobridgeupgrade;
        33 ?? + 31 M; reflog = clone + checkout only; node_modules empty; no production contact
A9/A10 BASELINE: VERIFIED — all 8 artifacts present; A10 commit object absent (git layer reset)

ROUTE: src/app/api/v1/mobile/dictionary/search/route.ts (+ co-located _lib.ts adapter)
METHOD: GET only; POST/PUT/PATCH/DELETE → 405 (measured); HEAD derived by Next.js

REQUEST CONTRACT: q (required), limit, offset, level|jlpt, common, targetLanguage;
                  unknown params incl. page ignored; no request body

SEARCH SERVICE: DictionaryService.searchEntries (reused — no second engine)

SCRIPT CLASSIFICATION: detectSearchScript reused; six-value SearchScript; Tamil → mixed

TARGET LANGUAGE: validated against SUPPORTED_LANGUAGES, INERT in v1

JLPT: appliedJlptLevel echo + item jlptLevel (sentinel preserved) + jlptStatus tri-state

ENTRY PROJECTION: 9-field hand-built DTO; no row spread; sourceRef/frequencyRank/tags/
                  partsOfSpeech absent (asserted on real rows)

PUBLIC ID: id verbatim; ent_seq never exposed

PAGINATION: offset/limit flat; applied values echoed; silent clamping

HAS MORE: offset + entries.length < total, computed exactly

SUCCESS ENVELOPE: {success,data:{query,detectedScript,appliedJlptLevel,entries,total,limit,offset,hasMore}}
ERROR ENVELOPE: {success:false,error:{code,message}} — 400 MISSING_QUERY / 500 INTERNAL_ERROR

SECURITY: parameter bounds, closed projection, escaped LIKE, no internal leakage; auth none
AUTH: NOT IMPLEMENTED (deferred D-13)
RATE LIMIT: NOT IMPLEMENTED (deferred D-13/D-14 — deployment gate required)

WEB API REGRESSION: none — all web dictionary surfaces unmodified; web suites green

TESTS: 40 DB-free contract/adapter + 7 live over the seeded corpus
BASELINE: 54 files / 1075 passed / 0 failed / 55 skipped / 1130 total
FINAL: 56 files / 1124 passed / 0 failed / 55 skipped / 1179 total
NEW FAILURES: 0
NEW SKIPS: 0 (A6 corpus-tier skip set unchanged)

TYPECHECK: clean
LINT: 0 errors / 4 warnings (unchanged from baseline)
DRIZZLE: OK
BUILD: PASS (exit 0; route registered as dynamic)

SCHEMA CHANGES: none
MIGRATIONS: none

PRODUCTION: NOT CONTACTED
TATOEBA: NOT ACCESSED
KANJIVG: NOT ACCESSED

FILES CHANGED: +src/app/api/v1/mobile/dictionary/search/route.ts
               +src/app/api/v1/mobile/dictionary/search/_lib.ts
               +tests/mobile-dictionary-search-api.test.ts
               +tests/mobile-dictionary-search-api-live.test.ts
               ~docs/api/MOBILE-DICTIONARY-API-CONTRACT.md (A11 section appended)
               +reports/gates/GATE-A11-MOBILE-DICTIONARY-SEARCH-API.md

COMMIT: A11-only commit over those paths (hash reported; durability NOT VERIFIED)
PUSH: no

DEFERRED A12 ITEMS: D-4, D-5, D-6, D-7, D-8, D-9, D-10, D-11, D-12, D-13, D-14
                    (D-13 deployment-blocking; D-9 detail endpoint; D-6 localization)

FINAL VERDICT: PASS WITH CONDITIONS

NEXT GATE: not started — the next gate requires explicit authorization
```

---

**HARD STOP.** A11 ends here. No entry detail, localization, authentication, rate limiting, cursor
pagination, deep-pagination optimization, schema/index change, Tatoeba or KanjiVG work, and no
Phase 14.4D/14.4E/14.5A/14.5B work was started.
