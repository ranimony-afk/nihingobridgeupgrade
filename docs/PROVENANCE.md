# Provenance & licensing

Every knowledge record in NihongoBridge can be traced back to the dataset it came from.
The `sources` table stores the dataset code, human readable name, upstream version,
licence, licence URL, source URL, retrieval timestamp and a SHA-256 checksum of the
raw file. `kanji.source_id`, `radicals.source_id`, `components.source_id` and
`vocabulary.source_id` reference it.

## Registered datasets

| Code | Dataset | Upstream | Licence | Used for |
| --- | --- | --- | --- | --- |
| `kanjidic2` | KANJIDIC2 | http://www.edrdg.org/wiki/index.php/KANJIDIC_Project | CC BY-SA 4.0 (EDRDG) | kanji literals, readings, meanings, stroke counts, grade, frequency, JLPT, classical radical number, Heisig index, SKIP code |
| `radkfile` | RADKFILE | http://www.edrdg.org/krad/kradinf.html | EDRDG Licence | radical groups (`radical -> kanji`), radical stroke counts |
| `kradfile` | KRADFILE | http://www.edrdg.org/krad/kradinf.html | EDRDG Licence | kanji decomposition (`kanji -> components`) |
| `jmdict` | JMdict (English subset, `JMdict_e`) | http://www.edrdg.org/jmdict/edict_doc.html | EDRDG Licence | vocabulary headwords, kana readings, senses, parts of speech, frequency priority |

All four datasets are published by the **Electronic Dictionary Research and Development
Group (EDRDG)**. The licence text is available at <http://www.edrdg.org/edrdg/licence.html>.
Redistribution must keep the licence statement and attribution intact — the web footer,
the `/admin` provenance table and this document satisfy that requirement.

## Explicitly excluded

The project does **not** use, scrape or reproduce content from proprietary or
closed-licence products:

* Takoboto / WaniKani / Todaii / Duolingo / BunPro and similar apps or their databases
* Any dataset without a machine readable licence statement
* Any content obtained by crawling a product UI

If a new dataset is proposed, add it to `etl/sources/registry.mjs` (with licence +
URL + checksum), run the pipeline and update this file before the data is used.

## Derived (non-upstream) facts

Two attributes are **computed by the ETL**, they are not part of the upstream files:

1. `radicals.radical_number` and `radicals.is_kangxi` — RADKFILE has no Kangxi numbers.
   Each RADKFILE group is scored against the set of kanji that KANJIDIC2 assigns to a
   classical radical number: `coverage = |group ∩ class| / |class|`. A group needs
   `coverage >= 0.5`; among the qualifying numbers the one with the largest absolute
   overlap wins. For each radical number the group with the largest overlap is flagged
   `is_kangxi = true`, the remaining ones are recorded as variants.
2. `components.usage_count` — number of `kanji_components` rows referencing a component.

## Attribution string

```
Kanji, radical and decomposition data from KANJIDIC2 / KRADFILE / RADKFILE;
vocabulary from JMdict — all © EDRDG, used under the EDRDG licence.
```
