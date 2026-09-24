# Kanji Experience Model

**Status**: PARTIALLY IMPLEMENTED — model present, storage partially present, stroke order absent
**Phase**: 14.4F-R §15 (builds on VERIFIED 14.4E)
**Last updated**: 2026-09-24

> **Sourcing rule.** Every field described here is populated **only** from verified
> 14.4E canonical data. Nothing in this document authorises generating, inferring,
> or AI-authoring kanji facts. Where the storage or the source data does not exist,
> the field is marked absent rather than approximated.

---

## 1. §15's required surfaces vs. what exists

| §15 requirement | Storage | Source data | State |
| :--- | :--- | :--- | :--- |
| character | `kanji_entries.character` (unique) | 14.4E canonical | **IMPLEMENTED** |
| meanings | `kanji_entries.meaning` | 14.4E canonical | **IMPLEMENTED** |
| on'yomi | `kanji_entries.readings_on` (jsonb) | 14.4E canonical | **IMPLEMENTED** |
| kun'yomi | `kanji_entries.readings_kun` (jsonb) | 14.4E canonical | **IMPLEMENTED** |
| radicals | `kanji_entries.primary_radical_id` → `kanji_radicals` | 14.4E canonical | **IMPLEMENTED** |
| components | `kanji_composition` (+ `getKanjiComponents`) | 14.4E canonical | **IMPLEMENTED** |
| stroke count | `kanji_entries.stroke_count` | 14.4E canonical | **IMPLEMENTED** |
| vocabulary | `kanji_entries.vocabulary` (jsonb) + `getKanjiVocabulary` | 14.4E canonical | **IMPLEMENTED** |
| related kanji | `getKanjiNeighbors` | derived from canonical | **IMPLEMENTED** |
| jlpt / frequency evidence | `kanji_entries.jlpt_level` (+ dictionary `frequency_rank`) | see §4 | **PARTIAL** |
| **special readings** | *none* | *none* | **ABSENT** |
| **verified stroke order** | *none* | KanjiVG absent | **ABSENT** |

---

## 2. Canonical immutability

`kanji_entries`, `kanji_radicals`, and `kanji_composition` are **canonical tables and
must not be modified**. Concretely:

- `箸` holds **14** `stroke_count` in the canonical database, with
  `source_ref = first-party:kanji-mindtree:v1`.
- The KanjiVG-derived stroke count for that character differs. That difference is
  **expected and must be preserved**, not reconciled. Two independent sources
  disagreeing is a fact about the sources; silently picking one destroys the evidence.
- Any change to a canonical table is an immediate phase failure.

This is why §15's work is read-side only: the model below *reads* canonical data and
composes an experience over it. It never writes back.

---

## 3. Reading types — the three-vocabulary trap

Documented in full in `DATA-QUALITY-FRAMEWORK.md` §6.1. Summarised here because it
is the single most likely source of a silent bug on the kanji pages:

| Surface | Vocabulary | Example member |
| :--- | :--- | :--- |
| `KanjiReadingEdge.readingType` | `READING_TYPES` (lowercase snake_case) | `onyomi_goon`, `kunyomi_standard` |
| readings API `reading.type` | `ReadingClassificationType` (UPPERCASE) | `ON`, `KUN`, `SPECIAL`, `UNKNOWN` |
| readings API `?type=` query | alias | `on`, `kun`, `all` |

Neither set is a superset of the other. Comparing a value from one against the other
yields an empty result **without an error** — which presents to a learner as "this
kanji has no readings".

Note also that `READING_TYPES` distinguishes four on'yomi subtypes (`goon`, `kanon`,
`toon`, `kanyon`) and two kun'yomi subtypes, while `ReadingClassificationType`
collapses both into `ON`/`KUN`. The collapse is lossy in one direction and additive in
the other (`SPECIAL`, `UNKNOWN` exist only in the latter). They are not reconcilable
by normalization.

---

## 4. JLPT and frequency evidence

`kanji_entries.jlpt_level` is `NOT NULL`. Per `JLPT-DATA-QUALITY-CONTRACT.md` §1, the
JLPT has published no official kanji list since 2010, so **every level here is
community-derived**. Consequences for the kanji UI:

- A level must not be presented as test-authoritative.
- Unknown levels must be representable and displayed as unknown — never defaulted.
- The `classifyJlptLevel` helper exists precisely because `"NONE"` is a stored
  literal in the sibling `dictionary_entries.jlpt_level` column, and the same
  sentinel pattern must be assumed possible until measured per table.

**Frequency** is a different signal and must not be conflated with level. `is_common`
and `frequency_rank` live on `dictionary_entries`, not on `kanji_entries`, so a kanji's
"commonness" is derived from its vocabulary, not stored on the character. Presenting a
kanji as "common" is therefore a claim about its compounds, and should be phrased that
way.

---

## 5. Special readings (§15 list)

§15 names: 今日 明日 昨日 一昨日 大人 二十歳 紅葉 吹雪 田舎 素人 玄人 清水 土産 景色.

These are primarily **jukujikun** (whole-word readings not derivable from the
component characters' individual readings) plus some irregular or ateji cases.

**Storage: none.** There is no `special_readings` column and no table. `jukujikun`
exists as a member of `READING_TYPES`, but as a *classification* for reading edges, not
as a container for word-level reading pairs.

**Source data: none.** No first-party or upstream dataset in this repository supplies
these readings, and `data/kanjidic2.xml` is absent.

**Therefore: absent, and it must stay absent.**

The critical rule: a special reading must be present **in verified source data** before
it can be surfaced. It must never be derived by:

- reading the component characters and composing them (this is exactly what makes
  these readings *special* — 今日 is きょう, not いま+ひ);
- pattern-matching from another kanji with a similar shape;
- any generative process.

Deriving 今日 → きょう by composition is not an approximation of the correct answer; it
is an assertion that the whole-word reading equals the sum of its parts, which is
false for every entry in this list. Presenting it would teach an incorrect reading with
the confidence of a canonical record.

If a future 14.5B bootstrap supplies KANJIDIC2, these readings may be *looked up*
there. Until then, the UI shows the ordinary on/kun readings and does not offer a
special-reading section at all — an honest omission rather than a plausible invention.

---

## 6. Verified stroke order — DESIGN ONLY, not implementable

§15 lists "verified stroke order". Its status:

| Element | Present? |
| :--- | :--- |
| `kanji_entries.stroke_count` | Yes — a **count**, not an ordering |
| A stroke-order / stroke-path column or table | **No** |
| `data/kanjivg/` artifact | **No** |
| KanjiVG registry entry | **Yes** — `upstream:kanjivg:2024-04`, `upstream:kanjivg:2024-08` |
| KanjiVG ETL | **No** |

**Registration ≠ acquisition.** KanjiVG being listed in the provenance registry means
the *source is known and its licence is recorded*; it does not mean any stroke data was
ever downloaded or parsed. There is no `kanjidvg` parser, no SVG handling, and no
storage for paths.

Any stroke-order animation therefore requires, at minimum:

1. KanjiVG artifact acquisition (a **14.5B environment bootstrap**, per the handoff
   brief's phase boundary — not part of the 14.5A gate);
2. a schema addition for stroke paths;
3. an ETL to parse SVG paths into ordered strokes.

Items 2 and 3 require a **schema proposal and explicit authorization** (§21). Neither
has been proposed, and no migration has been written.

Interim honest behaviour: display the **stroke count** from canonical data (labelled as
a count) and offer no ordering visualisation. Do not approximate stroke order from
stroke count, from the character's shape, or from a generative model — a wrong stroke
order is a durable, learnable error.

---

## 7. Composition and components

`kanji_composition` carries `role` (`semantic | phonetic | positional | structural`),
`position` (`left | right | top | bottom | enclosure | anywhere`), `rendered_as`, and
`order_index`.

`rendered_as` deserves emphasis: a component's shape *inside* a kanji often differs
from its standalone form. Storing the rendered form separately from the component's
canonical identity is what makes decomposition displayable without misrepresenting
either. Consumers should render `rendered_as` and link via `element_id`.

`order_index` (default 0) exists so decomposition order is stable across renders; two
components at the same index have no defined order and must be tie-broken
deterministically by the consumer.

---

## 8. Out of scope

- Generating mnemonics (`mnemonic` is a nullable column; nothing generates content for it).
- Stroke-order animation, per §6.
- Adding special readings, per §5.
- Modifying any canonical kanji table.
- KanjiVG acquisition — a separate 14.5B bootstrap, not this phase.
