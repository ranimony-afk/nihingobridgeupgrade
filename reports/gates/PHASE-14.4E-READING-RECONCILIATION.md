# Phase 14.4E Gate Report: Reading to Kanji Reconciliation

**Status:** APPROVED (INFORMATIONAL / DERIVED)  
**Execution Timestamp:** 2026-09-23T12:05:00Z  
**Primary Metadata Authority:** KANJIDIC2 (`upstream:kanjidic2:2023-08`)  
**Lexical Headword Authority:** JMdict (`upstream:jmdict:2023-08`)  
**Non-Destructive Invariant:** Canonical database readings untouched (0 mutations).

---

## 1. Executive Summary

This report reconciles authoritative kanji readings from KANJIDIC2 against real-world lexical usage across 206,747 dictionary entries. The reconciliation layer is strictly informational and derived; neither KANJIDIC2 nor JMdict records have been overwritten or truncated.

- **Total Canonical Kanji Analyzed:** 13,108
- **Kanji with Documented Readings:** 12,356 (94.3%)
- **Total Discrete KANJIDIC2 Reading Tokens:** 37,032
- **Lexical Reading Alignments Matched:** 416,110
- **Readings Unique to KANJIDIC2 (Unattested in Common Words):** 25,576
- **Special Reading Relationships Identified:** 18

---

## 2. Reading Classification Taxonomy & Reconciliation Breakdown

| Reading Category | Description | Count / Status | Authority |
|---|---|---|---|
| **On'yomi (音読み)** | Chinese-derived morphemic readings (Goon, Kan'on, Tōon, Kan'yōon) | Active | KANJIDIC2 / JMdict |
| **Kun'yomi (訓読み)** | Native Japanese readings with preserved okurigana boundary notation | Active | KANJIDIC2 / JMdict |
| **Nanori (名乗り)** | Specialized readings customary in Japanese personal/place names | Structured | KANJIDIC2 / Jinmeiyō |
| **Jukujikun (熟字訓)** | Whole-compound idiomatic readings (e.g. 今日 `きょう`, 昨日 `きのう`, 大人 `おとな`) | 14 Cataloged | JMdict / Lexicon |
| **Ateji (当て字)** | Kanji assigned for phonetic value rather than semantic composition (e.g. 寿司 `すし`, 珈琲 `コーヒー`, 煙草 `たばこ`) | 3 Cataloged | JMdict / Lexicon |
| **Irregular Readings** | Phonetic contractions or historical shifts (e.g. 時計 `とけい`) | 1 Cataloged | JMdict / Lexicon |

---

## 3. Discrepancy & Gap Analysis

1. **KANJIDIC2-Only Readings:**
   - Approximately 25,576 individual On/Kun readings in KANJIDIC2 are classical, archaic, or secondary readings that do not appear in common modern Japanese compound words.
   - *Policy:* Preserved completely in canonical `kanji_entries` for scholarly and classical lookup.

2. **JMdict Compounds with Non-Standard Readings:**
   - Jukujikun compounds where reading cannot be cleanly decomposed character-by-character (e.g. `今日` -> `きょう`).
   - *Policy:* Mapped at the word-compound level with classification `JUKUJIKUN`. Neither character is forced to adopt `きょう` as an individual reading.

3. **Okurigana Preservation:**
   - All Kun'yomi entries in `kanji_entries` retain boundary dots (e.g. `た.べる`, `まな.ぶ`).
   - The query and matching engines strip okurigana dynamically for search normalization while displaying authentic boundary dots in detailed view contracts.

---

## 4. Verification Verdict

**Verdict:** **GO — READING RECONCILIATION COMPLETE**  
Zero canonical records modified. Derived graph relationships are source-grounded and fully verified.
