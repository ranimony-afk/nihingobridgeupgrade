/**
 * Version 2 Radical & Component API contracts.
 *
 * Two related but distinct concepts are exposed separately:
 *  - a RADICAL is the classifying element of a kanji (Kangxi 1–214);
 *  - a COMPONENT is any visual piece a kanji is built from.
 * A component may or may not also be a radical; `radicalNumber` records that.
 */

export type RadicalSummary = {
  number: number;
  character: string;
  variants: string[];
  strokeCount: number;
  meaning: string;
  reading: string;
  /** Kanji in the corpus classified under this radical. */
  kanjiCount: number;
  /** Kanji in the corpus that contain this radical as a component. */
  componentCount: number;
};

export type RadicalKanjiItem = {
  literal: string;
  meanings: string[];
  strokeCount: number | null;
  grade: number | null;
  frequencyRank: number | null;
};

export type RadicalDetail = {
  apiVersion: "v2";
  number: number;
  character: string;
  variants: string[];
  strokeCount: number;
  meaning: string;
  reading: string;
  /** Kanji whose classifying radical is this one. */
  kanjiByRadical: RadicalKanjiItem[];
  /** Kanji that contain this radical as one of their components. */
  kanjiByComponent: RadicalKanjiItem[];
  provenance: {
    source: string;
    license: string;
    attribution: string;
  } | null;
};

export type RadicalIndexResponse = {
  apiVersion: "v2";
  total: number;
  /** Radicals grouped by their own stroke count, ascending. */
  groups: { strokeCount: number; radicals: RadicalSummary[] }[];
};

/** A component available for selection, with how many kanji it appears in. */
export type ComponentOption = {
  component: string;
  radicalNumber: number | null;
  strokeCount: number | null;
  meaning: string;
  kanjiCount: number;
};

export type ComponentIndexResponse = {
  apiVersion: "v2";
  total: number;
  components: ComponentOption[];
};

export type RadicalErrorCode =
  | "INVALID_NUMBER"
  | "INVALID_QUERY"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export type RadicalApiError = {
  error: { code: RadicalErrorCode; message: string };
};
