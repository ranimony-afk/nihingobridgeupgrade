# Phase 14.3D — JMdict coverage audit

**Method:** code reading of `src/etl/dictionary/xmlParser.ts`, `transformer.ts`, `persistenceAdapter.ts`, `src/db/schema.ts`, and `src/services/knowledge/provenance/registry.ts`.

**Corpus measurement this pass:** NOT EXECUTED. `data/JMdict.xml` was absent. No field count from the 206717-entry file is claimed.

Disposition labels: PERSISTED, TRANSFORMED, DERIVED, DISCARDED, NOT SUPPORTED.

## Identity and provenance

| Item | Disposition | Where |
| :--- | :--- | :--- |
| Source id `upstream:jmdict:2023-08` | PERSISTED | `dictionary_entries.source_ref` |
| Release `2023-08-20`, XML SHA-256, byte size, archive SHA-256 | PERSISTED in the provenance registry only | `registry.ts` `contentHash`, `artifactBytes`, `archiveSha256`. Not columns on `dictionary_entries`. |
| `ent_seq` | TRANSFORMED | Id `de-jmdict-${entSeq}`. Raw `ent_seq` is not a column. |
| `contentHash` of a row | NOT SUPPORTED | Compared in memory for conflict detection. Not stored. |
| Registry id `upstream:jmdict:2024-07` | NOT SUPPORTED for 14.3D writes | Left in the registry because 14.2 foundation tests require it. 14.3D entry points refuse it. |

Ingestion does not write `entity_translations`, `cms_content_items`, `example_sentences`, or `kanji_entries`.

## Entry fields

| Source field | Disposition | Notes |
| :--- | :--- | :--- |
| First `keb`, or first `reb` when there is no kanji | PERSISTED | `headword` |
| First `reb` | PERSISTED | `reading` |
| Further `keb` | TRANSFORMED | Tag `alt:<keb>`. Not a separate row. |
| Further `reb` | TRANSFORMED | Tag `alt-reading:<reb>` |
| `ke_pri`, `re_pri` | DERIVED and TRANSFORMED | `isCommon` from `nfNN`, `ichi1`, `news1`, `spec1`, `gai1`. `frequencyRank` is `nfNN * 500` when no explicit rank is supplied. Raw priority is not its own column. |
| `re_restr` | TRANSFORMED | Tag `restr:<reb>-><keb>` |
| `ke_inf`, `re_inf` | DISCARDED | Parsed, then not copied onto the canonical row or into tags. |
| `re_nokanji` | DISCARDED | Parsed, then unused. |
| Romaji | DERIVED | Hepburn via `kanaToRomaji`. Not in the XML. |
| Kanji characters | DERIVED | Extracted from the primary and alternative headwords into `kanji_characters`. This is not a KANJIDIC2 link. |
| `pos` | PERSISTED | `parts_of_speech`, after POS normalization. Empty becomes `unspecified`. |
| English `gloss` text | PERSISTED | `senses[].glosses`. Missing English becomes `(untranslated)`. |
| Non-English `gloss` | TRANSFORMED | Tag `gloss:<lang>:<text>`. Not written to `entity_translations`. |
| `gloss` `g_type`, `g_gend` | DISCARDED | The gloss regex keeps `xml:lang` and text only. |
| First `s_inf` | PERSISTED | `senses[].note` |
| Further `s_inf` | DISCARDED | `extractTagContent` keeps one value. |
| `misc`, `field`, `dial` | TRANSFORMED | Tags `misc:`, `field:`, `dialect:` |
| `stagk`, `stagr` | DISCARDED | Parsed onto the raw sense, then unused by the transformer. |
| `xref`, `ant`, `lsource`, entry `info` | NOT SUPPORTED | Not parsed. |
| JLPT | NOT SUPPORTED from this XML | `normalizeJlpt(raw.jlptLevel)` runs, but the parser never sets `jlptLevel`. Official JMdict does not carry JLPT. Absent input becomes `NONE`. Pilot fixtures that set `jlptLevel` are not the pinned file. |

## Boundaries that must stay separate

| Future data | Status |
| :--- | :--- |
| Editorial CMS content | NOT mixed into source rows. `cms_content_items` is a different table. 14.3D does not write it. |
| Tamil and Malayalam translations | NOT mixed into source rows. `entity_translations` exists for `en` / `ta` / `ml` and is not an ingestion target. Non-English JMdict glosses stay in source tags, labeled as source glosses, not as verified translations. |
| KANJIDIC2, KanjiVG, Tatoeba | NOT STARTED. No acquisition and no ingestion in this pass. |

## What is not claimed

- No percentage of the 206717 entries was measured for missing glosses, empty readings, or tag cardinality.
- `frequencyRank = nfNN * 500` is a coarse derivation, not a frequency corpus.
- Storing an alternative form in `tags` does not make it searchable. See the search audit.
