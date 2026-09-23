# KANJIDIC2 Data Model Architecture — Phase 14.4B

## 1. Overview
KANJIDIC2 is the authoritative, open-source Japanese kanji dictionary produced by the Electronic Dictionary Research and Development Group (EDRDG). In NihingoBridge, KANJIDIC2 serves as the canonical knowledge base for individual Japanese logographs, their structural properties, readings, and semantic glosses.

The registered release in NihingoBridge is **`upstream:kanjidic2:2023-08`** (database version `2023-232`, release date `2023-08-20`), exactly synchronized with the companion JMdict lexical release `upstream:jmdict:2023-08`.

## 2. Source Specification
- **Identifier:** `upstream:kanjidic2:2023-08`
- **Release Date:** `2023-08-20`
- **Database Version:** `2023-232`
- **File Version:** `4`
- **License:** Creative Commons Attribution-ShareAlike 3.0 Unported (CC-BY-SA-3.0)
- **Attribution:** Electronic Dictionary Research and Development Group (EDRDG)
- **Source SHA-256:** `260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781`
- **Decompressed Size:** 15,643,593 bytes
- **Total Character Entries:** 13,108

## 3. Entity Attributes & Mapping

| Field | Source XML Tag | Transformed Property | Canonical Type | Nullable | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ID** | Derived | `id` | `string` | No | `kanji-${literal}` or existing baseline ID (e.g. `kj-mei`) |
| **Character** | `<literal>` | `character` | `varchar(16)` | No | Japanese Kanji logograph |
| **Unicode** | `<cp_value cp_type="ucs">` | `unicode` | `string` | No | Standard notation `U+XXXX` (e.g. `U+5B66`) |
| **Hex Codepoint**| `<cp_value cp_type="ucs">` | `hexCodepoint` | `string` | No | Lowercase hex scalar (e.g. `5b66`) |
| **Stroke Count** | `<stroke_count>` (1st) | `strokeCount` | `integer` | No | Primary accepted stroke count (>= 1) |
| **Alt Strokes** | `<stroke_count>` (2nd+) | `additionalStrokeCounts`| `integer[]` | No | Alternate or miscount stroke counts |
| **Grade Level** | `<grade>` | `gradeLevel` | `integer` | Yes | 1-6 (Elementary), 8 (Secondary Jouyou), 9/10 (Jinmeiyou) |
| **JLPT Level** | `<jlpt>` | `jlptLevel` | `string` | No | Modern JLPT: `N5`, `N4`, `N2`, `N1`, or `NONE` |
| **Old JLPT** | `<jlpt>` | `jlptOld` | `integer` | Yes | 1 (N1), 2 (N2), 3 (N4), 4 (N5) |
| **Frequency** | `<freq>` | `frequencyRank` | `integer` | Yes | Newspaper frequency ranking (1..2501) |
| **Classical Rad**| `<rad_value rad_type="classical">`| `classicalRadical` | `integer` | Yes | Kangxi radical index (1..214) |
| **Nelson Rad** | `<rad_value rad_type="nelson_c">` | `nelsonRadical` | `integer` | Yes | Nelson radical system index |
| **On Readings** | `<reading r_type="ja_on">` | `readingsOn` | `jsonb (string[])`| No | Katakana Sino-Japanese readings |
| **Kun Readings**| `<reading r_type="ja_kun">`| `readingsKun` | `jsonb (string[])`| No | Native Japanese readings with okurigana preserved (`.`) |
| **Normalized Kun**| Derived from kun | `normalizedReadingsKun`| `string[]` | No | Kun readings without okurigana separators |
| **Nanori** | `<nanori>` | `readingsNanori` | `string[]` | No | Traditional name readings |
| **Meanings** | `<meaning>` (en) | `meanings` | `string[]` | No | Filtered English meanings |
| **Primary Meaning**| 1st English meaning | `meaning` / `primaryMeaning`| `text` | No | Concise definition |
| **Source Ref** | System constant | `sourceRef` | `text` | No | `upstream:kanjidic2:2023-08` |

## 4. Normalization and Cleaning Rules
1. **Zero AI Inventions:** Attributes are strictly extracted from canonical source XML.
2. **Missing Optional Elements:** Characters without grade, frequency, or JLPT default to null or `NONE`.
3. **Stroke Count Validation:** Any entry lacking stroke count or with stroke count <= 0 is rejected.
4. **Deterministic Identifier Generation:** New records receive `kanji-${character}`. Existing canonical baseline records (e.g. `kj-mei` for `明`) retain their IDs to guarantee zero overwrite risk.
5. **Memory Management:** Processing streams `<character>` elements sequentially with SAX/chunking, maintaining memory footprints strictly below 64 MB heap.
