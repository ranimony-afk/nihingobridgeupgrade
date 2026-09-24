# JLPT Data Quality Contract

**Status**: IMPLEMENTED (checks in `src/services/dataquality/jlptChecks.ts`) · audit findings documented, **NOT repaired**
**Phase**: 14.4F-R §14
**Last updated**: 2026-09-24

---

## 1. The foundational fact

> **The JLPT has published no official vocabulary, kanji, or grammar lists since
> the 2010 revision.**

The Japan Foundation's stated position is that publishing "Test Content
Specifications" — containing lists of vocabulary, kanji, and grammar items — was
not appropriate, because the test measures general communicative competence
rather than the memorisation of a fixed list.

The pre-2010 four-level system *did* have published specifications, and those
lists remain the empirical basis for most N5–N1 materials in circulation (the
commonly cited mapping is N5≈old-4, N4≈old-3, N2≈old-2, N1≈old-1). But they are
no longer authoritative for the current five-level test, and no post-2010
published list exists to replace them.

### 1.1 What this means for this system

**Every JLPT level in this repository is community-derived or editorial. None is
officially published.**

This is not a defect to be fixed; it is a property of the domain that must be
*represented honestly*. It has three consequences:

1. A JLPT level assignment is a **claim**, and every claim needs a recorded basis.
2. No level may be presented as "official" or "certified", because no such
   designation exists to confer.
3. Level data may legitimately be absent. Absence is preferable to a fabricated
   classification, and must be representable.

Anything that presents a community-derived level as authoritative is a
correctness defect regardless of whether the underlying mapping is sensible.

---

## 2. Audit findings (measured at HEAD `19c0b72`)

These are **documented, not repaired**. Repairing either would require changes to
canonical data or a schema migration, and neither is authorised (§21).

### 2.1 Finding — `NONE` sentinel in a column with a documented domain

`dictionary_entries.jlpt_level` is declared `NOT NULL` with the comment
`// 'N5' | 'N4' | 'N3' | 'N2' | 'N1'` (src/db/schema.ts:715).

The chain that populates it:

```
xmlParser.ts / loader.ts     → never emit a jlptLevel field
transformer.ts:250           → const jlptLevel = normalizeJlpt(raw.jlptLevel)
normalizeJlpt(undefined)     → returns "NONE"          (types.ts:287)
transformer.ts:270           → jlptLevel stored verbatim
```

So all 206,717 JMdict-sourced dictionary entries carry the **literal string
`"NONE"`** in a column whose documented domain is five level designators.

This is internally consistent (the ETL knows what it wrote) but externally
misleading, and `"NONE"` is **truthy** and **non-null**, so the two most natural
consumer checks both misfire:

| Consumer pattern | Result |
| :--- | :--- |
| `if (entry.jlptLevel)` | `"NONE"` is truthy → treated as having a level |
| `if (entry.jlptLevel != null)` | passes → treated as having a level |
| `if (VALID_LEVELS.includes(entry.jlptLevel))` | correct |

**Correct consumer pattern**: `classifyJlptLevel(stored)` in
`jlptChecks.ts`, which returns `"known" | "unknown" | "invalid"` and treats
`"NONE"` as `unknown`.

Reporting this at `ERROR` severity would generate ~206,000 identical findings and
bury every real defect. It is therefore reported as `INFO` under
`JLPT_LEVEL_UNKNOWN` — a recognised, documentedly deliberate state — while any
*unrecognised* value is `ERROR` under `JLPT_LEVEL_INVALID`. Severity here
describes the state, not the data volume.

### 2.2 Finding — `normalizeJlpt` scavenges digits from arbitrary text

`normalizeJlpt` (src/etl/dictionary/types.ts:286) falls back to:

```ts
const match = upper.match(/N?[1-5]/);        // UNANCHORED
```

An unanchored search for any digit 1–5 anywhere in the string. Measured
behaviour:

| Input | Output | Assessment |
| :--- | :--- | :--- |
| `undefined` / `null` / `""` | `"NONE"` | intended |
| `"N5"`, `"5"`, `"n3"` | `"N5"`, `"N5"`, `"N3"` | intended |
| `"2024-07"` | **`"N2"`** | a **date** became a level |
| `"2023-08-20"` | **`"N2"`** | a date became a level |
| `"v1.5"` | **`"N1"`** | a **version string** became a level |
| `"test-4"` | **`"N4"`** | free text became a level |
| `"JLPT 2"` | **`"N2"`** | arguably intended |

Because `jlpt_level` is `NOT NULL`, the result is **stored** — and after storage
it is completely indistinguishable from a genuine classification. A source
version string is exactly the kind of value that ends up in a field like this,
and the failure is silent.

This is the specific mechanism by which fabricated JLPT data would enter the
system. It is detectable via `checkJlptLevelDerivation`, which flags a stored
level whose claimed source text was not itself level-shaped.

**Not repaired here** because the fix changes canonical ingestion behaviour and
requires deciding whether to reject, null, or quarantine bad values — a data
governance decision, not a quality-check decision.

### 2.3 Finding — two incompatible section vocabularies

The same conceptual axis is encoded differently in two tables:

| Table | Column | Vocabulary |
| :--- | :--- | :--- |
| `questions` (:54) | `section` | `vocab` · `grammar` · `reading` · `listening` |
| `jlpt_test_questions` (:137) | `section_key` | `vocab` · `grammar_reading` · `listening` · `language_knowledge_reading` |

Only `vocab` and `listening` are shared. A join or aggregate across tables by
section silently drops rows for the mismatched values, and `reading` ≡
`grammar_reading` only by convention.

Note also that the real JLPT's post-2010 structure merges vocabulary and grammar
into a single *Language Knowledge* section scoring against a combined pass mark —
which is closer to `language_knowledge_reading` than to the `questions` split.
Reconciling this requires a migration and is **not** proposed.

### 2.4 Finding — `correct_answer` is unconstrained relative to `options`

`questions.correct_answer` is `NOT NULL` (:88) but the schema places **no
constraint** tying it to `options[].id`. A question whose `correctAnswer` is
`"5"` while `options` contains ids `["1","2","3","4"]` is perfectly valid to
PostgreSQL and completely unanswerable to a learner. No storage-layer
constraint can catch it, which is why `checkAnswers` exists.

Likewise `star_order_parts.correct_order` declares `string[]` (:81–85) with no
enforcement that it is a permutation of `parts`. A partial or padded order yields
a scoring routine whose behaviour depends on implementation accident.

### 2.5 Finding — `NOT NULL` text fields accept empty strings

`prompt_translation` (:63) and `explanation` (:92) are both `NOT NULL`. An empty
string satisfies `NOT NULL` while conveying nothing. Both describe the same
question in a second language, so both are checked for non-emptiness rather than
mere presence.

---

## 3. Provenance requirements

Every JLPT claim must be traceable. The permitted bases, from
`src/types/grammar.ts`:

| Basis | Meaning |
| :--- | :--- |
| `registered_source` | Traceable to a registered source id |
| `official_list` | A published JLPT pattern list |
| `corpus_frequency` | Derived from corpus frequency evidence |
| `editorial` | A human editor decided |
| `unattested` | Asserted with no traceable source |

**`official_list` is effectively unavailable for post-2010 data.** Per §1 no such
list exists. The basis may still be used for pre-2010 specification-derived
material *if* the derivation is recorded — but a modern level labelled
`official_list` is a provenance error, and should be treated as
`unattested` until the basis is corrected.

Levels are **never inferred** from:

- pattern or word complexity;
- corpus frequency alone;
- similarity to another pattern already assigned a level;
- position within a graded reader or textbook chapter;
- a `NOT NULL` column requiring a value.

The last is the most dangerous, because it applies structural pressure to every
single row.

---

## 4. Check catalogue

Implemented in `src/services/dataquality/jlptChecks.ts`:

| Code | Severity | Detects |
| :--- | :--- | :--- |
| `JLPT_LEVEL_UNKNOWN` | INFO | No level established (incl. the `NONE` sentinel) |
| `JLPT_LEVEL_INVALID` | ERROR | Stored value outside `N5`–`N1` |
| `JLPT_LEVEL_DERIVED_FROM_NON_LEVEL_SOURCE` | ERROR | Level scavenged from a date/version/free text |
| `JLPT_CATEGORY_UNKNOWN` | ERROR | `questions.category` outside the controlled set |
| `JLPT_SECTION_CATEGORY_MISMATCH` | ERROR | `category` belongs to a different `section` |
| `JLPT_SECTION_UNKNOWN` | ERROR | Section key outside the table's vocabulary |
| `JLPT_NO_OPTIONS` | ERROR | Question with no answer options |
| `JLPT_ANSWER_NOT_AN_OPTION` | ERROR | `correct_answer` matches no option id — unanswerable |
| `JLPT_ANSWER_AMBIGUOUS` | ERROR | `correct_answer` matches multiple option ids |
| `JLPT_STAR_ORDER_LENGTH` | ERROR | `correctOrder` length ≠ part count |
| `JLPT_STAR_ORDER_UNKNOWN_PART` | ERROR | `correctOrder` references a non-part |
| `JLPT_STAR_ORDER_DUPLICATE` | ERROR | `correctOrder` repeats a part |
| `JLPT_STAR_ORDER_MISSING_PART` | ERROR | `correctOrder` omits a part (not a permutation) |
| `JLPT_STAR_POSITION_OUT_OF_RANGE` | ERROR | `starPosition` outside `1..partCount` |
| `JLPT_DIFFICULTY_MISSING` | WARNING | Difficulty absent |
| `JLPT_DIFFICULTY_INVALID` | ERROR | Difficulty outside `1..5` or non-integer |
| `JLPT_TRANSLATION_MISSING` | ERROR | `promptTranslation` present but empty |
| `JLPT_EXPLANATION_MISSING` | WARNING | `explanation` present but empty |
| `JLPT_TEST_NO_SECTIONS` | ERROR | Test with no section configurations |
| `JLPT_TEST_SECTION_TOTAL_MISMATCH` | ERROR | Section maxima ≠ `totalScore` |
| `JLPT_TEST_PASS_MARK_OUT_OF_RANGE` | ERROR | `passingScore` outside `1..totalScore` |
| `JLPT_TEST_SECTION_PASS_OUT_OF_RANGE` | ERROR | Sectional `passScore` outside `0..maxScore` |
| `JLPT_TEST_SECTION_PASS_SUM_EXCEEDS_TOTAL` | WARNING | Σ sectional pass marks > total |
| `JLPT_TEST_SECTION_NO_SCORE` | ERROR | Section with non-positive `maxScore` |
| `JLPT_TEST_SECTION_NO_MONDAI` | ERROR | Section declaring no mondai numbers |
| `JLPT_TEST_SECTION_INVALID_MONDAI` | ERROR | Non-positive/non-integer mondai number |

### 4.1 Why scoring is checked at all

The real JLPT requires **both** an overall pass mark **and** minimum sectional
marks. A configuration whose section maxima do not sum to `totalScore` scores the
same paper differently depending on which rule is applied, and a sectional pass
mark exceeding its own section maximum is unsatisfiable. Since the schema stores
these as free `jsonb` with no constraints, the contract is the only enforcement
point.

---

## 5. Section mapping

`CATEGORY_TO_SECTION` maps every question category to its section, and
`checkSectionCategoryConsistency` verifies the pair agrees. This catches a
`listening_quick` question filed under `section: "reading"` — representable in
the schema, and silently mis-scored in sectional marking.

The 15 categories partition as:

| Section | Categories |
| :--- | :--- |
| `vocab` | kanji_reading · orthography · contextual_use · paraphrase · usage |
| `grammar` | grammar_form · sentence_order · text_grammar |
| `reading` | reading_short · reading_mid · reading_info |
| `listening` | listening_task · listening_point · listening_utterance · listening_quick |

This partition is derived from the column comment at src/db/schema.ts:55 and is
**not** an official JLPT classification — see §1. It describes how *this*
system's categories are grouped, which is an internal consistency property.

---

## 6. Non-repair policy

Per the framework-wide rule (see `DATA-QUALITY-FRAMEWORK.md` §1): **checks
classify, they never repair.**

Applied to JLPT data specifically, the prohibited operations are:

| Operation | Why prohibited |
| :--- | :--- |
| Rewriting `"NONE"` to a level | Would fabricate a classification |
| Deleting entries with unknown levels | Destroys data to make a metric look clean |
| Inferring a level from frequency | Frequency is not a JLPT level |
| Promoting `unattested` → `editorial` | Silently upgrades a claim's status |
| Reconciling the two section vocabularies | Requires a migration; not authorised |
| Rewriting `normalizeJlpt` to default to a level | Manufacturing a claim to satisfy `NOT NULL` |
| Coercing a `correct_answer` toward a nearby option | Inventing the intended answer |

Each is tempting precisely because it makes a report go green. Each replaces a
visible defect with an invisible fabrication.

---

## 7. Presentation rules

1. A level that is `unknown` is displayed as **unknown** — never as a default,
   never omitted silently, and never inferred.
2. A level with `basis: "unattested"` is never labelled "official", "certified",
   or "verified".
3. Because no official post-2010 list exists, the UI must not imply that any
   level is test-authoritative. "Commonly placed at N3" is honest; "N3" alone
   implies a certification that does not exist.
4. Absence is acceptable and must not block display of an entry.

---

## 8. Relationship to other contracts

| Concern | Document |
| :--- | :--- |
| Generic check primitives and severity model | `DATA-QUALITY-FRAMEWORK.md` |
| Grammar-level provenance authority | `GRAMMAR-ETL-CONTRACT.md` §5 |
| `JlptEvidence` type definition | `src/types/grammar.ts` |
| Registration of JLPT question sources | `PHASE-14.5A-SCHEMA-NECESSITY.md` context; `provenance/registry.ts` |

### 8.1 Note on `first-party:jlpt-mock:v1`

`provenance/registry.ts:225` registers `first-party:jlpt-mock:v1` with the
description *"Authentic JLPT examination practice questions..."*.

Given §1, **"authentic" cannot be substantiated for anything post-2010** — no
published question set exists to be authentic *to*. The word is listed here as a
labeling concern to review; it is not corrected in this phase because provenance
registry entries are shared infrastructure and the correction is a content
governance decision.
