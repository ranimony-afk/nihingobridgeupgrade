# NihongoBridge Mobile Dictionary API Contract — **v1 (A9 FROZEN)**

**Status**: **FROZEN DESIGN CONTRACT** — resolved by Gate A9 (2026-09-24)
**Prepared by**: Gate A9 — Mobile Dictionary Payload Design Decisions
**Runtime status**: **MOBILE RUNTIME API: NOT IMPLEMENTED.** This document is a *design freeze*,
not a description of a running service. No `/api/mobile` or `/api/v1` route exists.
**Authoritative over**: `docs/architecture/MOBILE-DICTIONARY-API-CONTRACT.md` (the Phase 14.4A/14.4F-R
architecture document). Where that document's target payloads differ from this one, **this
document wins**; the differences are enumerated in §11.
**Unchanged by A9**: the web API. Every `IMPLEMENTED WEB BEHAVIOR` claim below was measured
against the running code, and A9 changed no runtime response.

### Field status vocabulary used throughout

| Label | Meaning |
| :--- | :--- |
| `IMPLEMENTED WEB BEHAVIOR` | emitted today by a route in this repository, measured |
| `TARGET MOBILE CONTRACT` | frozen for the future mobile API; may coincide with web behavior |
| `NOT YET IMPLEMENTED` | frozen in this contract but no code emits it yet |
| `DERIVED` | computed by NihongoBridge from canonical data; never imported |

---

## 1. Frozen decision table

| # | Decision | Current reality (measured) | Options | Chosen decision | Rationale | Implementation gate |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Query echo name | `GET /api/dictionary/search` emits `data.query` = sanitized query | A) `queryEcho` · B) `query` · C) both | **B — `query`**; `queryEcho` retired | `queryEcho` has zero runtime references; `query` is already shipped and is the declared field name; renaming a shipped public field is a breaking change; option C is rejected because "raw input" is not retained anywhere, so a second name would describe nothing | none (already shipped) |
| 2 | `matchType` | no `matchType` symbol in `src`; `matchedOn` (typed `string`) on `/api/search` results | A) keep/define · B) remove · C) define as typed union now | **B — removed from the mobile dictionary contract**; `matchedOn` remains the match-provenance field on `/api/search` only | no producer, no consumer, and no evidence establishing a vocabulary; `matchedOn` already answers "what field produced this row" with measured values; defining a second name for one fact is the drift A7/A8 removed | future gate if a typed provenance union is wanted (not required by this contract) |
| 3 | `jlptKnown` | `entries[].jlptLevel` carries the stored string verbatim (`N5`…`N1`, or the sentinel `"NONE"`); `classifyJlptLevel` exposes `known` / `unknown` / `invalid` | A) `jlptKnown: boolean` · B) tri-state · C) raw only | **B — tri-state `jlptStatus: "known" \| "unknown" \| "invalid"` alongside the raw `jlptLevel`**; `jlptKnown: boolean` removed | boolean is **lossy**: `invalid` is reachable for non-JMDICT rows and would collapse into "not known"; the tri-state vocabulary already exists in code (`JlptLevelMeaning`), so nothing is invented; the raw value stays exposed so no information is destroyed | A10 (type frozen here; no runtime producer yet) |
| 4 | `returned` | not emitted; `data.entries.length` is derivable | A) adopt with defined meaning · B) do not adopt | **B — not adopted for the envelope.** `returned` is *permanently defined* as `data.entries.length` so it can never be ambiguous if a later gate adopts it | in the frozen pipeline it is already a function of `entries`; a field that is a pure projection of another field can only drift from it | n/a |
| 5 | `hasMore` | derivable; not emitted | A) adopt exact · B) approximate · C) defer | **A — adopted, with the exact invariant `hasMore = offset + entries.length < total`** under the offset-clamp rule of §5 | the trace shows the pipeline is exactly `WHERE → COUNT(*) → ORDER BY → LIMIT/OFFSET → 1:1 CMS overlay` (no post-limit filtering, dedup or truncation), so the invariant is exact rather than approximate — but *only* if the response echoes the applied `offset`/`limit`, which the frozen contract therefore **requires** | A10 |
| 6 | `page` vs `offset` | offset-based everywhere: route clamps `limit` 1…200 (default 50) and `offset` 0…100 000; service clamps `limit` to 1…100; the service-applied values are echoed | A) `offset`+`limit` · B) `page`+`limit` · C) both | **A — canonical `offset` + `limit`; 0-based `offset`; `page` retired** | every implemented read path, the declared request type, and §8.2/§10.1 of the historical document are offset-based; `page` exists in exactly one place — a request example in the historical §2.2 — and in no code, no test and no consumer; offset generalises (page is `offset = (page-1)×limit`) while `page` cannot express offset-only windows; option C is rejected because conflicting pagination models in one contract are unrecoverable at the client | none (matches shipped behavior) |
| 7 | Script / language / locale axes | `SearchScript` = 6 character-class values; `SUPPORTED_LANGUAGES` = `en` \| `ta` \| `ml`; **a locale axis exists only in the AI answer layer** (`groundedAnswerService.ts`: `locale?: "en" \| "ja"`); no locale appears in any dictionary contract | A) extend script with languages · B) freeze separation · C) adopt the AI layer's locale vocabulary for mobile | **B — frozen: script is a character class (6 values, unchanged); translation language is `targetLanguage` (`en`/`ta`/`ml`); the dictionary payload introduces no locale field; query language is never inferred from script** | A7 proved language is not a character class and `english` is unreachable; the only locale vocabulary in the repository belongs to a different subsystem with a different domain (`en`\|`ja`, the AI answer's response language), so option C would couple two unrelated contracts and `en-IN`/`ta-IN`-style locales appear nowhere in any contract; the AI layer's `queryType` (`japanese`\|`romaji`\|`english`\|`empty`) stays a separate axis | none (documentation freeze) |
| 8 | Response envelope | `{ success, data }` on every dictionary read path; `{ success: false, error: { code, message } }` on errors; kanji routes are flat | A) `{apiVersion, data, meta, warnings}` · B) `{success, data}` · C) harmonise all routes | **B — frozen `{ success: true, data: { … } }` / `{ success: false, error: { code, message } }` for the mobile dictionary API.** `apiVersion`, `meta`, `warnings` and the `pagination` object are retired from the target; the flat kanji envelopes are left as-is (different resource family, documented, not part of this contract) | `{apiVersion, data, meta, warnings}` has zero implementation and its `apiVersion` was documented both in the path and in the body (self-inconsistent); the `{success,data}` envelope is what every dictionary read path already returns, so freezing it costs no client rework and keeps one shape for the whole dictionary surface | A10 |

**Status of every row: `RESOLVED`.** No row is `DEFERRED` and no row is
`DESIGN DECISION REQUIRED` — see §12 for the decisions that remain open for *other* reasons.

---

## 2. Request contract (`TARGET MOBILE CONTRACT`)

| Field | Type | Required | Bounds / domain | Semantics |
| :--- | :--- | :--- | :--- | :--- |
| `q` | string | **yes** | non-empty after sanitization | The query. Sanitized exactly as §4 defines — no NFKC, no transliteration, no case folding, no script conversion |
| `limit` | integer | no | 1…200 at the boundary; **applied** 1…100 (default 50) | Page size. Read the applied value back from the response; never assume the request was honoured |
| `offset` | integer | no | 0…100 000 (default 0) | **0-based** row offset into the ordered result set. Canonical pagination model (decision 6) |
| `level` (alias `jlpt`) | string | no | `N5` \| `N4` \| `N3` \| `N2` \| `N1` | JLPT filter; echoed as `appliedJlptLevel`. The implemented route trims and echoes it **without vocabulary validation** — a client sending an out-of-domain value gets an empty result set, not a 400 |
| `common` | `"true"` \| `"false"` | no | literal strings only | `isCommon` filter |
| `targetLanguage` | `en` \| `ta` \| `ml` | no | `SUPPORTED_LANGUAGES` | Translation language for localized glosses. **Language axis — never a script value** |

**Not frozen by A9** (recorded in §12): the HTTP method and path (`GET` vs `POST`), and whether
parameters travel as query parameters or a request body. The historical document is
self-inconsistent on this point — §2.2 shows `POST /api/v1/mobile/dictionary/search` with a JSON
body, §10.1 shows `GET /api/v1/mobile/dictionary/search` — and no evidence in this repository
decides it. **The field semantics above are frozen; the transport is not.**

`page` is **not** part of this contract (decision 6). A client that wants page semantics computes
`offset = (page - 1) × limit` itself; the server never accepts or emits `page`.

---

## 3. Response contract (`TARGET MOBILE CONTRACT`)

### 3.1 Envelope

```jsonc
// 200
{ "success": true,
  "data": { /* §3.2 */ } }

// 400 / 404 / 500
{ "success": false,
  "error": { "code": "MISSING_QUERY", "message": "Query parameter 'q' is required" } }
```

| Field | Required | Nullable | Status |
| :--- | :--- | :--- | :--- |
| `success` | yes | no | `IMPLEMENTED WEB BEHAVIOR` + `TARGET MOBILE CONTRACT` |
| `data` | yes on 200 | no | same |
| `data.query` … `data.hasMore` | per §3.2 | — | see §3.2 |
| `error.code`, `error.message` | yes on failure | no | `IMPLEMENTED WEB BEHAVIOR`. Codes in use: `MISSING_QUERY` (400), `NOT_FOUND` (404), `INTERNAL_ERROR` (500) |
| `apiVersion`, `meta`, `warnings` | — | — | **retired** (decision 8) — `NOT YET IMPLEMENTED` and not planned for v1 |

### 3.2 `data`

| Field | Type | Required | Nullable | Producer | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `query` | string | yes | no | sanitized request query | `IMPLEMENTED WEB BEHAVIOR` + `TARGET MOBILE CONTRACT` |
| `detectedScript` | `SearchScript` (6 values) | yes | no | `detectSearchScript` (server-side) | both |
| `appliedJlptLevel` | string \| null | yes | **yes** (`null` when no filter) | route | both |
| `entries` | array of result items (§3.3) | yes | no (`[]` when none) | service | both (item shape differs — §11) |
| `total` | integer | yes | no | `COUNT(*)` over the same predicate | both (was undocumented in the historical target) |
| `limit` | integer | yes | no | **service-applied** value, echoed | both |
| `offset` | integer | yes | no | **service-applied** value, echoed | both |
| `hasMore` | boolean | yes | no | derived: `offset + entries.length < total` | `TARGET MOBILE CONTRACT` — `NOT YET IMPLEMENTED` |

**Zero-result and error states** (`IMPLEMENTED WEB BEHAVIOR`, measured): no matches → `200` with
`entries: []`, `total: 0`, `hasMore: false` (never 404). Missing/blank/NUL-only query → `400`
`MISSING_QUERY` with no `data` key and the service never called. Out-of-range `limit`/`offset` →
clamped, never `null`/`NaN`/`Infinity`.

### 3.3 Result item (`TARGET MOBILE CONTRACT`)

The mobile item is a projection of canonical data, **not** a spread of a database row
(architecture §6.1's never-expose rule). The declared shape is
`MobileDictionaryEntryCard`; the projection itself is a prerequisite of the implementation gate
(§10, dependency D-1).

| Field | Type | Required | Source |
| :--- | :--- | :--- | :--- |
| `id` | string | yes | entry identifier — see §12 (public-identifier policy is open) |
| `headword` | string | yes | `dictionary_entries.headword` |
| `reading` | string | yes | `dictionary_entries.reading` |
| `romaji` | string | yes | `dictionary_entries.romaji` |
| `primaryGlosses` | string[] | yes | flattening of the stored `senses[].glosses[]` nesting into a display list |
| `localizedGlosses` | `Record<SupportedLanguage, string[]>` | no | translation layer (not implemented) |
| `jlptLevel` | string | yes | stored value verbatim, **including the `"NONE"` sentinel** |
| `jlptStatus` | `"known"` \| `"unknown"` \| `"invalid"` | yes | **`DERIVED`** via `classifyJlptLevel` (decision 3) |
| `isCommon`, `isKeigo`, `keigoType`, `hasAudio`, `audioUrl`, `kanjiCharacters` | — | mixed | canonical fields; unchanged from the declared card |

`jlptLevel` and `jlptStatus` are **both** exposed on purpose: the raw value preserves provenance
and never destroys the sentinel, the derived value removes the "is `"NONE"` a level?" trap. A
client must not branch on the truthiness of `jlptLevel`.

---

## 4. Query echo semantics (`IMPLEMENTED WEB BEHAVIOR`)

`data.query` is the **sanitized** query: NUL bytes stripped, then trimmed
(`sanitizeSearchQuery`). It is **not** the raw request string.

| Transformation | Applied? | Evidence |
| :--- | :--- | :--- |
| NUL (`\0`) removal | **yes** | `rawQuery.replace(/\0/g, "")` |
| `trim()` | **yes** | same function |
| Unicode normalization (NFC/NFKC) | **no** | full-width `ｘｍiz` is echoed unchanged |
| Case folding | **no** | the echo preserves case; only SQL matching is `ILIKE` |
| Transliteration / romaji↔kana | **no** | no such function exists on this path |
| Script conversion | **no** | — |

`query` is therefore "the value the server actually searched with", not "what the client typed".
The raw input is not retained anywhere in the pipeline, which is why option C in decision 1 was
rejected: there is no second value to name.

---

## 5. Pagination semantics (`IMPLEMENTED WEB BEHAVIOR` + one frozen addition)

```
request  limit 1..200 (default 50)   offset 0..100000 (default 0)     [route boundary]
   ↓
applied  limit = min(max(limit, 1), 100)   offset = max(offset, 0)    [service]
   ↓
response limit, offset  ← the APPLIED values (never the requested ones)
         total          ← COUNT(*) over the same predicate, not page-local
         hasMore        ← offset + entries.length < total
```

* **`offset` is 0-based** and denotes rows skipped into the ordered result set.
* **Two-layer clamping is intentional** and the response always echoes the applied values, so a
  client can detect that `limit=200` became `100`.
* **`returned` is not emitted**; it is defined as `entries.length` (decision 4).
* **`hasMore` invariant** is exact under this pipeline. The implemented service is
  `WHERE → COUNT(*) → ORDER BY → LIMIT/OFFSET → 1:1 publication overlay → stable exact-match
  re-sort`: no post-limit filtering, no deduplication, no truncation, and the overlay maps rows
  1:1 (it replaces displayed values, not row identity or order). The **one** case in which the
  invariant is inexact is a clamped `offset`: when a client requests a negative offset, the
  service applies `offset = 0` while `total` was never filtered by offset — so
  `offset + entries.length >= total` can be true on a page that is genuinely not the first. The
  frozen rule therefore is: **`hasMore` is only meaningful when the response's `offset` equals the
  offset the client requested**; because the response always echoes the *applied* offset (measured:
  `?offset=-1` → `offset: 0`), a conforming client can always detect the substitution. No
  approximation is used and no value is invented.
* **No cursor pagination** is introduced. Deep paging beyond `offset = 100000` is out of contract;
  a future gate that needs it must define the boundary explicitly.

---

## 6. Axes (frozen — must never be combined)

| Axis | Question it answers | Owner | Values | Status |
| :--- | :--- | :--- | :--- | :--- |
| **script** | what characters did the user type? | `SearchScript` (canonical, Gate A7) | `empty` `kanji` `kana` `japanese` `romaji` `mixed` | frozen |
| **match provenance** | which stored field produced this row? | `matchedOn` (`string`, `/api/search` only) | per-target, e.g. `gloss`, `headword`, `reading`, `romaji`, `english`, `character`, `title`, `slug`, `structure`, `japanese`, `prompt`, `promptTranslation`, `mondaiTitle`, `jlpt_filter` | frozen; **not part of the dictionary payload** |
| **translation language** | what language should glosses come back in? | `SUPPORTED_LANGUAGES` / `targetLanguage` | `en` `ta` `ml` | frozen |
| **localized gloss language** | what language is *this returned gloss* in? | architecture §9.1 `glosses[].language` | — | not implemented; still open |
| **locale** | which language should an *AI answer* be written in? | `groundedAnswerService.ts` (`locale?: "en" \| "ja"`) — AI layer only | `en` `ja` | exists elsewhere; **not part of the dictionary payload** and not to be imported into it |
| **query typing** | is the query a word, a phrase, English…? | `RetrievalResult["queryType"]` (AI layer) | `japanese` `romaji` `english` `empty` | separate axis, unchanged |
| **JLPT knowledge state** | is the stored level a real level? | `classifyJlptLevel` → `JlptLevelMeaning` | `known` `unknown` `invalid` | frozen (decision 3) |
| **pagination** | which slice of the ordered set? | `offset` + `limit` | — | frozen (decision 6) |

**Explicit non-equivalences** (these are contract rules, not style notes):

```
Tamil text      ≠ SearchScript "tamil"        (there is no such member; Tamil input → "mixed")
Malayalam text  ≠ SearchScript "malayalam"    (Malayalam input → "mixed")
English text    ≠ SearchScript "english"      (removed in A7; "water" → "romaji")
query language  ≠ detectedScript              (the classifier cannot detect language)
input method    ≠ script classification       (a client may type romaji to mean Japanese)
matchedOn       ≠ SearchScript                (measured: de-mizu → "gloss", es-001 → "english")
matchedOn       ≠ translation language
AI answer locale ≠ translation language       (en|ja answer language vs en|ta|ml gloss language)
AI answer locale ≠ SearchScript               ("ja" is not a character class)
```

---

## 7. JLPT semantics (frozen)

**States available today** (measured): `jlpt_level` is `NOT NULL`; it holds `N5`…`N1`, or the
literal sentinel `"NONE"` written by `normalizeJlpt` when no level is known. A `null`/absent value
is **not** storable on canonical rows, and the classifier maps it to `unknown` for non-canonical
inputs.

| Stored value | `classifyJlptLevel` | `jlptStatus` | Meaning | Lossless? |
| :--- | :--- | :--- | :--- | :--- |
| `N5`…`N1` | `known` | `"known"` | a real JLPT level | yes |
| `"NONE"` | `unknown` | `"unknown"` | no level established / not applicable / not supplied by source — the sentinel **merges these three cases**, which is a pre-existing property of the schema, not of this contract | yes (nothing further is distinguishable in the stored data) |
| any other string | `invalid` | `"invalid"` | a value outside the controlled domain | yes |
| `null` / absent | `unknown` | `"unknown"` | cannot occur on canonical rows | yes |

**Why not `jlptKnown: boolean`:** it collapses `unknown` and `invalid` into one `false`, so a
client could not distinguish "no level established" from "a corrupt level", and the `invalid`
state is genuinely reachable (non-JMDICT rows are not constrained by `normalizeJlpt`).
**Change from the historical target:** the sentinel `"NONE"` is **not** silently rewritten into
`null` by this contract; the raw value remains visible. No schema change is required or proposed.

---

## 8. Result provenance semantics (frozen)

* The mobile dictionary result carries **no** `matchType` and **no** `matchedOn` (decision 2):
  neither is produced for this resource, and the mobile contract may not invent one.
* `matchedOn` belongs to `/api/search` results, is typed `string`, and its vocabulary is
  per-target. **It must never be merged into `SearchScript`** and must never be reused as a
  language or JLPT field.
* JLPT provenance is carried by `jlptLevel` **plus** the derived `jlptStatus` (decision 3).
* Source provenance (`sourceRef`, resolved display form) is governed by architecture §9 and
  §6.1; it is **not** part of the frozen v1 payload, because §6.1 forbids the raw `source_ref`
  string and the resolved form is not yet implemented.

---

## 9. Compatibility rules (frozen)

1. **Additive-only within v1.** New optional fields may be added; existing field names, types,
   and meanings may not change without a new contract revision.
2. **Unknown fields must be ignored by clients, never rejected.** This replaces the historical
   `apiVersion`-assertion policy, which had no implementation.
3. **Applied pagination values are authoritative.** A client must read back `limit`/`offset` and
   must not assume its request was honoured.
4. **`query` is sanitized, not raw** (§4). Clients that need to display the user's literal typing
   must keep it client-side.
5. **Script is server-computed.** A client must not re-derive `detectedScript`; a divergence
   would silently change ranking behaviour.
6. **`"NONE"` is not a level.** Clients must branch on `jlptStatus`, not on `jlptLevel` truthiness.
7. **Retiring a field requires a documented contract revision** — the retirements in §11 are
   possible now *only* because none of them has a producer or a consumer.
8. **Offset is 0-based; `page` is not in the contract.** A client wanting pages converts locally.

---

## 10. Implementation dependencies (for the gate that implements this contract)

| # | Dependency | Why the contract cannot be implemented without it |
| :-: | :--- | :--- |
| D-1 | A DTO projection for result items | The web route spreads raw rows, which violates architecture §6.1 (measured: `senses`, `sourceRef`, `frequencyRank`, `tags` reach the client). The mobile item shape in §3.3 requires a projection layer that does not exist yet |
| D-2 | `hasMore` producer ($3.2) | Frozen formula; no code emits it |
| D-3 | `jlptStatus` projection | `classifyJlptLevel` exists and is tested, but nothing projects it into a payload |
| D-4 | Public-identifier policy | The declared card example uses `de-jmdict-1358280`, which §6.1 explicitly calls an ETL artifact key rather than a stable public id — unresolved (§12) |
| D-5 | Transport decision | Method/path/params-vs-body is not decided (§2, §12) |
| D-6 | Auth model | Out of A9 scope entirely; no authentication exists for a mobile surface |

---

## 11. What this contract changes in the historical document

**Retired from the target contract** (possible only because nothing produces or consumes them):

| Historical field | Historical section | Disposition | Replaced by |
| :--- | :--- | :--- | :--- |
| `queryEcho` | §10.1 | retired (name) | `query` |
| `results` | §8.2, §10.1 | retired (name) | `entries` |
| `matchType` | §10.1 | removed from contract | — (nothing; `matchedOn` stays on `/api/search`) |
| `jlptKnown` | §10.1 | removed | `jlptStatus` (tri-state) |
| `jlpt: { level, known }` | §10.2 | removed | `jlptLevel` + `jlptStatus` on the item |
| `pagination: { limit, offset, returned, hasMore }` | §8.2, §10.1 | object form retired | flat `limit`, `offset` (+ `hasMore`) on `data` |
| `returned` | §8.2 | not adopted | `entries.length` (definition frozen) |
| `page` | §2.2 example, `MobileSearchResponse.page` | retired | 0-based `offset` |
| `apiVersion` | §6.2, §11.1 | retired for v1 | unknown-field tolerance (§9 rule 2) |
| `meta.offsetUnit` | §6.2, §7 | not applicable to this payload | offsets are row offsets, not character offsets |
| `warnings` | §6.2 | deferred | — |
| `totalResults` | declared card type | retired | `total` |
| `executionTimeMs` | declared card type | retired | — (no measured need) |

**Kept from the historical document**: the six-value script axis and its semantics (§10.1), the
never-expose rule (§6.1), the applied-value echo rule (§8.2 rule 3), the no-`null`/`NaN` rule
(§8.2 rule 4), the `MAX_OFFSET` cap (§8.2 rule 5, restated in §5), and the axis separation of §9.

**Still historical / not a specification**: §1–§5's navigation and UX modelling, §2.1's suggest
endpoint, §2.3/§10.2's entry-detail shapes (four competing shapes exist — see §12), §10.6/§10.7
(no endpoints), and the offline-sync types.

---

## 12. Unresolved decisions (explicitly NOT decided by A9)

| # | Item | Why it remains open |
| :-: | :--- | :--- |
| U-1 | Transport (method, path, params vs body) | §2.2 and §10.1 contradict each other; no code, test or consumer decides it (§2) |
| U-2 | Entry-detail contract (§2.3/§10.2) | four competing shapes; outside the eight decisions |
| U-3 | Public identifier for an entry (`de-jmdict-…` vs a stable public id) | §6.1 calls the ETL key a non-public id, yet the declared card uses it (D-4) |
| U-4 | Resolved provenance display form (§9 of the architecture document) | not implemented; not one of the eight decisions |
| U-5 | Localized gloss payload (`glosses[].language`) | translation layer does not exist |
| U-6 | `warnings` / offline-cache self-description | deferred with `apiVersion`; may be re-opened if an offline mode is designed |
| U-7 | Cursor/deep pagination beyond `offset = 100000` | out of contract; needs its own decision |
| U-8 | Auth / rate limiting for a future mobile surface | out of A9 scope (D-6) |

---

**Frozen by Gate A9. Any change to a §1 row, a §3 field, or a §6 axis is a contract revision and
requires an explicit gate — not an implementation convenience.**

---

# A10 — IMPLEMENTATION-READINESS FREEZE

**Resolved by Gate A10 (2026-09-24).** Completes the decisions A9 left open (U-1…U-8) plus the
projection boundary D-1, so that A11 can implement the read-only mobile dictionary search
endpoint **without making a new semantic design decision**. A9 remains authoritative for every
decision it froze; the three A10 corrections to A9-era declarations are marked
**`A10 CORRECTION`** and each is evidence-backed.

Still **`MOBILE RUNTIME API: NOT IMPLEMENTED`** — this section defines no code.

## A10.1 Transport

```text
METHOD:       GET
PATH:         /api/v1/mobile/dictionary/search
REQUEST:      query-string parameters, no request body
CONTENT TYPE: application/json  (Next.js NextResponse.json default; no charset parameter)
ENCODING:     standard percent-encoding; parameters are read from the parsed query string,
              so non-ASCII must be percent-encoded (e.g. 水 → %E6%B0%B4)
UNKNOWN PARAMS: ignored, never an error
```

**Why GET, and why this is not "merely conventional":**

1. **Executable convention (evidence order 1):** all four implemented dictionary read routes
   export `GET` only — `/api/dictionary`, `/api/dictionary/[id]`, `/api/dictionary/entry/[id]`,
   `/api/dictionary/search`. Every route in the repository that reads a request body is a
   *stateful* operation (SRS, quiz/session, analytics, AI answer); no read-only catalog lookup
   does.
2. **Type contracts (order 2):** `MobileSearchRequest` carries no body-specific structure that a
   query string cannot express.
3. **API documentation (order 3):** the historical document contradicts itself —
   §2.2 declares `POST /api/v1/mobile/dictionary/search` while §10.1 declares
   `GET /api/v1/mobile/dictionary/search`. **The path is identical in both**; only the method
   conflicts, and it is resolved by orders 1–2, which are higher.
4. The mobile path prefix `/api/v1/mobile/…` is **documented-only** (it appears in 7 of the 8
   declared mobile routes and in no runtime file). It is frozen as the target path precisely
   because no runtime peer exists to conflict with; A11 must not also mount the web path.

## A10.2 Request parameters (frozen)

| Wire name | Type | Required | Domain / bounds | Default | Maps to |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `q` | string | **yes** | non-empty after sanitization; **no maximum length in v1** (§A10.4) | — | `MobileSearchRequest.query` |
| `limit` | integer | no | 1…200 at the boundary; applied 1…100 | **50** | `MobileSearchRequest.limit` |
| `offset` | integer | no | 0…100 000, 0-based | **0** | `MobileSearchRequest.offset` |
| `level` | string | no | `N5`…`N1` (**not validated server-side** — measured) | — | `MobileSearchRequest.level` |
| `jlpt` | string | no | legacy alias of `level` | — | `MobileSearchRequest.level` |
| `common` | `"true"` \| `"false"` | no | literal strings only; anything else is ignored | — | `MobileSearchRequest.common` |
| `targetLanguage` | `en` \| `ta` \| `ml` | no | `SUPPORTED_LANGUAGES` | — | `MobileSearchRequest.targetLanguage` — **inert in v1** (§A10.12) |

* **`level`/`jlpt` precedence (measured, not chosen):** `level` is read first; when it is absent or
  empty after trimming, `jlpt` is used; the surviving trimmed value becomes
  `data.appliedJlptLevel`. Sending both is therefore not an error — `level` wins.
* **`common` uses the literal-string rule of the implemented `parseBooleanFlag`:** only `"true"`
  and `"false"` have meaning; `"1"`, `"yes"` and similar are treated as absent.
* **The nested `filters` object of the 14.4A-era declared types has no wire form.**
  **`A10 CORRECTION`**: `MobileSearchRequest.filters` is removed; the two of its seven fields that
  have an implemented counterpart are the flat `level`/`common` above, and the rest
  (`partsOfSpeech`, `hasKanji`, `hasExamples`, `hasKeigo`, `register`) have **no producer** and are
  deferred rather than accepted-and-ignored.
* **`page` is not a parameter.** It is ignored if sent (measured) and is not part of this contract.

## A10.3 Defaults

| Field | Default | Applied by |
| :--- | :--- | :--- |
| `limit` | 50 | route boundary (`DEFAULT_PAGE_LIMIT`) |
| `offset` | 0 | route boundary |
| `level` / `jlpt` | absent → `appliedJlptLevel: null` | route boundary |
| `common` | absent → no `isCommon` predicate | route boundary |
| `targetLanguage` | absent | no effect in v1 |

## A10.4 Limits (operational boundary — A9's decision U-7)

| Boundary | Value | Behaviour |
| :--- | :--- | :--- |
| minimum `offset` | 0 | a negative offset is **clamped to 0** (not an error) and the applied value is echoed |
| maximum `offset` | 100 000 (`MAX_OFFSET`) | larger values are clamped to 100 000 and echoed |
| default `limit` | 50 | used when absent, empty or unparseable |
| maximum `limit` (boundary) | 200 (`MAX_PAGE_LIMIT`) | larger values are clamped at the boundary |
| maximum `limit` (applied) | 100 | the service applies its own tighter ceiling; **the applied value is what the response echoes** |
| beyond maximum | clamped, never an error | a client detects clamping only by reading back the applied values |
| at a clamped offset | applied value echoed | `hasMore` is then not meaningful (§A10.10) |
| beyond 100 000 | **out of contract** | no cursor pagination is introduced; a performance gate is an explicit A12 dependency |
| maximum `q` length | **none in v1** | parity with the implemented web route, which has no cap (measured). A defensive cap is recorded as a **security-gate dependency**, not silently invented here |

## A10.5 Public identifier (U-3)

```text
PUBLIC ID:        the entry `id` string, verbatim (e.g. "de-jmdict-1395600", "de-mizu")
SOURCE:           dictionary_entries.id — the text primary key
STABILITY:        stable for the row's lifetime; for corpus rows it is deterministic from the
                  JMdict ent_seq (`de-jmdict-${ent_seq}`, frozen in Phase 14.3A-B), so it is
                  reproducible across re-ingestions of the same release
CLIENT-SAFE:      yes, for identification. It is NOT opaque: it encodes the source and the
                  ent_seq, which architecture §6.1 flagged as an ETL artifact key
MOBILE-CANONICAL: `id`, and only `id`
```

* **There is no other identifier to offer.** `dictionary_entries` has exactly 12 columns and
  **`ent_seq` is not one of them** — it exists only inside `id`. There is no slug, no surrogate
  numeric key and no public-id column.
* **`ent_seq` is therefore never exposed as a separate field**; doing so would duplicate meaning
  already carried by `id`.
* **Headword-addressed lookup is not part of the mobile contract.** The web detail route accepts
  a headword as a convenience; headwords are not unique, and extending that to mobile would
  require a slug policy that does not exist.
* A10 **changes no identifier**: no rename, no alias, no migration, no new id scheme. §6.1's
  objection (an opaque public id would be cleaner) is recorded as a **deferred decision**
  (§A10.17, D-4) because satisfying it requires a migration or an alias table — both forbidden in
  A10 and neither authorized by A11.

## A10.6 Search-item projection (D-1)

The mobile item is a **projection**, never a row spread. **A11 must not emit `...row`.**

### Source columns (`dictionary_entries` has exactly these 12)

| Source field | Mobile field | Include? | Reason |
| :--- | :--- | :--- | :--- |
| `id` | `id` | **YES** | the public identifier (§A10.5) |
| `headword` | `headword` | **YES** | canonical spelling; the primary display form |
| `reading` | `reading` | **YES** | kana reading; already public on the web surface |
| `romaji` | `romaji` | **YES** | latin reading; already public |
| `jlptLevel` | `jlptLevel` | **YES** | verbatim, **including `"NONE"`** (A9 §7) |
| `jlptLevel` (derived) | `jlptStatus` | **YES** | `classifyJlptLevel` → `known`/`unknown`/`invalid` (A9 §7) |
| `isCommon` | `isCommon` | **YES** | learner-relevant, already declared, no provenance risk |
| `senses` (jsonb) | `primaryGlosses` | **YES — flattened** | §6.1 forbids exposing the `senses[].glosses[]` nesting; emit a flat gloss list. The flattening already exists in-repo in the unified search dictionary branch (`senses.flatMap(s => s.glosses)`) |
| `kanjiCharacters` (jsonb) | `kanjiCharacters` | **YES** | array of characters the headword uses; already public through the kanji links |
| `frequencyRank` | — | **NO — deferred** | an internal ranking signal; A4 established that `frequencyRank`/`isCommon` must not influence relevance, and exposing it invites clients to re-rank. Not in the frozen card |
| `partsOfSpeech` | — | **NO — deferred** | needs a controlled-vocabulary decision; no client need established |
| `tags` | — | **NO — deferred** | editorial classification; not in the frozen card |
| `sourceRef` | — | **NO — never** | §6.1 never-expose: raw provenance string. Provenance must be *resolved* into a display form first, and that form does not exist yet (§A10.17, D-5) |

### Fields declared on the 14.4A-era card with **no producer** (A10 CORRECTION)

These are **removed from the v1 item type** rather than emitted as placeholders:

| Field | Why it cannot be produced | Disposition |
| :--- | :--- | :--- |
| `localizedGlosses` | no read path serves translations; see §A10.12 | deferred (D-6) |
| `isKeigo` | **zero producers** in `src`; keigo is a graph relation list, not an entry-row boolean | deferred (D-7) |
| `keigoType` | same — derives from the keigo graph, not from the entry row | deferred (D-7) |
| `hasAudio` | **zero producers**; no audio exists for dictionary entries | deferred (D-8) |
| `audioUrl` | the only `audio_url` columns belong to kana and quiz questions, **not** dictionary entries | deferred (D-8) |

Emitting `false`/`null` for these would report a measured fact the server does not have — the same
class of error A7 removed when it deleted the unreachable `"english"` script member.

## A10.7 Entry-detail relationship (U-2)

**Frozen: a summary/detail relationship — the search item is the summary DTO; the detail is a
separate, larger DTO. The detail endpoint is NOT part of v1 and is deferred to A12.**

Evidence: the two implemented web detail routes return materially different payloads from the
same service —
`GET /api/dictionary/[id]` → `{ success, data: { entry, source, kanji, sentences, relatedGrammar } }`,
`GET /api/dictionary/entry/[id]` → `{ success, data: { ...detail, kanjiEdges, keigo, headwordKanji } }`
— and both spread a full canonical row inside `entry`. A search *list* must not carry
sentences/grammar/graph edges (payload weight, and §6.1), so the two shapes cannot be one.

Consequences for A11: implement **search only**; do not add a third detail route; the mobile
detail DTO remains unfrozen until the provenance display form (D-5) and the detail field set are
decided in A12.

## A10.8 JLPT representation (unchanged from A9)

`jlptLevel` (raw, sentinel-preserving) **and** `jlptStatus` (`known` \| `unknown` \| `invalid`) are
both on the item. **No boolean.** `data.appliedJlptLevel` is the *filter* echo and is a different
field from the item's `jlptLevel` — a response may legitimately carry
`appliedJlptLevel: "N5"` with an item whose `jlptLevel` is `"NONE"` when a row matched by another
field. Clients must not conflate the two.

## A10.9 Pagination (unchanged from A9)

0-based `offset` + `limit`; flat on `data`; applied values echoed; no `page`, no cursor, no
`pagination` object, no `returned` (§A10.4 for the exact boundary table).

## A10.10 `hasMore`

`hasMore = offset + entries.length < total`, computed from the **applied** values, with the
clamped-offset caveat of A9 §5: it is meaningful only while the echoed `offset` equals the
requested offset. The response always echoes the applied values, which is what makes the
substitution detectable.

## A10.11 Language axes (unchanged from A9)

`SearchScript` (six character classes) ≠ `targetLanguage` (`en`/`ta`/`ml`) ≠ locale (AI-answer
layer only, `en`/`ja`) ≠ gloss language ≠ query language (never inferred from script). A10 adds
no axis and no locale.

## A10.12 Localized gloss policy (U-5)

**Frozen: v1 exposes canonical glosses only (`primaryGlosses`). Localized glosses are DEFERRED;
`targetLanguage` is accepted and inert.**

Audited reality: a multilingual storage layer **exists** — `entity_translations` (migration
`0001`) with `language` (`en`/`ta`/`ml`), `sourceType` (`canonical`/`verified_human`/`machine`),
`isVerified`, and `TranslationService.getTranslations()` which sorts verified-first. But:

* **no API route reads it** (nothing in `src/app/api` imports `translationService`), so there is no
  read path to reuse;
* the storage primitive documents that it "performs no authorization and must never be wired to an
  API route" (13.5C decision A) — wiring it needs an authorization decision, which is a security
  gate, not an A11 detail;
* translations are **not guaranteed to exist** for a given entry, and `sourceType: "machine"` means
  exposing them unlabelled would violate the labelling rule the architecture already accepts.

Therefore: **no `localizedGlosses` field in v1**, no fallback translation, no translation table
change. A12 may add localized glosses only with per-gloss provenance (`sourceType` + `isVerified`)
and an authorization decision.

`targetLanguage` stays in the request contract because A9 froze it, and its v1 semantics are
frozen here explicitly: **accepted, validated against `SUPPORTED_LANGUAGES`, and having no effect
on the response.** A11 must not reject it (that would invent an error) and must not claim
localization (that would be false). A client must not assume localized glosses in v1.

## A10.13 Warnings / offline policy (U-6)

**Frozen: no `warnings`, `offline`, `degraded`, `stale` or `fallback` field in v1.**

Evidence: `git grep` across `src/app/api` finds **no** producer for any of these on a dictionary
response (the only `warnings` array in the codebase belongs to the knowledge-provenance service,
an unrelated surface). Failures are expressed by HTTP status plus the error envelope; offline
state is client-owned; the web route's best-effort graph enrichment already degrades *silently* to
the canonical record, and the mobile search endpoint performs no such enrichment. A future
degradation signal requires a producer first.

## A10.14 Authentication (U-8)

```text
AUTH:                  NONE — the endpoint is public and read-only
IDENTITY REQUIREMENT:  none for search
```

Evidence: the dictionary routes carry no guard (no session or actor check), while the routes that
do guard are user-scoped (`/api/srs/**`, `/api/jlpt/session/**`, `/api/srs/personal/**`). Dictionary
data is published, non-personal canonical content; requiring identity would add no protection it
does not already have and would block the offline-first client the contract targets.

## A10.15 Rate limiting (U-8)

```text
RATE LIMIT:        none in v1 (none exists anywhere in the repository for our own routes)
ABUSE PROTECTION:  DEFERRED — a prerequisite of the deployment/security gate
```

Evidence: the only `rateLimit` symbols in `src` are AI-provider *error* constructors
(`AIErrors.rateLimited`), not inbound request limiting. **A11 must not invent a limiter**, and the
unauthenticated endpoint must not be deployed to production before a security gate decides
rate limiting and abuse protection — the search predicate is an `ILIKE` scan, so unbounded
unauthenticated traffic is a real cost vector. This is a documented **A12/security dependency**,
not an A11 task.

## A10.16 Error contract

Unchanged from A9 and identical to the implemented dictionary routes:

```jsonc
{ "success": false, "error": { "code": "MISSING_QUERY", "message": "…" } }   // 400
```

| Condition | Status | `error.code` | Applied parameter echo |
| :--- | :--- | :--- | :--- |
| `q` missing / blank / NUL-only after sanitization | 400 | `MISSING_QUERY` | none; the service is never called |
| entry not found (detail only — not in v1) | 404 | `NOT_FOUND` | — |
| unexpected failure | 500 | `INTERNAL_ERROR` | none |
| zero matches | **200** | — | `entries: []`, `total: 0`, `hasMore: false` (never 404) |
| out-of-range `limit`/`offset` | **200** | — | clamped values echoed (never an error, never `null`/`NaN`) |
| unknown parameter (incl. `page`) | **200** | — | ignored |

## A10.17 Deferred decisions (explicit; each is an A12 dependency, not an A11 task)

| # | Item | Why deferred | Blocking A12? |
| :-: | :--- | :--- | :--- |
| D-4 | Opaque public identifier | would require a migration or alias table (forbidden in A10/A11) | no — `id` is sufficient for v1 |
| D-5 | Resolved provenance display form (§9) | unimplemented; needed before any provenance field is exposed | yes, for detail |
| D-6 | Localized gloss payload | needs a read path + authorization decision + per-gloss provenance labelling | yes, for localization |
| D-7 | Keigo fields on an item (`isKeigo`, `keigoType`) | produced by the graph layer, not by the entry row; needs a per-item graph cost decision | no |
| D-8 | Audio (`hasAudio`, `audioUrl`) | no dictionary-entry audio exists | no |
| D-9 | Entry-detail DTO + endpoint | blocked by D-5; two competing web shapes must be reconciled first | yes, for detail |
| D-10 | Richer filters (`partsOfSpeech`, `hasKanji`, `hasExamples`, `register`) | no producers | no |
| D-11 | `warnings` / offline self-description | no producer; offline is client-owned | no |
| D-12 | Deep/cursor pagination beyond offset 100 000 | needs a performance gate and an index decision | no |
| D-13 | Rate limiting / abuse protection | security gate before production deployment | deployment-blocking |
| D-14 | Defensive maximum `q` length | parity with web frozen for v1; a cap is a security decision | no |

## A10.18 A11 implementation boundaries

```text
A11 MAY:
- implement the frozen read-only mobile dictionary API
- implement the frozen transport
- implement the frozen request validation
- implement the frozen entry projection
- implement the frozen response envelope
- implement the frozen pagination semantics
- implement the frozen error semantics

A11 MUST NOT:
- redesign the contract
- change SearchScript
- reintroduce queryEcho
- reintroduce matchType
- replace jlptStatus with a boolean
- introduce page pagination
- expose raw DB rows
- alter web dictionary behaviour
- alter database schema unless a separately authorized gate permits it
- access production
```

**A11 scope note:** v1 is the **search** endpoint only. Detail (D-9), localization (D-6), the
`hasMore`/`jlptStatus` producers and the item projection are all specified above, so no semantic
decision remains — but any change to `src/db/schema.ts` or `drizzle/**` is outside A11, and the
security decisions D-13/D-14 must be resolved before any production deployment.

---

# A11 — MOBILE DICTIONARY SEARCH API (IMPLEMENTED)

**Status: IMPLEMENTED.** Gate A11 turned the A9/A10 freeze into the smallest runtime implementation
that satisfies it. Nothing in A9 or A10 was redesigned; where the implementation met reality, the
outcome is recorded below rather than silently patched into the contract.

## A11.1 Implemented surface

```text
ROUTE:      src/app/api/v1/mobile/dictionary/search/route.ts   (GET only)
ADAPTER:    src/app/api/v1/mobile/dictionary/search/_lib.ts    (pure projection + validation)
TRANSPORT:  GET, query-string parameters, no request body, application/json
```

Verified over real HTTP (Next.js dev server, disposable database):

| Request | Result |
| :--- | :--- |
| `GET ?q=mizu` | `200` — frozen success envelope |
| `GET` (no `q`) | `400` — `MISSING_QUERY` |
| `POST` / `PUT` / `PATCH` / `DELETE` | `405` — Next.js standard, no custom method framework |
| `HEAD` | `200` — Next.js derives HEAD from GET per HTTP semantics; no separate handler |
| `GET ?q=mizu&page=2` | `200` — `page` ignored, not translated into `offset` |

Headers: `content-type: application/json` only; no caching policy is invented (deployment concern).

## A11.2 Implementation status

| Capability | A10 decision | A11 status |
| :--- | :--- | :--- |
| Search route | frozen | **IMPLEMENTED** |
| GET transport | frozen | **IMPLEMENTED** |
| Query sanitation | frozen | **IMPLEMENTED** (`sanitizeSearchQuery`, reused) |
| Script classification | frozen | **IMPLEMENTED** (`detectSearchScript`, reused) |
| Target language validation | Validate/inert | **IMPLEMENTED / INERT** |
| JLPT status | frozen | **IMPLEMENTED** (`classifyJlptLevel`, reused) |
| Entry projection | frozen (9 fields) | **IMPLEMENTED** (`_lib.projectEntry`) |
| Pagination | frozen | **IMPLEMENTED** (shared `parseLimit`/`parseOffset`) |
| `hasMore` | frozen | **IMPLEMENTED** (exact, applied window) |
| Error envelope | frozen | **IMPLEMENTED** (safe 500 message) |
| Entry detail | deferred | **NOT IMPLEMENTED** |
| Localization | deferred | **NOT IMPLEMENTED** |
| Authentication | deferred | **NOT IMPLEMENTED** |
| Rate limiting | deferred | **NOT IMPLEMENTED** |
| Deep pagination optimization | deferred | **NOT IMPLEMENTED** |

## A11.3 Reuse map (A11 is an adapter, not a second engine)

| Concern | Owner (unchanged) |
| :--- | :--- |
| matching, ranking, filters, ordering | `DictionaryService.searchEntries` |
| query sanitation | `services/search/matcher.sanitizeSearchQuery` |
| script classification | `services/search/matcher.detectSearchScript` |
| pagination bounds | `lib/api/routeParams` (`MAX_PAGE_LIMIT`, `DEFAULT_PAGE_LIMIT`, `MAX_OFFSET`) |
| JLPT classification | `services/dataquality/jlptChecks.classifyJlptLevel` |
| error envelope | `lib/api/routeParams.errorBody` |
| publication overlay degradation | `services/publication/resolveLearnerEntries` (best-effort, canonical fallback) |

No web route, service, DTO or SQL was modified by A11.

## A11.4 Response projection

`_lib.projectEntry` is the **only** conversion from a canonical row to a mobile payload, and the
route maps over it (`result.entries.map(projectEntry)`) — so a `{ ...row }` regression is a compile
error, not a silent leak. Emitted keys, verbatim:
`id`, `headword`, `reading`, `romaji`, `primaryGlosses`, `jlptLevel`, `jlptStatus`, `isCommon`,
`kanjiCharacters`.

`primaryGlosses` flattens `senses[].glosses[]` from storage order; malformed `jsonb` is skipped
rather than allowed to throw inside a read path.

## A11.5 Error behaviour (one deliberate deviation, recorded)

The failure envelope is identical to the frozen shape, and `MISSING_QUERY` is byte-identical to the
web route. **One deviation, in the safe direction:** on an unexpected failure the implemented web
route echoes `error.message` to the client, which can carry SQL text, hostnames, connection
strings or filesystem paths. The mobile route emits a fixed
`error: { code: "INTERNAL_ERROR", message: "Dictionary search failed" }` and logs the diagnostic
server-side only. The frozen contract fixes the envelope and the code, not the human string
(§A10.16: "`message` is human-oriented and may change without a contract revision"), so this is
input/output hardening under A11 §14/§16 rather than a contract change.

## A11.6 Deviations, corrections and open tensions

1. **No contract contradiction was found.** Every frozen item was implementable as written. The
   stop-and-report trigger for "A10 cannot be implemented consistently" did not fire.
2. **`targetLanguage` is validated but genuinely unobservable.** A10 froze "accepted, validated
   against `SUPPORTED_LANGUAGES`, and having no effect on the response". The route parses it
   through `_lib.parseTargetLanguage`; the parsed value reaches neither the service nor the
   response. The tested guarantee is inertness (`en`/`ta`/`ml`/unsupported all produce byte-identical
   payloads); "validated" is therefore a code-level boundary awaiting its A12 consumer, and is
   **not** claimed as an observable behaviour.
3. **`MobileSearchRequest.level` is narrower than the wire.** The declared type is the `N5`…`N1`
   union, but A10 §A10.2 measured that the server does not validate the level. The route therefore
   passes the trimmed string straight through (an out-of-domain value yields an empty page, not a
   400), exactly as measured and frozen. The declared type remains the documented *client* domain.
4. **The four `src` occurrences of retired terms in the new files are prose.** `page`, `returned`,
   `apiVersion`, `meta`, `warnings`, `sourceRef` appear only inside docblocks that enumerate what is
   retired or excluded; the emitted payload contains none (verified over HTTP).

## A11.7 Test coverage

| Suite | Tests | Layer |
| :--- | ---: | :--- |
| `tests/mobile-dictionary-search-api.test.ts` | 42 | contract + adapter, **DB-free** (mocked service) |
| `tests/mobile-dictionary-search-api-live.test.ts` | 7 | **live** route over the seeded first-party corpus |

The live layer skips with an explicit reason when no database is reachable; it never fabricates rows.

Boundary coverage is exact rather than approximate: `limit=1` (minimum), `limit=50` (default sent
explicitly), `limit=100` (applied ceiling), `limit=200` (maximum boundary), `limit=201` (just above
→ clamped), `offset=0`, `offset=100000` (maximum), `offset=100001` (just above → clamped), plus
`0`/`-5`/`abc`/`Infinity`/`NaN`/`999999999`, and the applied-value echo when the service's own
ceiling is tighter than the route boundary.

## A11.8 Explicitly deferred (unchanged by A11)

Detail (D-9), localization (D-6), keigo/audio item fields (D-7, D-8), richer filters (D-10),
`warnings`/offline (D-11), deep or cursor pagination (D-12), authentication and rate limiting
(D-13), and a defensive `q` length cap (D-14) remain deferred exactly as A10 recorded them. A11
implemented none of them, and **the endpoint is not approved for production exposure until the
deployment security gate resolves D-13/D-14.**

---

# A12 — HARDENING DECISIONS (append-only; A10/A11 text above is preserved verbatim)

Gate A12 reviewed the deferred items D-4…D-14 against the repository and implemented **exactly one**
of them: the defensive `q` length cap (D-14). Everything else was re-audited and left unchanged. No
A10/A11 statement above was edited; the statements A12 supersedes are named by section below, so the
history reads as history.

## A12.1 `q` maximum length (D-14) — **IMPLEMENTED**

A10 §A10.4 froze `q` as required-but-unbounded; A12 supplies the number.

| Property | Frozen value |
| :--- | :--- |
| Maximum `q` length | **1000 UTF-16 code units** (`String#length`, JavaScript semantics) |
| Measured on | the **sanitized** value — `sanitizeSearchQuery` (NUL-strip + trim) runs first, exactly as for the existing `MISSING_QUERY` judgement |
| Over-limit behaviour | **400, rejected — never truncated.** The service is never called, so a shortened query is never answered |
| Error code | **`VALIDATION_ERROR`** (new to this endpoint, see below) |
| Message | `Query parameter 'q' must be at most 1000 characters` |
| Envelope | unchanged — `{ "success": false, "error": { "code", "message" } }` |
| Boundary | `q` of exactly 1000 → `200`; 1001 → `400` |

**Why 1000.** The number is not invented in this gate: it mirrors the repository's existing public
validation surface, the module-private `MAX_QUERY_LENGTH = 1000` in
`src/app/api/ai/answer/route.ts`. It is deliberately mirrored rather than imported (that constant is
not exported and the AI route is not a dependency of the mobile boundary).

**Why a cap at all (measured, not assumed).** Gate A12 measured the real `DictionaryService`
query path on a disposable PGlite instance seeded with 100 000 synthetic rows plus the 30-row
first-party corpus. Search cost is **linear in `q` length**, because the `ILIKE '%' || q || '%'`
predicate is attempted at every scanned row:

| `q` length | class | measured time | local, disposable, synthetic fixture |
| ---: | :--- | ---: | :--- |
| 1 | latin (`a`) | 1 001 ms | matches all 100 029 rows (worst case: full result set) |
| 100 | latin | 1 557 ms | |
| 1 000 | latin | 8 863 ms | at the frozen cap |
| 10 000 | latin | 83 730 ms | what "unbounded" permits |

With D-13 (rate limiting) deferred, an unbounded `q` lets one unauthenticated request buy ~9 s of
server work at 1000 characters, and ~84 s at 10 000 — a per-request amplification vector, not merely
an untidy input.

**What the cap does *not* do.** It bounds one request's work; it is **not** abuse protection. The cost
*at* the cap remains high (last row above), and D-13 remains unresolved — the endpoint is still not
approved for production exposure until the deployment security gate decides D-13. A12 deliberately
added no in-process/in-memory limiter, which would have looked like protection without being
production-approved.

**`VALIDATION_ERROR` is an addition to this endpoint's code vocabulary.** A10 §A10.16 lists
`MISSING_QUERY` (400), `NOT_FOUND` (404) and `INTERNAL_ERROR` (500). The cap adds a fourth: a
*present-but-invalid required* parameter is not a *missing* one, and the code is the repository-wide
convention for that case (`src/app/api/ai/answer/route.ts`, 18 uses, including its own overlong-query
branch). The envelope shape is unchanged. Empty/blank/NUL-only `q` still returns `MISSING_QUERY`
unchanged — empty and over-limit are judged on the same sanitized string, so they cannot disagree.

## A12.2 Statements above superseded by A12 (history preserved, not rewritten)

| Superseded statement | Location | Now |
| :--- | :--- | :--- |
| `q` … "**no maximum length in v1**" | §A10.4 parameter table (line 371) | capped at 1000 by §A12.1 |
| "[cap] remain[s] deferred exactly as A10 recorded them … A11 implemented none of them" | §A11.8 (lines 767–769) | D-14 is **implemented**; the rest of §A11.8 still holds |
| "`tests/mobile-dictionary-search-api.test.ts` \| 42" | §A11.7 coverage table | 48 after A12 same-file additions (§A12.6) |

Everything else in §A10.x and §A11.x stands unchanged, including A11.5's deliberate safe-500
deviation and A11.6's open tensions.

## A12.3 Decision status after A12

| # | Decision | A12 verdict | Evidence / reason |
| :-: | :--- | :--- | :--- |
| D-4 | Opaque public identifier | **DEFERRED** | 4 migrations (`0000`–`0003`), no alias table; would require schema → not authorized by this gate |
| D-5 | Resolved provenance display form | **DEFERRED** | still unimplemented, as recorded; it is the precondition A12 names for D-9 |
| D-6 | Localized gloss payload | **DEFERRED** | no provenance-safe translation read path; `targetLanguage` remains validated-and-inert |
| D-7 | Keigo fields on an item | **DEFERRED** | produced by the graph layer, not the entry row; per-item graph cost unresolved |
| D-8 | Audio (`hasAudio`/`audioUrl`) | **DEFERRED** | no dictionary-entry audio producer exists |
| D-9 | Entry-detail DTO + endpoint | **DEFERRED — blocked** | §A10.7 defers the DTO to A12; the authoritative handoff (A11.5 §5) requires its **own frozen detail contract before implementation** and records it as blocked by D-5. A12 therefore froze no detail payload and added no route, rather than inventing one. Field matrix recorded in the A12 report. |
| D-10 | Richer filters | **DEFERRED** | no producer for `partsOfSpeech` / `hasKanji` / `hasExamples` / `register` as *filters* |
| D-11 | `warnings` / offline self-description | **DEFERRED** | no producer; offline semantics are client-owned |
| D-12 | Deep/cursor pagination | **DEFERRED** | measured: cost is **offset-insensitive** (260–303 ms at offset 0 vs 100 000) and dominated by a full scan + a 20 MB disk sort of the whole match set; a cursor would not remove either, so no redesign and no index was added |
| D-13 | Rate limiting / abuse protection | **DEFERRED — deployment gate** | OPTION B: no `middleware.ts`, no limiter dependency, no configured provider; only CMS routes are authorized, dictionary routes are unguarded by design (read-only). Never claimed as protected |
| D-14 | Defensive `q` maximum length | **IMPLEMENTED** | §A12.1 |

`BLOCKED ≠ deferred`: only D-9 is recorded as blocked, and its blocker (D-5) is named.

## A12.4 Surface frozen by A12

Only `q` length validation was added. Unchanged and re-verified: the path and GET-only transport, the
9-field item projection (no `{ ...row }`), `query`/`detectedScript`/`appliedJlptLevel`/`entries`/
`total`/`limit`/`offset`/`hasMore`, the applied-value echo and the `hasMore` formula, all pagination
bounds, script classification, JLPT tri-state, `targetLanguage` inertness, the retired-term set, and
the safe 500. No schema, migration, index or SQL change; no change to any web API route.

## A12.5 Test coverage after A12

| Suite | Tests | Layer |
| :--- | ---: | :--- |
| `tests/mobile-dictionary-search-api.test.ts` | 55 | contract + adapter, DB-free (42 at A11 → 48 for the D-14 cap → 55 with the A12 decision guards) |
| `tests/mobile-dictionary-search-api-live.test.ts` | 7 | live route over the seeded first-party corpus |

Cap coverage is boundary-exact: exactly 1000 accepted, 1001 rejected with `VALIDATION_ERROR` and no
service call, NUL-padding measured after sanitation, a wildcard-laden over-limit query rejected, and
the code-unit semantics pinned (`𠮷`.repeat(500) within, `.repeat(501)` over).

Decision guards added by A12 pin the *deferrals*, so a future change cannot quietly reverse them:
the item carries no detail-only field (`alternativeHeadwords`…`userState`, `provenance`, `sourceId`,
`sourceRef`), the identifier is emitted verbatim with no `ent_seq`, repeated requests are not
throttled and no limiter/middleware import exists in the route (D-13 is *not* implemented), the
pagination surface stays offset-based with no cursor, and the contract itself is asserted to record
the A12 decisions.

## A12.6 Entry-detail contract (D-9) — **NOT FROZEN by A12, deliberately**

A12 audited D-9 and **did not freeze a detail payload**. This is the recorded reason and the field
matrix a future detail gate must start from.

**A declared detail shape already exists in the repository and must not be adopted as-is.**
`src/types/mobileDictionary.ts` declares `MobileDictionaryDetailResponse` (plus the
`MobileSwipeSection*` family) — a design sketch with **no runtime producer**: no route, no service
method, no test, and no code path emits it. Its field list cannot be frozen because it violates rules
that are already binding:

| Field in the declared shape | Problem | Verdict |
| :--- | :--- | :--- |
| `provenance.sourceId` | an **internal source identifier** (the `knowledge_sources.id`), plus the display form D-5 has not decided | forbidden / blocked |
| `userState` (`isBookmarked`, `userLists`, `hasPersonalNote`, `srsStatus`) | per-user data; requires authentication and user state, neither of which exists (D-13 deferred, no auth) | no producer |
| `conjugations`, `synonyms`, `antonyms`, `phrases`, `collocations` | types only: no table, no service, no producer (`SynonymRelation`/`AntonymRelation` are interfaces without a store) | no producer |
| `alternativeHeadwords`, `alternativeReadings` | computed inside the JMDICT ETL transformer but **not persisted** — `dictionary_entries` has no column for them | requires schema/ingestion |
| `keigo` | producer exists (`kanjiLexicalGraphService.getKeigoRelations`) but its semantics and per-item cost are undecided (D-7) | deferred |
| `MobileSwipeSectionSentence.sourceRef` | raw provenance string, the same never-expose rule as the search DTO | forbidden |
| `kanjiList`, `exampleSentences`, `meanings` | producers exist but each needs a curated projection (raw rows carry `sourceRef` and internal columns) | decisions required |

**What the only existing producer would return.** `DictionaryService.getEntryDetail(idOrHeadword)`
returns `{ entry, source, kanji, sentences, relatedGrammar }` where `entry` is a full canonical row
and the other four members are **raw rows of adjacent tables** (`knowledge_sources` including `url`,
`license`, `imported_at`, `record_count`; `kanji_entries`, `example_sentences`, `grammar_patterns`
each including `source_ref`). Spreading any of them at the boundary would violate §6.1 and the
never-expose rules above.

**Therefore:** the detail DTO remains unfrozen; the search item stays the frozen summary DTO; no
detail route exists. A future gate must (1) resolve D-5 into a display form, (2) freeze the detail
field set with its own decision record, and (3) implement the projection behind it — in that order,
per A10 §A10.7 and the A11.5 handoff §5.

## A12.7 Rate-limit application contract (D-13) — enforcement delegated to the deployment layer

A12.4/D-13 resolved rate limiting as a **deployment gate** (OPTION B). The application-side contract is
frozen here so a future implementer does not have to guess it, and so nothing is silently promised.

**What the application does today (measured, not assumed):**

| Property | Frozen state |
| :--- | :--- |
| Limiter in the application | **none** — no `middleware.ts`, no limiter module, no rate-limit/KV/cache dependency among the 24 packages |
| HTTP 429 emitted by the application | **never** — the route can return only `200`, `400` (`MISSING_QUERY`, `VALIDATION_ERROR`) and `500` (`INTERNAL_ERROR`) |
| `Retry-After` header | **never emitted**; not defined, because no producer exists |
| Authentication / identity | none on this endpoint; it is public read-only |
| Enforcement point | **the deployment layer** (hosting/proxy platform), which A12 does not configure |

**The deployment gate owns these decisions, and must record them before production exposure:**
identity/key (what the limiter keys on, e.g. IP or client id — no identity exists in-app today),
window, threshold(s), response shape, `Retry-After` behaviour, and local/test behaviour. A12
deliberately **does not invent** any of these values.

**Explicit non-claims.** The `q` length cap (§A12.1) bounds one request's work; it is **not** abuse
protection. No in-process, per-instance or in-memory limiter exists or was added, because such a
mechanism would be ineffective on multi-instance hosting while appearing to be protection. The
endpoint is **not approved for production exposure** until the deployment gate resolves D-13.

**Transport-layer observation (informational, not part of this contract).** In the local development
server, a request line above roughly 16 000–17 000 characters is rejected by the HTTP layer with
`431 Request Header Fields Too Large` (empty body, `Connection: close`) *before* the route runs; at
16 000 characters the application still answers `400 VALIDATION_ERROR` for over-cap `q`. This ceiling
belongs to the HTTP server/hosting platform, is not implemented or controlled by NihongoBridge, and
must not be relied upon as a security boundary.

---

# A13 — PRODUCTION-READINESS CONFIRMATION (append-only; all A10/A11/A12 text above is preserved verbatim)

Gate A13 re-measured the frozen surface instead of extending it. It added **no** route, **no** payload
field, **no** filter, **no** schema object, migration or index. Four statements below *deepen* what
A10/A11/A12 recorded; where they refine an earlier sentence, the refinement is stated explicitly and
the earlier sentence is quoted rather than edited.

## A13.1 Ordering — where exact-match promotion actually happens (refinement of §5)

§5 describes the implemented pipeline as `WHERE → COUNT(*) → ORDER BY → LIMIT/OFFSET → 1:1
publication overlay → stable exact-match re-sort`. Read literally, the last clause suggests that
exact-match promotion happens *after* the page has been cut, i.e. within a page only. Measured against
`DictionaryService.searchEntries` (A13 §10, live disposable database), that placement is misleading:
promotion is a **global rank inside the SQL `ORDER BY`**, and the JavaScript pass that follows is an
order-preserving no-op.

The implemented `ORDER BY` is a `CASE` ladder applied to the whole result set before `LIMIT`/`OFFSET`:

| Rank | Condition | 
| :--- | :--- |
| 1 | `headword = q` **and** `jlpt_level != 'NONE'` |
| 2 | `headword = q` |
| 3 | `reading = q` **and** `jlpt_level != 'NONE'` |
| 4 | `reading = q` |
| 5 | `lower(romaji) = lower(q)` |
| 6 | `senses::text ILIKE '%"q"%'` **and** `is_common = true` |
| 7 | `senses::text ILIKE '%"q"%'` |
| 8 | everything else that matched |

Ties inside a rank fall through to `frequency_rank ASC NULLS LAST, is_common DESC, id ASC`. Two
consequences the contract now states explicitly:

1. **Exact matches cannot appear on a later page.** They occupy the head of the global order, so a
   conforming client that paginates sees them on the first page(s) only — including when a better
   `frequency_rank` row also matched. Measured on the seeded corpus: `q=hon` returns `de-hon`
   (`romaji = "hon"`, rank 5, `frequency_rank` 150) **before** `de-nihon` (`romaji = "nihon"`, rank 8,
   `frequency_rank` 90). Frequency order alone would invert those two rows; the rank wins.
2. **The post-overlay JavaScript `sort` cannot permute a page.** Its predicate (headword, reading or
   `lower(romaji)` equals the query) is a strict subset of the SQL ranks 1–5, so inside any page every
   row it considers "exact" already precedes every row it does not; the pass is stable and therefore
   order-preserving by construction, not by luck. It is retained as-is: A13 is a decision gate, and
   removing a redundant pass would be an unauthorized change to frozen search semantics.

No ordering behaviour changed; only the description is now accurate.

## A13.2 Guarantees A13 verified (no contract change required)

| Guarantee | Status after A13 | Evidence |
| :--- | :--- | :--- |
| `targetLanguage` inertness | **strengthened to byte equality** | the response body text is identical with and without the parameter for `en`, `ta`, `ml`, `fr`, `english`, `""`, `" "`, and the options handed to the service are identical — not merely deep-equal after parsing |
| `q` cap is script-independent | **verified** | Tamil, Malayalam, Japanese kana and Japanese kanji are each accepted at exactly 1000 **UTF-16 code units** and rejected at 1001, with the service never reached on rejection; astral input is counted as 2 units per character |
| sanitize-before-judge order | **verified for NUL and whitespace** | NUL-only, whitespace-only and mixed padding answer `400 MISSING_QUERY` (never `VALIDATION_ERROR`) however far above the cap they are; the same padding around real content is stripped, not counted |
| no payload echo on rejection | **verified** | the over-cap error is byte-exactly `{success:false,error:{code:"VALIDATION_ERROR",message:"Query parameter 'q' must be at most 1000 characters"}}` with no fragment of the input, and no `details`/`stack` property |
| retired/never-expose terms stay absent | **verified** | 17 terms audited; 0 active references. The `data` key set, the `body` key set and every item key set are asserted **exactly**, so absence is structural rather than enumerated for terms with zero occurrences (e.g. `matchType`) |

## A13.3 Declared detail fields — producer status (evidence for D-9, not a detail contract)

`src/types/mobileDictionary.ts` declares `MobileDictionaryDetailResponse` with 17 field groups. **A13
does not freeze a detail contract** (§A12.6 and A11.5 §5 still stand: a detail payload needs its own
frozen contract before implementation, and D-5 is unresolved). What A13 adds is the per-field producer
trace that a future freeze must start from, so that no field is ever derived from the declared type.

| Field group | Producer found | Evidence | Status for a future detail contract |
| :--- | :--- | :--- | :--- |
| `id`, `headword`, `reading`, `romaji`, `jlptLevel`, `isCommon` | **yes** | `dictionary_entries` (`src/db/schema.ts`, 12 columns) | producible today |
| `meanings` (glosses, notes) | **partial** | `senses` jsonb → `glosses`, `note` | `order` and `contextTags` have no source; `localizedGlosses` has no read path (§A10.12) |
| `kanjiList` | **partial** | `kanji_entries` (character, meaning, `readingsKun`/`readingsOn`, `strokeCount`, `primaryRadicalId`), `kanji_radicals`, `kanjiLexicalGraphService.getVocabularyKanji` | production for `strokeOrderSvgUrl` / `visualAsset` requires the KanjiVG import, which is 14.4D and **blocked** |
| `keigo` | **yes, different shape** | `kanjiLexicalGraphService.getKeigoRelations` → `KeigoRelation[]`, consumed by the web route `GET /api/dictionary/entry/[id]` | produced as an array by the graph layer, while the declared mobile shape is an object with `teineigo`/`sonkeigo`/`kenjougo` — mapping is a design decision, not a rename |
| `exampleSentences` | **partial** | `example_sentences` table with `dictionary_entry_ids` jsonb link; web route exposes `sentences` | link model exists; no mobile read path |
| `provenance.sourceId` / `license` / `attribution` | **partial** | `knowledge_sources` (`id`, `name`, `license`, `url`, `domain`) and the row-level `source_ref` | the *display form* is D-5 and remains unresolved; `source_ref` stays never-exposed (§6.1) |
| `alternativeHeadwords`, `alternativeReadings` | **no** | present only on the ETL in-memory type `TransformedDictionaryEntry` (`src/etl/dictionary/transformer.ts`); the persisted `CanonicalDictionaryEntry` omits them and `dictionary_entries` has no such column | **not readable** — never persisted. A detail route cannot serve them without new storage |
| `conjugations` | **no** | no table, no column; `conjugation` appears only in quiz prose | out of scope until a producer exists |
| `synonyms`, `antonyms`, `phrases`, `collocations` | **no** | declared in `src/types/mobileDictionary.ts` only | out of scope until a producer exists |
| `userState`, `srsStatus` | **storage only** | `srs_cards.user_id` (default `anonymous-user`) and the wider `srs_*` tables | requires an authenticated, attributable identity; D-13 deferred and the route has no auth |
| `localizedGlosses`, `isKeigo`, `keigoType`, `hasAudio`, `audioUrl` | **no** | §A11/A12 no-producer record; `audioUrl` elsewhere belongs to the quiz `questions` resource family | out of scope |

Consequence, stated as a contract fact: **a complete `MobileDictionaryDetailResponse` cannot be
implemented from current storage.** Any future detail contract must be a deliberate subset with its
own field list, and it must not be generated from the declared type.

## A13.4 Status after A13 (supersedes only what is listed)

| Statement | Location | Now |
| :--- | :--- | :--- |
| "`stable exact-match re-sort`" as the last pipeline stage | §5 (line 166-167) | refined by §A13.1 — promotion is a global SQL rank; the trailing pass is provably order-preserving |
| "D-7 … produced by the graph layer, not the entry row" | §A12.3 | unchanged verdict, now pinned to `getKeigoRelations` and to the shape mismatch recorded in §A13.3 |
| "A12 therefore froze no detail payload" (D-9) | §A12.6 | unchanged — **still not frozen**; §A13.3 supplies the producer trace for the next gate |

Nothing else above changes. D-4 remains **KEEP VERBATIM id** (the opaque-alias alternative needs a
fifth migration and stays unauthorized); D-5, D-6, D-7, D-8, D-10, D-11, D-12 and D-13 remain
**DEFERRED** with the owners named in the A13 report; D-9 remains **DEFERRED — blocked by D-5**; D-14
remains **IMPLEMENTED** and is re-verified by §A13.2. The endpoint is still **not approved for
production exposure** until the deployment gate resolves D-13.
