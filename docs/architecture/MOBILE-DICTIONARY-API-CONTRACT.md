# NihongoBridge Flutter/Android Mobile Dictionary API Contract

**Phase**: 14.4A (§1–§5) · **extended by 14.4F-R §17 (§6–§11)**  
**Status**: APPROVED ARCHITECTURE  
**Target Client**: Future Cross-Platform Flutter Mobile Application (Android / iOS)  

> **Document scope.** §1–§5 (Phase 14.4A) define *navigation, endpoints, sync, and service
> boundaries* — the UX shape of the mobile client. §6–§11 (added by 14.4F-R §17) define the
> *response envelope contract*: versioning, determinism, pagination, offsets, language
> awareness, and provenance. The two layers are complementary; §17 augments this document
> rather than duplicating it, and no endpoint defined in §2 is redefined below.

---

## 1. Mobile UX Target & Navigation Architecture

The NihongoBridge mobile client architecture mirrors the ergonomic strengths of modern mobile Japanese dictionaries (e.g. Takoboto, Midori, Shirabe Jisho) while integrating NihongoBridge's multilingual Indian-language knowledge graph and AI tutoring.

### Core Bottom Navigation Structure
```
┌────────────────────────────────────────────────────────┐
│ [ Home ]   [ Search ]   [ Lists ]   [ Study ]   [ Profile ] │
└────────────────────────────────────────────────────────┘
```
1. **Home (ホーム)**: Daily word recommendation, quick search jump, streak / XP progress, daily review queue badge.
2. **Search (辞書検索)**: Multi-script omnibar (Kanji, Kana, Romaji, English, Tamil, Malayalam) with instant autocomplete.
3. **Lists (マイ単語帳)**: User-curated custom study decks, saved vocabulary, JLPT wordlists, export/import.
4. **Study (学習・SRS)**: Spaced repetition flashcards, multiple-choice quizzes, conjugation drills.
5. **Profile (マイページ)**: Known/learning word distribution, JLPT mastery tracker, offline dictionary download manager.

---

## 2. Mobile API Endpoints

All endpoints are versioned under `/api/v1/mobile/...` and emit compact, gzipped JSON payloads optimized for cellular networks.

### 2.1 Fast Autocomplete Endpoint
* **Route**: `GET /api/v1/mobile/dictionary/suggest`
* **Query Parameters**:
  * `q` (string, required): Partial query (e.g. `tabe`, `食`, `water`).
  * `limit` (number, optional, default: 10).
* **Response**:
```json
{
  "suggestions": [
    { "id": "de-jmdict-1358280", "headword": "食べる", "reading": "たべる", "romaji": "taberu", "gloss": "to eat", "jlpt": "N5" },
    { "id": "de-jmdict-1358300", "headword": "食べ物", "reading": "たべもの", "romaji": "tabemono", "gloss": "food", "jlpt": "N5" }
  ]
}
```

### 2.2 Multi-Target Mobile Search Endpoint
* **Route**: `POST /api/v1/mobile/dictionary/search`
* **Request Body**:
```json
{
  "query": "taberu",
  "filters": {
    "jlptLevel": "N5",
    "isCommon": true,
    "hasKeigo": true
  },
  "page": 1,
  "limit": 20,
  "targetLanguage": "ta"
}
```
* **Response**: Emits an array of `MobileDictionaryEntryCard` payloads for virtualized scrolling feeds.

### 2.3 Detailed Entry Page (Swipe Sections) Endpoint
* **Route**: `GET /api/v1/mobile/dictionary/entries/:id`
* **Query Parameters**:
  * `lang` (optional, default: `en`): Secondary localization code (`ta`, `ml`).
* **Response Structure**:
```json
{
  "id": "de-jmdict-1358280",
  "headword": "食べる",
  "reading": "たべる",
  "romaji": "taberu",
  "jlptLevel": "N5",
  "isCommon": true,
  "meanings": [
    {
      "order": 1,
      "partsOfSpeech": ["v1", "vt"],
      "glosses": ["to eat"],
      "localizedGlosses": {
        "ta": ["சாப்பிடு", "உண்"],
        "ml": ["കഴിക്കുക", "ഭക്ഷിക്കുക"]
      },
      "contextTags": ["standard"]
    }
  ],
  "conjugations": [
    {
      "form": "masu_present",
      "nameJa": "ます形",
      "nameEn": "Polite Non-Past",
      "affirmative": "食べます",
      "affirmativeReading": "たべます",
      "negative": "食べません",
      "negativeReading": "たべません",
      "politeness": "polite"
    }
  ],
  "keigo": {
    "standardForm": "食べる",
    "teineigo": ["食べます"],
    "sonkeigo": ["召し上がる", "お食べになる"],
    "kenjougo": ["いただく", "頂戴する"],
    "businessExample": {
      "japanese": "どうぞお召し上がりください。",
      "reading": "どうぞおめしあがりください。",
      "english": "Please enjoy your meal.",
      "tamil": "தயவுசெய்து சாப்பிடுங்கள்.",
      "malayalam": "ദയവായി കഴിച്ചാലും."
    }
  },
  "kanjiList": [
    {
      "character": "食",
      "meaning": "eat, food",
      "readings": { "on": ["ショク", "ジキ"], "kun": ["た.べる", "く.う"] },
      "strokeCount": 9,
      "strokeOrderSvgUrl": "/assets/kanji/098df.svg",
      "radical": "飠"
    }
  ],
  "exampleSentences": [
    {
      "id": "es-100234",
      "japanese": "朝ごはんを食べました。",
      "reading": "あさごはんをたべました。",
      "english": "I ate breakfast.",
      "tamil": "நான் காலை உணவு சாப்பிட்டேன்.",
      "sourceRef": "upstream:tatoeba:2023"
    }
  ],
  "provenance": {
    "sourceId": "upstream:jmdict:2023-08",
    "license": "CC-BY-SA-4.0",
    "attribution": "Electronic Dictionary Research and Development Group (EDRDG)"
  }
}
```

---

## 3. Versioned Offline Sync Architecture (Future Flutter Client)

To provide instant lookup when cellular network connectivity is unavailable, NihongoBridge defines a **versioned, incremental SQLite sync contract**.

### Sync Principles:
1. **Zero Database Mutation on the Client**: The local SQLite database is a synchronized read-replica of canonical PostgreSQL tables.
2. **Versioned Manifest Registry**: The server publishes immutable dataset release manifests (`/api/v1/mobile/sync/manifests`).
3. **Delta Patch Support**: Minor releases provide binary delta patches (brotli-compressed JSON diffs) to save mobile bandwidth.

```
┌────────────────────────────────────────────────────────┐
│                   SYNC WORKFLOW                        │
│                                                        │
│   Mobile App                   Server                  │
│       │                          │                     │
│       ├── Check Manifest ───────>│                     │
│       │                          │                     │
│       │<── Latest Manifest ──────┤ (Version: 2023-08)  │
│       │                          │                     │
│       ├── Compare Version ───────┤                     │
│       │   (Local: none / old)    │                     │
│       │                          │                     │
│       ├── Request Delta/Archive ─>│                    │
│       │                          │                     │
│       │<── Compressed Blob ──────┤                     │
│       │                          │                     │
│       └── Apply to Local SQLite ─┘                     │
└────────────────────────────────────────────────────────┘
```

---

## 4. Audio & OCR Service Boundary Contracts

### 4.1 Pronunciation Audio Contract
* **Audio Strategy**: Audio files are stored on CDN / object storage and referenced via immutable URLs.
* **Metadata Schema**:
```typescript
export interface PronunciationAudioMetadata {
  id: string;
  entryId: string;
  reading: string;
  audioUrl: string;
  sourceType: "native_speaker" | "verified_tts";
  speakerGender: "male" | "female";
  accentRegion: "tokyo" | "kansai";
  durationMs: number;
  license: string;
}
```

### 4.2 OCR & Camera Ingestion Boundary
* **Pipeline**: Camera Image → Native Google ML Kit / Tesseract on device → Japanese Text Tokens → `/api/v1/mobile/dictionary/search`.
* **Architecture Boundary**: The server receives segmented Japanese text tokens rather than processing heavy raw camera bitmaps, preserving server resources and learner privacy.

---

## 5. User Personalization & Study Sync

* **Private by Default**: Personal custom wordlists, user notes, and SRS study intervals belong strictly to the authenticated learner.
* **Bidirectional Sync**: The mobile client pushes study reviews (`/api/v1/mobile/srs/review`) and syncs custom wordlists using idempotent UUID ledgers.
* **Zero Canonical Pollution**: Learner study data, personal tags, and custom definitions NEVER modify underlying `dictionary_entries` or `kanji_entries`.

---

## 6. Response Envelope Contract (Phase 14.4F-R §17)

Every §2 endpoint returns a response conforming to one of the envelopes below. These are
**client-facing contracts**, not serializations of database rows.

### 6.1 The never-expose rule

The following must never appear in a mobile response payload:

| Internal | Why |
| :--- | :--- |
| Table names, column names, or raw SQL | Couples the client to the schema; every migration becomes a breaking client change |
| `jsonb` wrapper shapes (e.g. `senses[].glosses[]` nesting) | Leaks storage layout; the client should see a gloss list |
| Internal ids where a public id exists | `de-jmdict-1358280` is an ETL artifact key, not a stable public identifier |
| `created_at` / `updated_at` timestamps | Server-internal bookkeeping; not meaningful to a learner |
| `source_ref` raw strings | Provenance must be *resolved* into display form (§9) |
| Database error text or constraint names | Security and UX both |

Field names in responses are therefore deliberately re-declared rather than spread from
service return values. `src/lib/api/routeParams.ts` exists for the input side of the same
discipline: parsing and bounds-checking at the boundary, never trusting the client.

### 6.2 Envelope shape

```json
{
  "apiVersion": "1",
  "data": { "...": "..." },
  "meta": {
    "offsetUnit": "unicodeCodePoint",
    "generatedAt": "2026-09-24T00:00:00.000Z"
  },
  "warnings": []
}
```

- `apiVersion` — a **string**, matching the `/api/v1/` path segment. Present on every
  response so a client can assert it without inspecting the URL it called.
- `data` — the payload. Shape depends on the endpoint.
- `meta.offsetUnit` — **always present** whenever `data` contains any `start`/`end`/`length`
  field. See §7.
- `warnings` — an array, **never omitted when empty** (an absent key and an empty array must
  not be distinguishable, or clients diverge on handling).

### 6.3 Error envelope

```json
{
  "apiVersion": "1",
  "error": { "code": "MISSING_QUERY", "message": "Query parameter \"q\" is required." }
}
```

`code` is **machine-readable and stable**; `message` is human-readable and may change
without notice. Clients must branch on `code`, never on `message`. This mirrors the
established repository pattern (`MISSING_QUERY`, `MISSING_ID`, `NOT_FOUND`).

---

## 7. Offsets: code points, never UTF-16

**This is the highest-risk area of the contract and is stated unambiguously.**

```
offsetUnit = "unicodeCodePoint"
```

Any `start`, `end`, or `length` field in any response counts **Unicode code points**.
`end` is exclusive. Full rationale is in `SENTENCE-LEXICAL-MATCHING.md` §4; the
mobile-specific consequences are:

1. **`meta.offsetUnit` is mandatory** whenever offsets appear. A client must never infer
   the unit from the payload's apparent correctness.
2. **No response may emit UTF-16 offsets.** Not as a convenience second field, not
   "just for the client". A parallel offset convention is how the ambiguity returns, and
   it will return silently: kana, common kanji, and full-width punctuation occupy one
   UTF-16 unit each, so the two conventions agree on ordinary Japanese and diverge only on
   supplementary-plane characters.
3. **Divergence appears only on:** CJK Extension B kanji (e.g. `𠮷`, U+20BB7), emoji,
   and ZWJ sequences. A client that slices at UTF-16 indices will corrupt exactly these
   inputs — a lone high surrogate, which is a malformed string.
4. **Highlighting must convert at the render boundary**, using the Flutter equivalent of
   `codePointIndexToUtf16Index`. Slicing a Dart string by a code point offset without
   conversion produces the same corruption Dart-side.
5. **Emoji are multiple code points.** `👍` is 1 code point / 2 UTF-16 units; `👨‍👩‍👧` is
   5 code points. This contract is **code points, not grapheme clusters** — a distinction
   that matters for cursor movement and truncation, which must use grapheme segmentation
   (`Intl.Segmenter` or an equivalent) separately.

**Acceptance test for any client:** render `𠮷野家` and a string containing an emoji with
highlighting enabled, and confirm the highlighted substring is byte-identical to the
expected text.

---

## 8. Determinism and pagination

### 8.1 Deterministic ordering

Identical requests return identically ordered results. Ordering is never left to the
database. Ranking follows the deterministic comparator in
`DICTIONARY-SEARCH-ARCHITECTURE.md` §6:

```
exact → reading → orthographic → normalized → translation/fallback
```

with `isCommon` / `frequencyRank` breaking ties, and a final stable tiebreak on id so
results cannot reorder between identical calls.

**No AI ranking is permitted in the response path.** AI may enrich retrieval (see §10),
but ordering must remain reproducible: a learner who re-opens a search must not see a
different order, and a cached client view must not diverge from a fresh fetch.

### 8.2 Pagination envelope

```json
{
  "data": { "results": [] },
  "pagination": {
    "limit": 50,
    "offset": 0,
    "returned": 12,
    "hasMore": false
  }
}
```

Rules:

1. **`limit` and `offset` echo the values the server actually applied** — not the values
   the client requested. `DictionaryService.searchEntries` clamps `limit` to `[1, 100]`
   and `offset` to `>= 0`, so a request for `limit=5000` is served as `100`, and the
   response must say `100`. Echoing the request would report pagination that was never
   applied.
2. **Two-layer bound.** The route accepts `1..200` (`MAX_PAGE_LIMIT`, default 50) and the
   service clamps to `100`. The stricter layer wins, and the response reflects the
   stricter result.
3. **Out-of-range behaviour is bounded, never `NaN`.** `parseLimit` / `parseOffset` clamp
   high and fall back to the default on low or invalid input. A client never receives
   `null`, `NaN`, or `Infinity` for pagination.
4. **`offset` is capped** at `MAX_OFFSET = 100_000`. Deep pagination beyond that must use a
   different access path (filtering or a cursor), not a larger offset — an offset that
   large is a table scan on any storage engine.
5. **`hasMore` is explicit.** Clients must not infer it from `returned < limit`, because a
   page can be short for reasons other than exhaustion.

---

## 9. Language awareness and provenance

### 9.1 Language

Every localized field is tagged with its language, and translations are returned as a
**collection**, never as a single implicit gloss:

```json
{
  "glosses": [
    { "language": "en", "text": "water" },
    { "language": "ta", "text": "நீர்", "sourceType": "verified_human" },
    { "language": "ml", "text": "വെള്ളം", "sourceType": "machine" }
  ]
}
```

Supported languages are `en`, `ta`, `ml` (`SUPPORTED_LANGUAGES`). Per
`MULTILINGUAL-TRANSLATION-AUDIT.md` §3, `canonical` > `verified_human` > `machine` is a
**ranking, not an automatic selection** — the client receives all available translations
with their `sourceType` and applies the ordering itself. The server must not silently
return only the highest-ranked one, because that hides the disagreement a learner may want
to see, and hides the fact that a machine gloss is machine-produced.

`sourceType` is always present on a translation. A `machine` gloss must be **visibly
distinguishable** in the client UI; presenting it identically to a `verified_human` gloss
misrepresents its reliability.

### 9.2 Provenance

Provenance is **resolved for display**, not passed through raw:

```json
{
  "provenance": {
    "authority": "canonical",
    "sourceName": "JMdict Japanese-Multilingual Dictionary",
    "attribution": "Electronic Dictionary Research and Development Group (EDRDG)",
    "license": "CC-BY-SA-4.0",
    "requiresReview": false
  }
}
```

Rules:

1. Raw `source_ref` strings are internal. Resolve them against the registry into
   `sourceName` / `attribution` / `license`.
2. **`requiresReview` is surfaced.** If a record's provenance is unverifiable, the client
   must be able to show it as unverified. Suppressing this flag presents unverified
   content as verified — the exact failure `PROVENANCE-QUALITY-CONTRACT.md` §3 names.
3. Attribution and licence travel with the content. CC-BY-SA obligations are not satisfied
   by attributing in a server-side log; the mobile client displays them.
4. A record whose provenance does not resolve is still returnable, with
   `requiresReview: true`. Refusing to serve it would make the system less honest, not
   more.

---

## 10. Endpoint response shapes

Field names below are the **contract**; they are re-declared at the route rather than
spread from service internals.

### 10.1 Search — `GET /api/v1/mobile/dictionary/search`

```json
{
  "data": {
    "results": [
      {
        "id": "de-jmdict-1395600",
        "headword": "水",
        "reading": "みず",
        "romaji": "mizu",
        "jlptLevel": "N5",
        "jlptKnown": true,
        "isCommon": true,
        "frequencyRank": 1200,
        "matchType": "exact"
      }
    ],
    "detectedScript": "kanji",
    "queryEcho": "水"
  },
  "pagination": { "limit": 50, "offset": 0, "returned": 1, "hasMore": false }
}
```

- `matchType` — why this result ranked where it did. Deterministic and drawn from the
  documented ranking stages. Enables a client to group results meaningfully instead of
  showing one undifferentiated list.
- `detectedScript` — echoed from the classifier (`empty` · `kanji` · `kana` · `japanese` ·
  `romaji` · `mixed`). Documented honestly: `romaji` is a character-class test, so an
  English word like `water` classifies as `romaji`. The field reports classification, not
  language detection.
- `jlptKnown` — **required**, because `jlpt_level` is `NOT NULL` and may hold the literal
  sentinel `"NONE"` (`JLPT-DATA-QUALITY-CONTRACT.md` §2.1). A client branching on
  truthiness would treat `"NONE"` as a level. `jlptKnown: false` means the value is not a
  real level and must be displayed as unknown.

### 10.2 Entry — `GET /api/v1/mobile/dictionary/entry/{id}`

```json
{
  "data": {
    "id": "de-jmdict-1395600",
    "headword": "水",
    "reading": "みず",
    "romaji": "mizu",
    "senses": [ { "glosses": ["water"], "note": null } ],
    "partsOfSpeech": ["n"],
    "tags": ["common", "jlpt:n5"],
    "kanjiCharacters": ["水"],
    "jlpt": { "level": "N5", "known": true },
    "kanjiEdges": [],
    "keigo": [],
    "translations": [],
    "provenance": { "authority": "canonical", "requiresReview": false }
  }
}
```

**Degradation contract.** `kanjiEdges` and `keigo` return `[]` when the lexical graph is
unavailable, rather than failing the request. A learner opening a dictionary entry must
still see the entry; a missing graph is a reduced result, not an error. `[]` and "no
relations exist" are therefore deliberately indistinguishable here — the alternative is
an entry that cannot be opened at all when a secondary system is down.

### 10.3 Kanji vocabulary — `GET /api/v1/mobile/kanji/{character}/vocabulary`

Query: `limit`, `commonOnly`. Each edge carries `position` (the character's index within
the word), because a kanji's role in a compound depends on where it sits — a leading
character in one word is a trailing one elsewhere.

### 10.4 Kanji readings — `GET /api/v1/mobile/kanji/{character}/readings`

Query: `type` = `on` | `kun` | `all`.

```json
{
  "data": {
    "readings": [ { "text": "みず", "type": "KUN", "romaji": "mizu" } ],
    "appliedTypeFilter": "KUN"
  }
}
```

- The echo is named **`appliedTypeFilter`**, not `type`. An unrecognised `type` value means
  "no filter" (the server does not 400), so the client must be able to tell that no filter
  was applied rather than assuming its request was honoured.
- **`reading.type` uses `ReadingClassificationType` (`ON`/`KUN`/`NANORI`/…, UPPERCASE).**
  This is **not** the same vocabulary as `READING_TYPES`
  (`onyomi_goon`/`kunyomi_standard`/…, lowercase), which types `KanjiReadingEdge.readingType`.
  Neither set is a superset of the other, and comparing across them yields an empty result
  with no error — presenting as "this kanji has no readings". See
  `DATA-QUALITY-FRAMEWORK.md` §6.1.
- The query alias (`on`/`kun`/`all`) is lowercase; the response value is uppercase.

### 10.5 Kanji components — `GET /api/v1/mobile/kanji/{character}/components`

Returns components alongside canonical radicals, with `componentCount`. Each component
carries `renderedAs` (the shape as it appears *inside* the kanji, which often differs from
the standalone form), `role`, `position`, and `orderIndex`. Render `renderedAs`; link via
the component id. Components sharing an `orderIndex` have no defined order and must be
tie-broken deterministically by the client.

### 10.6 Examples

Example sentences must be attributable to a source with a verifiable artifact. Given Phase
14.5A is **BLOCKED** and no sentence corpus exists, this endpoint returns an **empty
collection with `provenance.requiresReview: false` and an explicit
`data.unavailable: true`** — never placeholder text and never generated sentences. An
honest empty result is a contract; fabricated example sentences presented as canonical are
a corruption of the learner's knowledge.

### 10.7 Keigo

Keigo relations carry `keigoType` (`TEINEIGO` / `SONKEIGO` / `KENJOUGO_I` / `KENJOUGO_II`),
`directionality`, and `contextUsage`. Two constraints from `KEIGO-MODEL.md` apply:

1. **Keigo is never presented as universal.** `contextUsage` must accompany every
   transformation; a keigo form substituted outside its context is wrong, not merely
   impolite.
2. **`groupRelation` (uchi/soto) is absent from the model** (§3 of that document).
   Consequently the API cannot express the uchi/soto distinction, and the client must not
   present keigo guidance as complete for contexts that depend on it.

---

## 11. Mobile-specific constraints

| Constraint | Contract |
| :--- | :--- |
| Payload size | Compact field names on list endpoints; no nested `jsonb` shapes |
| Compression | gzip; responses are deterministic, so `ETag` is viable |
| Offline | Cached responses must carry `apiVersion` + `meta.offsetUnit` so a cached payload is interpretable without the server |
| Client version skew | Unknown fields must be **ignored**, never error; `apiVersion` is asserted, not pattern-matched |
| Safety | `MAX_PAGE_LIMIT` and `MAX_OFFSET` are enforced server-side; a client cannot request unbounded work |
| Search input | NUL characters stripped and input trimmed at the boundary; SQL wildcards escaped via `escapeLikePattern`. Never interpolate client text into SQL |

### 11.1 Versioning policy

`apiVersion` is present in the path (`/api/v1/`) **and** in every response body. The body
copy exists because a cached payload must remain self-describing when it outlives the
request that produced it.

Additive changes (new optional fields, new enum members) do **not** bump the version, and
clients must tolerate them by ignoring unknown fields. Removing a field, changing a field's
meaning, or changing `offsetUnit` **does** require a new version — `offsetUnit` in
particular, since a client that cached code-point offsets and then receives UTF-16 offsets
would mis-highlight silently rather than fail.
