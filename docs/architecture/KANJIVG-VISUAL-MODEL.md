# KanjiVG Visual & Stroke-Order Architecture — Phase 14.4D

## 1. Overview
In the NihingoBridge Takoboto-class dictionary architecture, visual kanji intelligence provides vector stroke-order diagrams, sequential stroke animations, component breakdown visualizations, and handwriting practice models.

While **KANJIDIC2** (`upstream:kanjidic2:2023-08`) serves as the canonical source for structured kanji metadata (meanings, On/Kun readings, JLPT levels, Jouyou grades, frequency) and **JMdict** (`upstream:jmdict:2023-08`) supplies lexical compounds, **KanjiVG** (`upstream:kanjivg:2024-08`) provides vector stroke geometry and structural component hierarchies.

```
       KANJIDIC2
           │ (Canonical Entity Metadata)
           ▼
     kanji_entries (13,108 canonical records)
           ▲
           │ (Attached Vector Visuals & Animations)
        KanjiVG (11,658 SVG assets)

     dictionary_entries (206,747 entries)
           ▲
           │ (Compound Linkage: kanji_characters)
        JMdict
```

## 2. Upstream Source & Release Specification
- **Identifier:** `upstream:kanjivg:2024-08`
- **Release Version:** `r20240807`
- **Release Commit:** `a4b51d966d832544c371d566f9c84174e4beff3b`
- **Release Date:** `2024-08-07`
- **License:** Creative Commons Attribution-ShareAlike 3.0 Unported (`CC-BY-SA-3.0`)
- **Attribution:** Ulrich Apel and the KanjiVG project (CC BY-SA 3.0)
- **Archive Size:** 6.1 MB compressed (`kanjivg-r20240807.tar.gz`), 76 MB uncompressed
- **Total Asset Files:** 11,658 SVG files (6,699 primary standard glyphs + 4,959 font/calligraphic variants)
- **Indexed Characters:** 6,702 distinct characters (covering 100% Jouyou kanji, Jinmeiyo, and JIS Level 1 & 2)

## 3. Storage Strategy & Architecture Audit
A formal audit of the existing PostgreSQL schema (`kanji_entries`, `kanji_radicals`, `kanji_composition`) established:
1. **Zero Database Migrations Required:** Storing 11,658 vector SVG definitions directly as database rows would dramatically increase table size, inflate backup snapshots, and slow query execution without providing relational benefit.
2. **Filesystem & Service Cache Architecture:** Visual assets are stored in the verified `data/kanjivg/` repository and served via `KanjiVisualService` with in-memory LRU caching.
3. **Decoupled Canonical Identity:** Vector assets attach to canonical kanji via deterministic IDs (`kanji-${character}` or baseline IDs like `kj-mei`).

## 4. SVG Structural Model & Stroke Invariants
Each KanjiVG SVG definition encapsulates:
- **Root Element:** `<svg viewBox="0 0 109 109" width="109" height="109">`
- **Stroke Container:** `<g id="kvg:StrokePaths_XXXXX">`
- **Character / Component Groups:** `<g id="kvg:XXXXX-gY" kvg:element="..." kvg:position="left|right|top|bottom">`
- **Individual Strokes:** `<path id="kvg:XXXXX-sN" kvg:type="㇑" d="M..."/>`
- **Stroke Numbers:** `<g id="kvg:StrokeNumbers_XXXXX"><text transform="...">N</text></g>`

### Stroke Order Invariants:
1. **Continuous Sequence:** Strokes are strictly ordered $1..N$ with zero missing numbers and zero duplicate indices.
2. **Valid Path Data:** Every stroke possesses non-empty Bézier curve path commands (`M`, `C`, `S`, `Q`, `L`, `Z`).
3. **Deterministic Coordinates:** Standardized on a $109 \times 109$ coordinate canvas.

## 5. Security & Sanitization Standards
To safeguard server-side rendering (SSR), client-side DOM insertion, and mobile rendering, all incoming SVGs are processed by `validateSvgSecurity`:
- **Executable Elements Blocked:** `<script>`, `<iframe>`, `<foreignObject>`, `<object>`, `<embed>`.
- **Event Handlers Blocked:** All `on*` attributes (`onload`, `onerror`, `onclick`, etc.).
- **Protocol Restrictions:** `javascript:` and `data:text/html` strictly rejected.
- **Network Triggers Blocked:** External HTTP/HTTPS links in `href` or `xlink:href` are stripped or rejected.
- **Safe Rendering:** Guaranteed 100% safe for direct inline SVG insertion or WebView consumption.

## 6. Stroke Count Discrepancy Policy
KANJIDIC2 stroke counts and KanjiVG stroke counts can occasionally diverge due to differing calligraphic traditions (e.g. counting a continuous angle as one stroke vs two).
- **Rule:** Never silently overwrite KANJIDIC2 canonical metadata with KanjiVG stroke counts.
- **Classification:** Records are categorized into `STROKE_COUNT_MATCH` (6,329 characters, 98.7%) and `STROKE_COUNT_DISCREPANCY` (84 characters, 1.3%).
- **Case in Point (`箸`):** Baseline canonical record retains 14 strokes; KanjiVG vector asset renders the 15-stroke classical path (`竹`=6, `者`=9) without modifying `kanji_entries`.

## 7. Mobile Visual Asset Contract (Android / Flutter)
The mobile contract defined in `src/types/mobileDictionary.ts` provides:
```typescript
interface KanjiVisualAsset {
  character: string;
  canonicalKanjiId: string;
  sourceRef: string;
  svg: string;
  viewBox: string;
  strokeCount: number;
  strokes: Array<{
    order: number;
    id: string;
    path: string;
    type?: string;
  }>;
  components: Array<{
    element: string;
    position?: string | null;
    radical?: string | null;
  }>;
  version: string;
}
```
This payload is cacheable, offline-ready, and directly consumable by Flutter `CustomPainter` or Android VectorDrawable renderers.
