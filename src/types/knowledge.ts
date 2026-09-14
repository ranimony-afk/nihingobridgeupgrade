/**
 * Canonical domain contracts shared by the web app, the API layer and the
 * (future) Flutter client. Nothing in `src/components` or `mobile/` may invent
 * its own shape for these objects.
 */

export type ReadingType = "ja_on" | "ja_kun" | "nanori" | "pinyin" | "korean_r";

export interface KanjiReading {
  reading: string;
  readingType: ReadingType;
  position: number;
}

export interface KanjiSummary {
  id: number;
  literal: string;
  strokeCount: number | null;
  grade: number | null;
  frequency: number | null;
  jlptLevel: number | null;
  radicalNumber: number | null;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
}

export interface KanjiDetail extends KanjiSummary {
  codepoint: string | null;
  jlptLegacyLevel: number | null;
  heisigIndex: number | null;
  skipCode: string | null;
  nanori: string[];
  radicals: RadicalRef[];
  components: ComponentRef[];
  /** Kanji that use this literal as a decomposition component */
  usedIn: KanjiSummary[];
  vocabularyCount: number;
}

export interface RadicalRef {
  id: number;
  literal: string;
  strokeCount: number | null;
  radicalNumber: number | null;
  isKangxi: boolean;
  meanings: string[] | null;
  isPrimary: boolean;
  relation: string;
}

export interface ComponentRef {
  id: number;
  literal: string;
  kind: "kanji" | "radical_variant";
  strokeCount: number | null;
  usageCount: number;
  /** Present when the component glyph is itself a kanji entry */
  kanjiId: number | null;
  /** Meanings of the component (from the kanji entry or the radical record) */
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
}

export interface VocabularyEntry {
  id: number;
  externalId: string | null;
  kanjiText: string;
  kanaText: string | null;
  meanings: string[];
  partsOfSpeech: string[];
  priority: number | null;
  /** Kanji characters of this word that were matched (used for highlighting) */
  matchedKanji?: string[];
}

export interface RadicalDetail {
  id: number;
  literal: string;
  strokeCount: number | null;
  radicalNumber: number | null;
  isKangxi: boolean;
  meanings: string[];
  kanjiCount: number;
  kanji: KanjiSummary[];
  source: string | null;
}

/* ------------------------------ Mind Tree -------------------------------- */

export type MindTreeNodeKind = "kanji" | "radical" | "component" | "vocabulary";

export interface MindTreeNode {
  /** Stable id inside a single tree response, e.g. `kanji:12` */
  key: string;
  kind: MindTreeNodeKind;
  label: string;
  subLabel?: string;
  meanings: string[];
  /** Depth from the root node (root = 0) */
  depth: number;
  /** Parent node key (`null` for the root) */
  parent: string | null;
  /** The relation between the parent and this node */
  relation: string;
  /** Route in the web app that opens this node */
  href: string | null;
  /** Extra facts used by the detail inspector */
  meta: Record<string, string | number | null>;
  /** True when the node has children that are not part of this response */
  expandable: boolean;
}

export interface MindTreeEdge {
  from: string;
  to: string;
  relation: string;
}

export interface MindTree {
  /** The kanji the tree was built for */
  root: string;
  rootKanjiId: number;
  /** Maximum depth actually traversed */
  depth: number;
  nodes: MindTreeNode[];
  edges: MindTreeEdge[];
  /** Counts per branch, used by the UI badges */
  counts: {
    radicals: number;
    components: number;
    vocabulary: number;
    nodes: number;
  };
  provenance: Array<{
    code: string;
    name: string;
    license: string;
    version: string | null;
    sourceUrl: string | null;
  }>;
}

export interface KanjiSearchResult extends KanjiSummary {
  /** Why this row matched: literal | meaning | reading */
  matchedOn: "literal" | "meaning" | "reading";
  score: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: KanjiSearchResult[];
  tookMs: number;
}
