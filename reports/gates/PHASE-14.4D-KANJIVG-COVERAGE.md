# Phase 14.4D: KanjiVG Coverage Report

**Generated Date:** 2026-09-23T11:16:44.840Z  
**Authoritative Release:** `upstream:kanjivg:2024-08` (`r20240807`)  
**Canonical Baseline Target:** `kanji_entries` (13,108 canonical records)

---

## 1. Executive Summary

| Metric | Count | Percentage | Classification / Notes |
| :--- | :--- | :--- | :--- |
| **Total Canonical Kanji (Database)** | 13,108 | 100.0% | Complete canonical kanji inventory |
| **First-Party Baseline Kanji** | 45 | 100.0% | Curated baseline logographs |
| **First-Party Matched in KanjiVG** | 45 | **100.0%** | All 45 first-party kanji have full KanjiVG vector assets |
| **KANJIDIC2 Ingested Matched in KanjiVG** | 6,371 | 48.8% | Covers 100% Jouyou (2,136), Jinmeiyo, JIS Lv1 & Lv2 |
| **Total Matched (`KANJIVG_MATCH`)** | 6,416 | 48.9% | Verified vector stroke assets available |
| **Missing Artwork (`KANJIVG_MISSING`)** | 6,692 | 51.1% | Rare/archaic JIS X 0212/0213 kanji lacking upstream artwork |
| **Extra Elements (`KANJIVG_EXTRA`)** | 286 | — | Punctuation, digits 0-9, kana, standalone Kangxi radicals |
| **Invalid Characters (`INVALID_CHARACTER`)** | 0 | 0.0% | Zero malformed Unicode logographs |
| **Duplicate Entries (`DUPLICATE`)** | 0 | 0.0% | Zero duplicate character keys |

---

## 2. Coverage Analysis

### Jouyou & Core Educational Kanji
- **100% of Jouyou Kanji (2,136 characters)** are fully matched with vector stroke paths, component breakdowns, and radical classifications.
- **100% of JLPT N5, N4, N3, N2, and N1 kanji** have complete stroke-order diagrams.

### First-Party Baseline Kanji
All 45 first-party canonical kanji (including `明`, `休`, `林`, `森`, `好`, `男`, `花`, `茶`, `語`, `聞`, `道`, `新`, `話`, `水`, `火`, `心`, `紙`, `晴`, `結`, `念`, `観`, `鑑`, `箸`) have 100% visual asset coverage.

### Missing Artwork Assessment (`KANJIVG_MISSING`)
The 6,692 kanji missing from KanjiVG are obscure, archaic, or classical variant characters (e.g. specialized Kangxi variants, JIS level 3/4) that the KanjiVG project has not yet vectorized. In accordance with Phase 14.4D rules, this legitimate absence is audited and preserved without synthesizing or fabricating fake stroke vectors.

### Extra Non-Kanji Elements (`KANJIVG_EXTRA`)
KanjiVG indexes 286 non-kanji elements:
- Digits: `0` through `9`
- Punctuation: `!`, `,`, `.`, `:`, `;`, `?`
- Katakana & Hiragana elements
- Standalone Kangxi radical glyphs

---

## 3. Coverage Verdict
**Verdict:** `PASS — KANJIVG COVERAGE AUDIT COMPLETE`
