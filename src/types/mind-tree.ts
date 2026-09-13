/**
 * Kanji Mind Tree API contracts (Phase 06.4).
 *
 * The Mind Tree is a relationship graph centred on one kanji. Every node and
 * edge is projected from real database relationships — kanji_characters,
 * radicals, kanji_components and dictionary_entries — never from hand-drawn
 * fixture data. Web and future Flutter clients share these contracts.
 */

export type MindTreeNodeType =
  | "kanji"
  | "radical"
  | "component"
  | "vocabulary"
  | "related";

export type MindTreeNode = {
  /** Stable graph id, e.g. "kanji:語" / "radical:149" / "vocab:12". */
  id: string;
  type: MindTreeNodeType;
  /** Primary glyph shown in the node. */
  label: string;
  /** Secondary caption: meaning, reading or gloss. */
  sublabel: string;
  /** Client navigation target. */
  href: string;
  /** Branch grouping for layout + toggling. */
  branch: "radical" | "components" | "vocabulary" | "related" | "center";
};

export type MindTreeEdge = {
  from: string;
  to: string;
  /** Relationship label rendered on the connector. */
  label: string;
  kind:
    | "classified-under"
    | "built-from"
    | "used-in"
    | "shares-radical"
    | "shares-component";
};

export type MindTreeCenter = {
  literal: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  strokeCount: number | null;
  grade: number | null;
  frequencyRank: number | null;
};

export type MindTreeRadical = {
  number: number;
  character: string;
  variants: string[];
  meaning: string;
  reading: string;
  strokeCount: number;
} | null;

export type MindTreeComponent = {
  component: string;
  position: number;
  radicalNumber: number | null;
  radicalCharacter: string | null;
  radicalMeaning: string;
};

export type MindTreeVocabulary = {
  id: number;
  headword: string;
  primaryReading: string;
  firstGloss: string;
  isCommon: boolean;
};

export type MindTreeRelated = {
  literal: string;
  meanings: string[];
  strokeCount: number | null;
  grade: number | null;
  /** Why this kanji is related to the centre. */
  relation: "same-radical" | "shared-component";
  /** Components shared with the centre (empty for same-radical). */
  sharedComponents: string[];
  sharedCount: number;
};

export type MindTreeResponse = {
  apiVersion: "v2";
  literal: string;
  center: MindTreeCenter;
  radical: MindTreeRadical;
  components: MindTreeComponent[];
  vocabulary: MindTreeVocabulary[];
  related: MindTreeRelated[];
  /** Pre-built render graph: nodes + edges derived from the rows above. */
  graph: {
    nodes: MindTreeNode[];
    edges: MindTreeEdge[];
  };
  /** Counts before display limits, so the UI can say "+N more". */
  totals: {
    components: number;
    vocabulary: number;
    related: number;
  };
  provenance: {
    source: string;
    license: string;
    attribution: string;
    isFixture: boolean;
  } | null;
};

export type MindTreeErrorCode = "INVALID_LITERAL" | "NOT_FOUND" | "INTERNAL_ERROR";

export type MindTreeApiError = {
  error: { code: MindTreeErrorCode; message: string };
};
