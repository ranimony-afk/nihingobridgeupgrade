/**
 * KanjiSearch owns query normalization and input constraints.
 *
 * No Drizzle or SQL here — this keeps query semantics stable across the HTTP
 * API and future mobile clients.
 */

import { isKana, toKana } from "wanakana";
import { isKanjiLiteral } from "@/lib/japanese";
import type { JlptLevel } from "@/types/dictionary-v2";
import type { KanjiSearchQuery } from "@/types/kanji-v2";

export class KanjiSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KanjiSearchError";
  }
}

const MAX_QUERY_LENGTH = 100;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;
/** Multi-radical pickers rarely need more than a handful of components. */
const MAX_COMPONENTS = 12;

function parseIntParam(
  raw: string | null,
  name: string,
  min: number,
  max: number,
): number | null {
  if (raw === null || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) {
    throw new KanjiSearchError(`${name} must be a positive integer.`);
  }
  const value = Number.parseInt(raw.trim(), 10);
  if (value < min || value > max) {
    throw new KanjiSearchError(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

export class KanjiSearch {
  parse(params: {
    q?: string | null;
    limit?: string | null;
    offset?: string | null;
    strokes?: string | null;
    grade?: string | null;
    radical?: string | null;
    jlpt?: string | null;
    component?: string | null;
    components?: string | null;
  }): KanjiSearchQuery {
    const normalizedQuery = params.q ? this.normalize(params.q) : null;
    const romajiKana = normalizedQuery ? this.toKanaTerm(normalizedQuery) : null;

    const strokes = parseIntParam(params.strokes ?? null, "strokes", 1, 64);
    const grade = parseIntParam(params.grade ?? null, "grade", 1, 10);
    const radical = parseIntParam(params.radical ?? null, "radical", 1, 214);
    const jlpt = this.parseJlpt(params.jlpt ?? null);
    const component = this.parseComponent(params.component ?? null);
    const components = this.parseComponents(params.components ?? null);

    if (
      (!normalizedQuery || normalizedQuery.length === 0) &&
      strokes === null &&
      grade === null &&
      radical === null &&
      jlpt === null &&
      component === null &&
      components.length === 0
    ) {
      throw new KanjiSearchError(
        "Provide a kanji query, or at least one filter (strokes, grade, radical, jlpt, component, components).",
      );
    }

    if (normalizedQuery && Array.from(normalizedQuery).length > MAX_QUERY_LENGTH) {
      throw new KanjiSearchError(
        `Kanji queries must be ${MAX_QUERY_LENGTH} characters or fewer.`,
      );
    }

    return {
      query: params.q ?? null,
      normalizedQuery: normalizedQuery && normalizedQuery.length > 0 ? normalizedQuery : null,
      romajiKana,
      strokes,
      grade,
      radical,
      jlpt,
      component,
      components,
      limit: this.parseLimit(params.limit ?? null),
      offset: this.parseOffset(params.offset ?? null),
    };
  }

  /** NFKC folds full-width variants and collapses whitespace. */
  normalize(value: string): string {
    return value.normalize("NFKC").replace(/\s+/g, " ").trim();
  }

  private toKanaTerm(normalized: string): string | null {
    const kana = toKana(normalized);
    return kana !== normalized && isKana(kana) ? kana : null;
  }

  private parseLimit(raw: string | null): number {
    if (raw === null || raw.trim() === "") return DEFAULT_LIMIT;
    if (!/^\d+$/.test(raw.trim())) {
      throw new KanjiSearchError("limit must be a positive integer.");
    }
    const value = Number.parseInt(raw.trim(), 10);
    if (value < 1 || value > MAX_LIMIT) {
      throw new KanjiSearchError(`limit must be between 1 and ${MAX_LIMIT}.`);
    }
    return value;
  }

  private parseOffset(raw: string | null): number {
    if (raw === null || raw.trim() === "") return 0;
    if (!/^\d+$/.test(raw.trim())) {
      throw new KanjiSearchError("offset must be a non-negative integer.");
    }
    const value = Number.parseInt(raw.trim(), 10);
    if (value < 0 || value > MAX_OFFSET) {
      throw new KanjiSearchError(`offset must be between 0 and ${MAX_OFFSET}.`);
    }
    return value;
  }

  private parseJlpt(raw: string | null): JlptLevel | null {
    if (raw === null || raw.trim() === "") return null;
    const normalized = raw.trim().toUpperCase();
    if (!/^N[1-5]$/.test(normalized)) {
      throw new KanjiSearchError("jlpt must be one of N1, N2, N3, N4, or N5.");
    }
    return normalized as JlptLevel;
  }

  /**
   * Multi-radical lookup. Accepts a comma-separated or bare-concatenated list
   * (e.g. "言,口" or "言口"), since pickers naturally produce both shapes.
   * Every entry must be a single kanji character.
   */
  private parseComponents(raw: string | null): string[] {
    if (raw === null || raw.trim() === "") return [];
    const normalized = this.normalize(raw);

    const pieces = normalized.includes(",")
      ? normalized.split(",").map((piece) => piece.trim()).filter(Boolean)
      : Array.from(normalized);

    const unique: string[] = [];
    for (const piece of pieces) {
      if (!isKanjiLiteral(piece)) {
        throw new KanjiSearchError(
          "components must be a list of single kanji characters.",
        );
      }
      if (!unique.includes(piece)) unique.push(piece);
    }
    if (unique.length > MAX_COMPONENTS) {
      throw new KanjiSearchError(
        `components accepts at most ${MAX_COMPONENTS} characters.`,
      );
    }
    return unique;
  }

  /** A component/radical lookup must be exactly one kanji ideograph. */
  private parseComponent(raw: string | null): string | null {
    if (raw === null || raw.trim() === "") return null;
    const normalized = this.normalize(raw);
    if (!isKanjiLiteral(normalized)) {
      throw new KanjiSearchError("component must be a single kanji character.");
    }
    return normalized;
  }
}
