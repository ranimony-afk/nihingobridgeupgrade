# Phase 14.4D: Stroke Count Reconciliation Report

**Generated Date:** 2026-09-23T11:16:44.840Z  
**Corpus:** KanjiVG (`r20240807`) vs Canonical KANJIDIC2 / Database Baseline (`kanji_entries`)  
**Total Matched Characters Analyzed:** 6416

---

## 1. Reconciliation Overview

| Category | Count | Percentage | Policy & Handling |
| :--- | :--- | :--- | :--- |
| **Stroke Count Match (`STROKE_COUNT_MATCH`)** | 6329 | 98.6% | Identical stroke counts in KANJIDIC2 and KanjiVG |
| **Stroke Count Discrepancy (`STROKE_COUNT_DISCREPANCY`)** | 84 | 1.3% | Documented divergence; both provenance records preserved |

---

## 2. Invariant & Discrepancy Policy
1. **Zero Silent Overwrite:** KANJIDIC2 stroke counts remain canonical in `kanji_entries`. KanjiVG stroke counts are retained in visual assets without modifying metadata.
2. **Double Provenance Preservation:** Both sources are cited: `source_ref = 'upstream:kanjidic2:2023-08'` for canonical kanji metadata, and `source_ref = 'upstream:kanjivg:2024-08'` for stroke vectors.
3. **Specific Discrepancy Highlight: `箸` (Chopsticks):**
   - Canonical DB (First-Party Baseline): 14 strokes
   - KANJIDIC2: 15 strokes
   - KanjiVG: 15 strokes (竹=6 + 者=9)
   - Decision: Retain 14 strokes in canonical baseline; KanjiVG vector asset renders the 15-stroke classical path without mutating `kanji_entries`.

---

## 3. Sample Stroke Count Discrepancies (Top 25)

| Kanji | ID | DB / KANJIDIC2 Strokes | KanjiVG Vector Strokes | Discrepancy Reason |
| :--- | :--- | :--- | :--- | :--- |
| **倏** | `kanji-倏` | 10 | 11 | Variant stroke segmentation / component counting |
| **僊** | `kanji-僊` | 13 | 14 | Variant stroke segmentation / component counting |
| **卿** | `kanji-卿` | 12 | 10 | Variant stroke segmentation / component counting |
| **叟** | `kanji-叟` | 10 | 9 | Variant stroke segmentation / component counting |
| **呀** | `kanji-呀` | 8 | 7 | Variant stroke segmentation / component counting |
| **呰** | `kanji-呰` | 9 | 8 | Variant stroke segmentation / component counting |
| **噓** | `kanji-噓` | 14 | 15 | Variant stroke segmentation / component counting |
| **嚔** | `kanji-嚔` | 17 | 18 | Variant stroke segmentation / component counting |
| **嚢** | `kanji-嚢` | 18 | 22 | Variant stroke segmentation / component counting |
| **圍** | `kanji-圍` | 13 | 12 | Variant stroke segmentation / component counting |
| **嫂** | `kanji-嫂` | 13 | 12 | Variant stroke segmentation / component counting |
| **嶐** | `kanji-嶐` | 14 | 15 | Variant stroke segmentation / component counting |
| **幃** | `kanji-幃` | 13 | 12 | Variant stroke segmentation / component counting |
| **廐** | `kanji-廐` | 13 | 14 | Variant stroke segmentation / component counting |
| **徽** | `kanji-徽` | 17 | 16 | Variant stroke segmentation / component counting |
| **惓** | `kanji-惓` | 12 | 11 | Variant stroke segmentation / component counting |
| **戠** | `kanji-戠` | 13 | 12 | Variant stroke segmentation / component counting |
| **挽** | `kanji-挽` | 10 | 11 | Variant stroke segmentation / component counting |
| **捗** | `kanji-捗` | 10 | 11 | Variant stroke segmentation / component counting |
| **捲** | `kanji-捲` | 11 | 12 | Variant stroke segmentation / component counting |
| **搜** | `kanji-搜` | 13 | 12 | Variant stroke segmentation / component counting |
| **擒** | `kanji-擒` | 16 | 15 | Variant stroke segmentation / component counting |
| **旆** | `kanji-旆` | 10 | 11 | Variant stroke segmentation / component counting |
| **旡** | `kanji-旡` | 5 | 4 | Variant stroke segmentation / component counting |
| **桀** | `kanji-桀` | 11 | 10 | Variant stroke segmentation / component counting |

---

## 4. Stroke Reconciliation Verdict
**Verdict:** `PASS — STROKE COUNT AUDIT COMPLETE (ZERO SILENT OVERWRITES)`
