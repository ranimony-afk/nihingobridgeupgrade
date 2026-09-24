# Data Quality Framework

**Status**: IMPLEMENTED (checks in `src/services/dataquality/checks.ts`) · unit-tested
**Phase**: 14.4F-R §19
**Last updated**: 2026-09-24

---

## 1. Principle

> **Checks classify. They never repair.**

Every check in this framework inspects values and emits a finding. Nothing is corrected,
deduplicated, normalized, upgraded, or dropped automatically. Automatic repair destroys the
evidence needed to diagnose why the defect existed — and in a canonical knowledge base, a
silent "fix" is indistinguishable from a fabrication.

Two further rules follow:

- **Checks never throw on malformed input.** Bad input *is* the finding. A validator that
  crashes on the data it is meant to validate cannot run over a whole corpus.
- **Every finding carries a stable machine-readable `code`.** Reports are then diffable
  across runs, and tests assert on codes rather than prose that may be reworded.

The checks are pure functions over in-memory values — no database, no I/O — so they run in
any environment and are unit-testable without a canonical database.

---

## 2. Severity model

| Severity | Meaning | Response |
| :--- | :--- | :--- |
| `ERROR` | The data violates an invariant. Downstream consumers cannot be trusted. | Blocking. Must be resolved or explicitly accepted before use. |
| `WARNING` | The data is suspect or inconsistent but not structurally broken. | Requires review; may be acceptable in context. |
| `INFO` | An observation worth recording. | No action implied. |

Severity is assigned per *code*, not per instance. Two records failing the same rule always
carry the same severity, so a severity change is a deliberate contract change rather than a
data-dependent accident.

---

## 3. Check catalogue

Implemented in `src/services/dataquality/checks.ts`:

| Code | Severity | Detects |
| :--- | :--- | :--- |
| `DUPLICATE_ID` | ERROR | The same identifier appearing more than once |
| `DUPLICATE_CONTENT` | WARNING | Distinct ids sharing a canonical content key |
| `ORPHAN_REFERENCE` | ERROR | A reference pointing at a non-existent target |
| `MISSING_REQUIRED_FIELD` | ERROR | Required field absent, null, or empty |
| `MISSING_PROVENANCE` | ERROR | `sourceRef` absent |
| `PLACEHOLDER_PROVENANCE` | ERROR | `sourceRef` is a placeholder (see §5) |
| `EMPTY_TEXT` | WARNING | Text field present but zero-length |
| `LONE_SURROGATE` | ERROR | Unpaired UTF-16 surrogate — the string is already corrupt |
| `CONTROL_CHARACTER` | WARNING | C0/C1 control characters in prose |
| `INVALID_CONTROLLED_VALUE` | ERROR | Value outside a controlled vocabulary |
| `TRANSLATION_CONFLICT` | WARNING | Same entity+language with disagreeing translations |

### Why `DUPLICATE_ID` is an ERROR but `DUPLICATE_CONTENT` is not

Two records sharing an id means one silently shadows the other, and every downstream
lookup is arbitrary — a structural failure. Two records sharing *content* may be legitimate
(homographs with different readings, distinct senses, different provenance), so that is a
review item, not a violation.

### Why `LONE_SURROGATE` is an ERROR

An unpaired surrogate means the string was already truncated incorrectly — typically by
slicing at a UTF-16 index inside a surrogate pair (the hazard documented in
`SENTENCE-LEXICAL-MATCHING.md` §4). The string cannot be reliably sliced, compared, or
indexed. This is exactly the defect class the code point offset contract exists to prevent,
and this check detects its aftermath.

### Why `TRANSLATION_CONFLICT` is only a WARNING

Disagreeing translations are not automatically wrong: `canonical`, `verified_human`, and
`machine` translations may legitimately coexist, and the conflict may resolve through
priority rather than replacement. The check surfaces the disagreement; resolution is a
human decision informed by provenance.

---

## 4. Determinism

`buildReport` sorts findings by severity, then code, then ref, and returns counts per
severity. Two runs over the same input produce byte-identical output, so reports can be
compared across commits and a new finding is attributable to a change rather than to
ordering.

Severity rank orders `ERROR` → `WARNING` → `INFO`, which is also the order a human should
read them.

---

## 5. Provenance hygiene

`PROVENANCE_PLACEHOLDERS` enumerates the strings that must never stand in for a real source
reference:

```
latest   unknown   manual   ai   n/a   none   tbd   todo
```

Each is indistinguishable from a genuine source id at read time. `"latest"` in particular
*looks* like a version pin while actually guaranteeing that a record silently follows
whatever upstream changes to. These are rejected structurally rather than by convention.

Where provenance is genuinely unknown, the correct representation is an explicit
`requiresReview` flag — a visible state that can be queried — not a plausible-looking
placeholder that later reads as verified.

---

## 6. How each source is checked

| Subject | Checks applied |
| :--- | :--- |
| `dictionary_entries` | duplicate ids, required fields, provenance ref, text integrity |
| `kanji_entries` | duplicate ids, required fields, provenance ref, Unicode integrity |
| `kanji_readings` | controlled vocabulary (see §6.1), orphan references to kanji |
| `entity_translations` | translation conflicts, language code validation, provenance ref |
| `grammar_patterns` | duplicate slugs, JLPT controlled vocabulary (`N5`–`N1`), provenance ref |
| `knowledge_sources` | duplicate ids, required fields |
| Relationships (kanji graph, grammar graph) | orphan references |

### 6.1 Three reading-type vocabularies coexist

`src/types/lexicalGraph.ts` defines **two distinct sets** for the same conceptual
concept, plus the readings API accepts a third form as a query alias:

| # | Constant / surface | Location | Members | Casing |
| :-- | :-- | :-- | :-- | :-- |
| 1 | `READING_TYPES` | `lexicalGraph.ts:85` | `onyomi_goon` · `onyomi_kanon` · `onyomi_toon` · `onyomi_kanyon` · `kunyomi_standard` · `kunyomi_okurigana` · `kunyomi_special` · `jukujikun` · `ateji` · `nanori` · `irregular` (11) | lowercase snake_case |
| 2 | `ReadingClassificationType` | `lexicalGraph.ts:253` | `ON` · `KUN` · `NANORI` · `SPECIAL` · `JUKUJIKUN` · `ATEJI` · `IRREGULAR` · `UNKNOWN` (8) | UPPERCASE |
| 3 | `type` query parameter | `api/kanji/[character]/readings/route.ts:19` | `on` · `kun` · `all` | lowercase short |

Set 1 is the type of `KanjiReadingEdge.readingType`. Set 2 is what the readings API
filters on (`r.type === "ON"`). Set 3 is translated into set 2 by the route
(`"on" → "ON"`), with anything unrecognised meaning "no filter".

**Neither set is a superset of the other.** Set 1 has no member spelled `ON`; set 2
has no member spelled `onyomi_goon`. So a value taken from one and compared against
the other matches nothing and returns an empty result *without erroring* — the
failure mode that reads as "this kanji has no readings" rather than "this code is
wrong".

Practical consequences:

- Read `edge.readingType` against `READING_TYPES`, and `reading.type` from the API
  against `ReadingClassificationType`. They are not interchangeable.
- A new controlled-vocabulary check must be told **which** set applies, which is why
  `checkControlledVocabulary` takes the allowed list as an argument rather than
  resolving one globally.
- The two sets are not reconcilable by normalization alone: set 1 distinguishes four
  on'yomi subtypes and two kun'yomi subtypes that set 2 collapses into `ON`/`KUN`,
  while set 2 carries `SPECIAL` and `UNKNOWN` that set 1 lacks. Reconciling them is a
  modelling decision, not a mapping.

`tests/data-quality-checks.test.ts` asserts the disjointness, and restates set 2 from
the type union under a compile-time exhaustiveness check so the two cannot drift apart
silently.

---

## 7. What this framework deliberately does not do

- **No automatic repair.** No dedup, no overwrite, no normalization, no level inference.
- **No cross-source reconciliation.** Where two sources disagree, both are reported;
  picking a winner is a governance decision.
- **No mutation of canonical data.** These checks are read-only by construction — they
  receive values and return findings, and hold no database handle.
- **No silent severity downgrade.** A check that is inconvenient is not reclassified;
  it is documented or removed explicitly.

---

## 8. Related checks elsewhere

| Concern | Document |
| :--- | :--- |
| Search normalization/ranking integrity | `DICTIONARY-SEARCH-ARCHITECTURE.md` |
| Full-width vs half-width, romaji detection | `DICTIONARY-SEARCH-ARCHITECTURE.md` §7 |
| Offset-unit correctness | `SENTENCE-LEXICAL-MATCHING.md` §4 |
| JLPT level provenance | `JLPT-DATA-QUALITY-CONTRACT.md` |
| Grammar provenance authority | `GRAMMAR-ETL-CONTRACT.md` §4–5 |
| Tatoeba artifact provenance | `TATOEBA-PROVENANCE-MODEL.md` |
