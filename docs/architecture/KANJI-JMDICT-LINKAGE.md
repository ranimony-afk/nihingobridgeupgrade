# Kanji-to-JMdict Lexical Linkage Model — Phase 14.4B

## 1. Overview
A central objective of NihingoBridge's knowledge architecture is establishing deterministic, bidirectional linkages between individual kanji logographs and their corresponding multi-kanji and single-kanji compound entries in the JMdict corpus (206,717 canonical entries).

## 2. Linkage Dimensions

Each linkage between a Kanji character $K$ and a JMdict entry $E$ contains:
1. **Character Indexing:** Target entry $E$ contains $K$ in its `kanjiCharacters` JSON array (`entry.kanji_characters @> [K]`).
2. **Reading Correlation:** The reading of $E$ is classified against the On'yomi and Kun'yomi sets of $K$.
3. **Compound Morphology Classification:**
   - **`ON_COMPOUND` (音読み熟語):** Multi-kanji Sino-Japanese compound where $K$'s portion uses an On'yomi reading (e.g. `学校` / `がっこう` for `学`).
   - **`KUN_COMPOUND` (訓読み熟語):** Compound where $K$ uses a Kun'yomi reading with native Japanese words (e.g. `青空` / `あおぞら` for `青`).
   - **`ON_SOLO` (単音読み語):** Single-kanji word read with On'yomi (e.g. `禅` / `ぜん`).
   - **`KUN_SOLO` (単訓読み語):** Single-kanji word or inflected verb/adjective read with Kun'yomi (e.g. `食べる` / `たべる` for `食`).
   - **`SPECIAL` (当て字・義訓):** Idiosyncratic or non-standard phonological match (e.g. `日参` / `にっさん`, `昨日` / `きのう`).
4. **Sense References:** Structured extraction of English glosses from $E$ to populate compound definitions on the kanji detail profile.

## 3. Dry-Run Verification Manifest

In Phase 14.4B, the deterministic linkage engine was tested and output to:
`reports/gates/PHASE-14.4B-KANJI-JMDICT-LINKAGE-MANIFEST.json`

Across 20 sampled core Jouyou kanji (`日`, `月`, `水`, `火`, `木`, `金`, `土`, `学`, `校`, `道`, `明`, `休`, `食`, `語`, `心`, `山`, `川`, `花`, `新`, `古`):
- **Total Linked Compounds Sampled:** 300
- **On Compounds:** 185 (61.7%)
- **Kun Compounds:** 36 (12.0%)
- **On Solo Words:** 1 (0.3%)
- **Kun Solo Words:** 2 (0.7%)
- **Special / Ateji Compounds:** 76 (25.3%)

## 4. Query Performance
Indexing `dictionary_entries.kanji_characters` with PostgreSQL JSONB GIN enables sub-50ms compound lookup across the 206,717 JMdict corpus without requiring memory-heavy joins or full-table scans.
