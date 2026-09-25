# A11 → A12 HANDOFF

**Authoritative A12 starting document.**
Produced by A11.5 (durability / evidence / handoff gate), 2026-09-24.

Read this document **before** writing any A12 code. It states where A12 must start, what it may do,
what it must not do, and what it must verify first.

---

## 1. Prerequisites — all satisfied

```text
[x] A11 implementation complete      GET /api/v1/mobile/dictionary/search implemented (1 route)
[x] A11 regression green             56 files / 1124 passed / 0 failed / 55 skipped / 1179 total
[x] A11 files preserved              6 artifacts, SHA-256 recorded in A11.5-DURABILITY-MANIFEST.md §2
[x] A11 contract frozen              docs/api/MOBILE-DICTIONARY-API-CONTRACT.md §A11.1–§A11.8
[x] A11 security boundary preserved  public, read-only, closed 9-field projection, safe errors
[x] No A12 implementation started    route inventory = 1; no detail route; no limiter; no auth
```

---

## 2. A12 MUST START FROM EVIDENCE

```text
A12 must inspect the current working tree first.
A12 must not assume commit 694c0e2 exists.     (measured: NOT PRESENT in the git layer)
A12 must not assume any A11/A10 commit hash exists. (23ba543, 694c0e2, fa16e09 all absent)
A12 must reverify A11 before implementation.
A12 must preserve all pre-existing modifications. (31 tracked files, 38 untracked — see manifest §6)
A12 must not redesign the A10/A11 search contract.
```

**Concretely, before A12 begins:**

1. `git status --short`, `git rev-parse HEAD`, `git rev-list --left-right --count HEAD...origin/main`
   — record the actual state; do not inherit it from this document.
2. Verify the six A11 artifacts by **path + SHA-256** (manifest §2). If a hash differs, the A11
   implementation has drifted — investigate before proceeding.
3. Re-run the A11 suites (`tests/mobile-dictionary-search-api.test.ts` 42,
   `tests/mobile-dictionary-search-api-live.test.ts` 7) and the full regression. A12 may not build
   on an unverified base.
4. Confirm the route inventory is still exactly one mobile route.
5. Read `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` §A10.1–§A10.18, §A11.1–§A11.8 in full.

---

## 3. Deferred items — the exact frozen identifiers

These are the only candidates A12 may consider, and each carries the status A10/A11 assigned it.
**D-numbers come from A10 §A10.17; do not invent new ones.**

| # | Item (A10 §A10.17 wording) | A10 status | Blocking | A12 disposition |
| :-: | :--- | :--- | :--- | :--- |
| **D-4** | Opaque public identifier | deferred — needs migration or alias table | no | not authorized without a separately authorized schema gate |
| **D-5** | Resolved provenance display form (§9) | unimplemented | **yes, for detail** | prerequisite for D-9; needs its own design decision |
| **D-6** | Localized gloss payload | needs read path + authorization + per-gloss provenance labelling | yes, for localization | **only if explicitly authorized**; `targetLanguage` stays inert until then |
| **D-7** | Keigo fields on an item (`isKeigo`, `keigoType`) | produced by the graph layer, not the entry row | no | needs a per-item graph cost decision |
| **D-8** | Audio (`hasAudio`, `audioUrl`) | no dictionary-entry audio exists | no | no producer exists |
| **D-9** | **Entry-detail DTO + endpoint** | blocked by D-5; two competing web shapes must be reconciled | **yes, for detail** | see §5 — requires a frozen detail contract first |
| **D-10** | Richer filters (`partsOfSpeech`, `hasKanji`, `hasExamples`, `register`) | no producers | no | — |
| **D-11** | `warnings` / offline self-description | no producer; offline is client-owned | no | — |
| **D-12** | Deep/cursor pagination beyond offset 100 000 | needs a performance gate and an index decision | no | investigation only, under a separately authorized gate (§7) |
| **D-13** | **Rate limiting / abuse protection** | security gate before production deployment | **deployment-blocking** | see §6 — deployment condition, not an A12 feature by default |
| **D-14** | Defensive maximum `q` length | parity with web frozen for v1; a cap is a security decision | no | see §6 |

---

## 4. Authorized candidates vs. not automatically authorized

### Candidates A12 may act on — only when explicitly authorized by the user for that specific item

```text
mobile dictionary entry detail        (D-9; requires the D-5 precondition and its own frozen contract)
deployment security requirements      (D-13; a deployment/security gate decision)
query-length security                 (D-14; a security decision with a chosen number)
rate limiting                         (D-13; only if separately authorized)
deep-pagination performance           (D-12; investigation first, implementation under its own gate)
localization                          (D-6; only if explicitly authorized, with provenance labelling)
```

Each of these is **deferred, not scheduled**. Authorization for one does not authorize another.

### NOT automatically authorized

```text
Tatoeba ingestion                     KanjiVG ingestion
JMdict ingestion                      KANJIDIC2 ingestion
SRS                                   AI tutor
CMS                                   new database architecture
web dictionary redesign               mobile app implementation beyond the frozen API
schema / migration / index changes    production access or deployment
Phase 14.4D / 14.4E / 14.5A / 14.5B
```

A12 must not infer authorization merely because an item is technically related to the mobile API.

---

## 5. Entry-detail boundary (D-9)

A10 froze the relationship, not the payload:

```text
the search item is the summary DTO; the detail is a separate, larger DTO;
the detail endpoint is NOT part of v1 and is deferred to A12.
```

Binding consequences for A12:

- A12 must **not** simply return the A11 search DTO plus arbitrary extra fields. That would collapse
  the summary/detail separation A10 froze (§A10.7).
- A12 must **not** add a third detail route. The two implemented web detail routes return
  *different* payloads (`{entry, source, kanji, sentences, relatedGrammar}` vs
  `{…detail, kanjiEdges, keigo, headwordKanji}`) and both spread a full canonical row inside
  `entry`; the mobile detail DTO cannot be inferred from them.
- A12 must **create its own explicitly frozen detail contract before implementation**, per the
  repository's gate process — using the same pattern as A10 (decide → freeze → then implement).
- The detail DTO is blocked by **D-5** (resolved provenance display form): no provenance field may
  be exposed until provenance resolves into a display form (§6.1 never-expose rule).
- A11's search item must not be reshaped to accommodate detail. The 9-field projection is frozen.

---

## 6. Security boundary (D-13 / D-14) — unresolved, and outstanding

A11 is:

```text
public
read-only
no identity
no rate limiting
no q length cap
```

This is a **condition**, not an oversight. Recorded unchanged:

```text
PUBLIC READ-ONLY ENDPOINT
NO RATE LIMIT IN A11
SECURITY GATE REQUIRED BEFORE/AT DEPLOYMENT
```

- **Do not retrofit authentication or rate limiting into A11.5 or A11.**
- A10 §A10.15 records the concrete risk: the search predicate is an `ILIKE` scan, so unbounded
  unauthenticated traffic is a real cost vector.
- **Production deployment decision remains outstanding.** This endpoint is not approved for
  production exposure. A deployment security gate must decide rate limiting, abuse protection and
  the `q` length cap (D-13/D-14) before exposure.
- A12 must not make a deployment recommendation, modify Vercel/Supabase, or treat A11's green
  regression as deployment approval.

---

## 7. Pagination boundary (D-12)

A11 pagination remains:

```text
offset + limit      (flat, applied values echoed, silent clamping)
page                retired — never parsed, never translated
```

Deep-pagination performance is **deferred**. A12 may *investigate* — under a separately authorized
gate — `ILIKE` scan behaviour, large offsets, query plans, index feasibility, alternative search
mechanisms. **A11.5 changed none of these and A12 must not either without authorization.**

---

## 8. Localization boundary (D-6)

A11 `targetLanguage` remains **inert**: validated against `SUPPORTED_LANGUAGES` (`en`/`ta`/`ml`) and
then deliberately discarded — it reaches neither the service nor the response.

- A12 may address localization only if explicitly authorized.
- No translation behaviour may be introduced without a read path, an authorization decision, and
  **per-gloss provenance labelling** (`sourceType` + `isVerified`): `sourceType: "machine"` glosses
  exposed unlabelled would violate the architecture's labelling rule.
- `targetLanguage` must **never** be reinterpreted as `SearchScript`, query language, or locale.
- 13.5C's rule stands: the translation storage primitive "must never be wired to an API route".

---

## 9. Frozen search contract A12 must not disturb

```text
TRANSPORT:        GET /api/v1/mobile/dictionary/search, query-string, no body, application/json
PARAMETERS:       q (required), limit, offset, level|jlpt, common, targetLanguage (inert)
SANITATION:       NUL-strip + trim only (no NFKC/NFC/case-fold/transliteration)
SCRIPT:           six-value SearchScript — empty, kanji, kana, japanese, romaji, mixed
JLPT:             jlptLevel (sentinel-preserving) + jlptStatus tri-state; no boolean
PROJECTION:       9-field hand-built DTO; never a row spread; sourceRef never exposed
PUBLIC ID:        dictionary_entries.id verbatim; ent_seq never exposed
PAGINATION:       offset/limit; boundary 200 / applied 100 / offset 100 000; applied values echoed
HAS MORE:         offset + entries.length < total, over the applied window
ENVELOPES:        {success,data:{…}} / {success:false,error:{code,message}}
ERROR SAFETY:     fixed client messages; diagnostics server-side only
AUTH / RATE LIMIT: none (D-13)
```

---

## 10. Conditions carried forward

| Condition | Owner | Status |
| :--- | :--- | :--- |
| Commit durability | infrastructure | **NOT VERIFIED** — `.git` resets; use path + SHA-256 |
| D-13 deployment security / rate limiting | security gate | outstanding, deployment-blocking |
| D-14 `q` length cap | security gate | outstanding |
| D-12 deep-pagination performance | performance gate | deferred |
| D-9 detail endpoint | A12 (if authorized) | requires a frozen detail contract + D-5 |
| D-6 localization | A12 (if authorized) | requires read path + labelling + authorization |
| `targetLanguage` validation is not externally observable in v1 | A12 | only inertness is proven |

---

## 11. A12 scope boundary — summary

```text
AUTHORIZED (only when the user explicitly authorizes that specific item):
- mobile dictionary entry detail, via its own frozen contract (D-9, gated on D-5)
- deployment security requirements (D-13) / query-length security (D-14)
- rate limiting, only if separately authorized
- deep-pagination investigation, implementation only under its own gate (D-12)
- localization, only if explicitly authorized with provenance labelling (D-6)
- any other item A10/A11 explicitly deferred, on the same terms

FORBIDDEN without separate authorization:
- redesigning the A11 search semantics, SearchScript, JLPT representation or the 9-field DTO
- reintroducing queryEcho, matchType, jlptKnown or page pagination
- exposing raw database rows, sourceRef, ent_seq, frequencyRank, partsOfSpeech or tags
- changing the web dictionary contract or its behaviour
- schema, migration or index changes
- Tatoeba / KanjiVG / JMdict / KANJIDIC2 ingestion
- production access, deployment, or Vercel/Supabase changes
- Phase 14.4D / 14.4E / 14.5A / 14.5B work
```

---

**A12 begins only on explicit authorization. This handoff grants no permission by itself.**
