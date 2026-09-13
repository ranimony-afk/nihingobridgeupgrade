# Phase 04.4 — Tatoeba: Licensing & Schema Compatibility Verification

**Precondition for Prompt 04.4:** *"Implement sentence ingestion only after verifying licensing and schema compatibility."*

**Verdict:** ✅ **CLEARED TO IMPLEMENT**, subject to four binding constraints (§ 3).

---

## 1. Licensing verification (Rule 9)

Primary sources consulted:

| Source | URL |
|---|---|
| Tatoeba Downloads | `https://tatoeba.org/en/downloads` |
| Tatoeba Terms of Use § 6.2–6.5 | `https://tatoeba.org/en/terms_of_use` |
| Tatoeba Wiki — Using the Corpus | `https://en.wiki.tatoeba.org/articles/show/using-the-tatoeba-corpus` |
| Tatoeba FAQ — attribution | `https://en.wiki.tatoeba.org/articles/show/faq` |

### 1.1 Findings

| # | Finding | Consequence |
|---|---|---|
| L1 | Default license for **textual sentences** is **CC BY 2.0 FR**. | Permitted for our use, including commercial. |
| L2 | *"The BY mention implies a single restriction … using, reusing, modifying and distributing the sentence is only allowed if **the name of the author is cited**."* | **Per-sentence author attribution is mandatory.** |
| L3 | Some sentences are additionally available under **CC0 1.0**. | Per-sentence license varies; must be stored per row, not assumed globally. |
| L4 | **Audio has a different, wider licence range.** *"If the license field is empty, you may not reuse the audio outside the Tatoeba project."* | **Audio is OUT OF SCOPE for this phase.** |
| L5 | Many JP/EN sentences originate from the **Tanaka Corpus**, which is public domain. | Compatible; no extra restriction. |
| L6 | Attribution guidance: state that sentences come from Tatoeba, link `https://tatoeba.org`, and mention CC BY 2.0 FR. | Recorded in provenance + a UI attribution string. |
| L7 | Tatoeba explicitly advises filtering unapproved / "red" / unnatural sentences before use in learning material. | Quality gating required. |

### 1.2 The finding that changed the design

**L2 is the important one.** CC BY 2.0 FR requires citing the *author of each sentence*.

The commonly-used `sentences.csv` export has only `id, lang, text` — **it carries no author**. Ingesting that file would leave us structurally unable to attribute, i.e. **non-compliant with the licence we are relying on**.

➡ **Decision: ingest `sentences_detailed.csv`**, whose documented structure is:

```
Sentence id [tab] Lang [tab] Text [tab] Username [tab] Date added [tab] Date last modified
```

The `username` is persisted per sentence and is a **hard validation requirement**, not an optional column. Sentences whose owner is absent (`\N`, orphaned) are recorded with `attribution = "Tatoeba"` and flagged `owner_unknown`, so attribution is never silently lost.

---

## 2. Schema compatibility verification

### 2.1 Format compatibility — the shared XML core does NOT apply

| Aspect | JMdict / KANJIDIC2 (04.2 / 04.3) | Tatoeba (04.4) |
|---|---|---|
| Format | XML | **TSV** (tab-separated, `.tar.bz2`) |
| Record boundary | `<entry>` / `<character>` | newline |
| Quoting | XML entities | **none** — raw tabs/newlines are delimiters |
| Natural key | `ent_seq` / `literal` | `sentence id` (integer) |
| Relationships | self-contained | **`links.csv` is a separate file** |

➡ `etl/parsers/xml-stream.ts` is **not reusable** here. A separate line-oriented TSV reader is required. This is *not* a second framework — the surrounding stage contract (download → checksum → parse → normalize → validate → deduplicate → provenance → upsert), `resolveSource`, `Deduplicator`, `etl_import_runs` and the loader/report shapes are all reused unchanged.

### 2.2 Database compatibility

Checked against the live schema.

| Existing table | Collision risk | Resolution |
|---|---|---|
| `decks`, `cards`, `progress`, `sessions` | none | untouched |
| `dictionary_entries` + children | none | untouched |
| `kanji_characters` + children | none | untouched |
| `etl_import_runs` | **shared, by design** | reused — one provenance ledger (Rule 5) |

New tables are additive only: `sentences`, `sentence_links`.

`sentence_links` is **self-referential many-to-many** (translation pairs). Two constraints follow:

1. Tatoeba's `links.csv` lists each pair **in both directions** (A→B and B→A). Stored as-is with a unique index on `(sentence_id, translation_id)`; dedup is handled by the natural key.
2. Links routinely reference sentence IDs **that do not exist** in a language-filtered subset. A blind FK insert would fail en masse. **Links are therefore filtered to pairs where both endpoints were actually ingested** (counted and reported as `skippedDangling`).

### 2.3 Deliberately deferred

- **Sentence ↔ dictionary/kanji content matching** — belongs to a later knowledge-linking phase.
- **Furigana generation** — needs a morphological analyser (MeCab/fugashi); not in this phase.
- **JLPT tagging of sentences** — requires the vocabulary mapping still absent from 04.2/04.3.
- **Audio** — excluded per **L4**.

---

## 3. Binding constraints carried into implementation

| # | Constraint | Enforcement |
|---|---|---|
| C1 | Per-sentence author attribution must be preserved | `sentences.owner_username` + `attribution`; validator rejects rows with no attribution path |
| C2 | Per-sentence licence must be stored, not assumed | `sentences.license` column, defaulted per-run, overridable per row |
| C3 | No audio ingestion | No audio field, table or download in this phase |
| C4 | Quality filtering before learner exposure | Length bounds, script check, control-character rejection; `is_reviewed` retained for later review gating |

---

## 4. Attribution string to surface in the product

> Example sentences from **Tatoeba** (https://tatoeba.org), released under **CC BY 2.0 FR**.
> Individual sentences are attributed to their contributors.

Persisted per import in `etl_import_runs.attribution`.
