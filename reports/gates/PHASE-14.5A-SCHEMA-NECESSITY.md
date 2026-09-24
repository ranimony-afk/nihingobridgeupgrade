# Phase 14.5A Schema Necessity Report

**Gate**: Phase 14.5A-R3 — Tatoeba Sentence Acquisition & Provenance Foundation
**Deliverable**: §12 Existing Database Compatibility Audit → Schema Necessity
**Date**: 2026-09-24
**Status**: **SCHEMA CHANGE REQUIRED — USER AUTHORIZATION NEEDED**
**Migration executed**: **NO** (stopped before migration, per §12)

---

## Verdict

```
SCHEMA CHANGE REQUIRED — STOPPED BEFORE MIGRATION
```

Tatoeba records **cannot** be safely stored in the existing `example_sentences` table. This
report documents the incompatibility and proposed remediation. Per §12, **no schema was
altered**, no migration was generated, and execution stops here pending explicit user
authorization.

This finding is **independent of the artifact question**. It holds whether or not a Tatoeba
artifact is ever acquired, because it concerns the *shape* of the upstream data, which is
known from Tatoeba's published model and from the phase's own §10/§11/§12 policies.

---

## 1. Current Limitation

`example_sentences` (`src/db/schema.ts:750`), inspected read-only:

```ts
export const exampleSentences = pgTable("example_sentences", {
  id: text("id").primaryKey(),
  japanese: text("japanese").notNull(),
  reading: text("reading").notNull(),                        // ← blocker 1
  english: text("english").notNull(),                        // ← blocker 2
  jlptLevel: text("jlpt_level").notNull(),                   // ← blocker 3
  grammarId: text("grammar_id"),
  dictionaryEntryIds: jsonb("dictionary_entry_ids").default([]).notNull().$type<string[]>(),
  kanjiCharacters: jsonb("kanji_characters").default([]).notNull().$type<string[]>(),
  tags: jsonb("tags").default([]).notNull().$type<string[]>(),
  sourceRef: text("source_ref").notNull(),
});
```

Confirmed properties:

| Property | Observed |
| :--- | :--- |
| `japanese` NOT NULL | **YES** |
| `reading` NOT NULL | **YES** |
| `english` NOT NULL | **YES** |
| `jlpt_level` NOT NULL | **YES** |
| Dedicated upstream source identifier | **NO** — only a generic `source_ref` text column |
| Translation relationship representation | **NONE** |
| Sentence→sentence linkage | **NONE** |
| Indexes declared | **NONE** — the `pgTable` call passes no index configuration |

### The three structural blockers

**(1) `reading` NOT NULL — unsatisfiable honestly.** Tatoeba supplies **no** full-sentence
kana reading. The phase's §9 forbids generating readings and **explicitly prohibits**
`reading = japanese`. A `NOT NULL` column therefore cannot be populated with anything
truthful. The only ways to satisfy it are both prohibited: fabricate a reading, or copy the
Japanese text into it.

**(2) `english` NOT NULL — forbids the untranslated state.** The phase's §11 requires that
untranslated Japanese sentences be **retained** and explicitly modelled as untranslated.
A `NOT NULL` column cannot represent "no translation exists." Combined with the existing
Phase 4 pipeline — which **rejects** such records outright (see §5 below) — untranslated
sentences are structurally unrepresentable.

**(3) `jlpt_level` NOT NULL — forces a prohibited label.** The phase's §10 forbids assigning
JLPT levels during acquisition, and forbids inferring them from sentence content. A
`NOT NULL` column forces a fabricated classification into every row.

### Additional limitations

- **No upstream identity column.** There is no place for the Tatoeba sentence ID. The
  phase's §9 requires original Tatoeba IDs to be preserved and never replaced. The existing
  pipeline smuggles the ID into the primary key (`es-tat-${tatoebaId}`) — which is a
  derived local identifier, not a source-identity field, and is not queryable as provenance.
- **No relationship model.** §11 requires one-to-one, one-to-many, many-to-one, untranslated,
  and translation-group relationships. A single `english: text` column can express exactly
  one translation, in exactly one language.
- **No raw text field.** Acquisition must preserve raw source text exactly (§25, §12).
  `japanese` is a single string with no raw/normalized separation.
- **No artifact binding.** §14 requires every record traceable to
  `source_id` + `artifact_sha256` + `upstream_record_id`. Only a generic `source_ref` exists.

---

## 2. Exact Tatoeba Requirement

| Requirement | Source | Needed representation |
| :--- | :--- | :--- |
| Preserve upstream sentence ID | §9 | dedicated `upstream_sentence_id` |
| Preserve language metadata | §10 | `language` (authoritative, not inferred) |
| Preserve raw text exactly | §25, §12 | `raw_text` distinct from any normalized form |
| No reading fabrication | §9 | nullable reading, or reading held outside the record |
| No JLPT fabrication | §10 | nullable / absent JLPT |
| Retain untranslated sentences | §11 | representable "no translation" state |
| Preserve translation graph | §11 | separate relationship entity |
| One-to-many / many-to-one | §11 | relationship rows, not a column |
| Bind to artifact | §14 | `source_id` + `artifact_sha256` |
| Never lose source identity | §9 | upstream ID not replaced by a local ID |

---

## 3. Minimum Proposed Change

**Not implemented.** Presented for authorization only.

A minimal, additive design — **new tables plus nullable provenance columns only; no
alteration or deletion of existing canonical data**:

```
tatoeba_sentences
  id                    text PRIMARY KEY        -- deterministic local id (derived)
  upstream_sentence_id  text NOT NULL           -- Tatoeba sentence ID (authoritative)
  source_id             text NOT NULL           -- upstream:tatoeba:<version>
  artifact_sha256       text NOT NULL           -- binds row to the immutable artifact
  language              text NOT NULL           -- from upstream metadata
  raw_text              text NOT NULL           -- byte-preserved source text
  normalized_text       text                    -- populated only in 14.5B
  reading               text                    -- NULLABLE: never fabricated
  jlpt_level            text                    -- NULLABLE: never fabricated
  validation_status     text NOT NULL           -- ACCEPT | WARNING | REJECT

tatoeba_sentence_links
  source_sentence_id    text NOT NULL
  target_sentence_id    text NOT NULL
  relationship_type     text NOT NULL           -- one-to-one | one-to-many | many-to-one | group
  source_language       text NOT NULL
  target_language       text NOT NULL
  source_id             text NOT NULL
  artifact_sha256       text NOT NULL
```

Design notes:

- `reading` and `jlpt_level` are **nullable** precisely so no fabrication is required.
- `raw_text` and `normalized_text` are **separate columns**, honoring the raw/acquisition
  boundary the phase's §25 requires.
- `example_sentences` is **left completely untouched.** No column is dropped, no constraint
  relaxed, no row rewritten. That table continues to serve its existing Phase 4 purpose.
- Whether Tatoeba data should *ever* be merged into `example_sentences` is a question for a
  later phase, and is explicitly **not** proposed here.

**Constraint relaxation is deliberately not proposed** as the primary option. Making
`english` or `jlpt_level` nullable on `example_sentences` would be a destructive change to a
table consumed by existing application code (dictionary detail views, search, AI retrieval),
and would still not provide upstream IDs or a relationship model.

---

## 4. Alternatives Considered

| # | Alternative | Assessment |
| :--- | :--- | :--- |
| **A** | Store everything in `example_sentences` as-is | **REJECTED** — requires fabricating `reading` and `jlpt_level`, rejects untranslated sentences, cannot express relationships, loses upstream IDs |
| **B** | Relax `NOT NULL` on `example_sentences` | **REJECTED** — destructive to a live table consumed by app code; still provides no upstream ID, no raw text, no relationship model |
| **C** | New dedicated `tatoeba_*` tables (recommended) | **PROPOSED** — additive, zero canonical mutation, no change to existing behaviour |
| **D** | File-backed / runtime projection, no persistence | **VIABLE for acquisition only** — the acquisition/provenance layer genuinely needs no database at all. But persistent sentence storage will be required before any 14.5B canonical linkage work |
| **E** | Reuse `entity_translations` for relationships | **PARTIALLY VIABLE** — it models localised content (en/ta/ml) for a single entity, not sentence↔sentence edges between two upstream records. Does not fit §11's graph without distortion |
| **F** | Store relationships in a JSONB blob on one row | **REJECTED** — unqueryable in reverse direction, cannot enforce edge integrity, hides provenance per-edge |

**Recommendation**: **C**, with **D** adequate for the current acquisition-only phase. The
acquisition layer needs no schema change at all; the proposal above becomes necessary only
when persistent sentence storage begins.

---

## 5. Related Downstream Defect (documented, not fixed)

§13 requires these to be documented rather than silently repaired. The existing Phase 4
pipeline contains defects that would actively corrupt Tatoeba data if reused:

| Location | Defect | Phase policy violated |
| :--- | :--- | :--- |
| `transformer.ts:52` | `const reading = cleanText(raw.reading) \|\| japanese;` — substitutes Japanese text as its own reading | §9 (`reading = japanese` **explicitly prohibited**) |
| `transformer.ts:54,71-72` | Assigns `jlptLevel` and injects `jlpt:<level>` tags | §10 (no JLPT fabrication) |
| `transformer.ts:48-50` | `if (!english) errors.push(...)` — **rejects** a sentence lacking English | §11 (untranslated Japanese must be **retained**) |
| `matcher.ts` | `japanese.includes(headword)` across the full corpus — O(N×M) | §13 (O(N×M) matching must be replaced in 14.5B) |
| `pipeline.ts:46-49` | bare `catch {}` around `SentenceMatcher.load()` — DB failure is indistinguishable from "no matches" | §13 (swallows database errors) |
| `transformer.ts:81` | ID is `es-tat-${raw.tatoebaId}` — upstream ID embedded in a derived key, not preserved as a source-identity field | §9 (never lose/replace upstream ID) |
| `examples_sentences` model | Single `english: text` column | §11 (assumes one English translation is the complete model) |

**Not repaired in this phase**, per §13.

---

## 6. Migration Implications

| Aspect | Implication |
| :--- | :--- |
| Migration count if approved | **1** additive migration (2 new tables) |
| Changes to existing tables | **0** |
| Changes to canonical corpus tables | **0** — `dictionary_entries`, `kanji_entries`, `kanji_radicals`, `kanji_composition` untouched |
| Data backfill required | **None** — new tables start empty |
| Impact on existing application code | **None** — no existing query touches the new tables until a later phase opts in |
| Impact on Phase 14.4F contracts | **None** |
| Drizzle snapshot effect | New snapshot appended; `drizzle/0000`–`0003` unchanged |
| Risk level | **Low** — purely additive, no existing behaviour altered |

Per §16, no migration was generated: **schema migrations = 0** for this phase.

---

## 7. Rollback Strategy

Because the change is purely additive, rollback is trivial and non-destructive:

1. **Drop the two new tables** (`tatoeba_sentence_links`, then `tatoeba_sentences`).
2. **Delete the appended migration + snapshot** from `drizzle/`.
3. **No rollback of existing data is required** — nothing existing was read, written, or
   altered.

No canonical table would need restoration, because none is modified. No data-loss window
exists, because the new tables contain only derived-from-artifact records that can be
rebuilt deterministically from the immutable artifact.

---

## 8. Required Authorization

Per §12, execution **STOPS before migration**. To proceed, explicit user authorization is
required for:

1. Creation of the two proposed `tatoeba_*` tables (additive migration), **or**
2. A decision to keep the acquisition layer file-backed (alternative **D**) and defer
   persistence to a later phase.

Until one is chosen, this phase reports
`SCHEMA CHANGE REQUIRED — USER AUTHORIZATION NEEDED` and performs **0** migrations.
