/**
 * KanjiVG Transformation & Visual Asset Engine — Phase 14.4D.
 *
 * Transforms parsed KanjiVG SVG vector definitions into validated visual assets.
 * Reconciles stroke counts with canonical KANJIDIC2 records without overwriting metadata.
 *
 * Establishes the offline-friendly, versioned mobile visual asset contract:
 * KanjiVisualAsset (Android/Flutter/Web compatible).
 */

import type { KanjiVgParsedSvg } from "./kanjiVgParser";

export const KANJIVG_SOURCE_REF = "upstream:kanjivg:2024-08";
export const KANJIVG_VERSION = "r20240807";

export interface KanjiVisualStroke {
  order: number;
  id: string;
  path: string;
  type?: string;
}

export interface KanjiVisualComponent {
  element: string;
  position?: string | null;
  radical?: string | null;
}

export interface KanjiVisualAsset {
  character: string;
  canonicalKanjiId: string;
  sourceRef: string;
  svg: string;
  viewBox: string;
  strokeCount: number;
  strokes: KanjiVisualStroke[];
  components: KanjiVisualComponent[];
  primaryRadical: {
    element: string;
    type: string;
    position?: string | null;
  } | null;
  version: string;
}

export type StrokeCountAuditStatus =
  | "STROKE_COUNT_MATCH"
  | "STROKE_COUNT_DISCREPANCY";

export interface StrokeCountComparison {
  character: string;
  canonicalKanjiId: string;
  kanjidicStrokeCount: number;
  kanjivgStrokeCount: number;
  status: StrokeCountAuditStatus;
  note?: string;
}

export interface KanjiVgTransformResult {
  asset: KanjiVisualAsset | null;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates stroke sequence integrity (1..N without gaps or duplicates).
 */
export function validateStrokeSequence(
  strokes: Array<{ order: number; path: string }>
): { isValid: boolean; error?: string } {
  if (strokes.length === 0) {
    return { isValid: false, error: "Zero strokes found in visual asset" };
  }

  const seenOrders = new Set<number>();
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    const expectedOrder = i + 1;

    if (s.order !== expectedOrder) {
      return {
        isValid: false,
        error: `Stroke order sequence broken: expected ${expectedOrder}, got ${s.order}`,
      };
    }

    if (seenOrders.has(s.order)) {
      return {
        isValid: false,
        error: `Duplicate stroke order detected: ${s.order}`,
      };
    }
    seenOrders.add(s.order);

    if (!s.path || s.path.trim().length === 0) {
      return {
        isValid: false,
        error: `Empty path geometry detected on stroke ${s.order}`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Transforms a parsed KanjiVG SVG into a canonical KanjiVisualAsset.
 */
export function transformKanjiVgSvg(
  parsed: KanjiVgParsedSvg,
  canonicalKanjiId?: string
): KanjiVgTransformResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Security validation
  if (!parsed.isSafe) {
    errors.push(...parsed.securityDiagnostics);
    return { asset: null, isValid: false, errors, warnings };
  }

  if (!parsed.character) {
    errors.push(`Missing character for codepoint: ${parsed.codepoint}`);
    return { asset: null, isValid: false, errors, warnings };
  }

  // 2. Stroke sequence validation
  const seqCheck = validateStrokeSequence(parsed.strokes);
  if (!seqCheck.isValid) {
    errors.push(seqCheck.error || "Invalid stroke sequence");
    return { asset: null, isValid: false, errors, warnings };
  }

  // 3. Deterministic ID resolution
  const resolvedKanjiId =
    canonicalKanjiId || `kanji-${parsed.character}`;

  // 4. Map components deduplicated
  const componentMap = new Map<string, KanjiVisualComponent>();
  for (const c of parsed.components) {
    const key = `${c.element}:${c.position || ""}`;
    if (!componentMap.has(key)) {
      componentMap.set(key, {
        element: c.element,
        position: c.position || null,
        radical: c.radical || null,
      });
    }
  }

  const asset: KanjiVisualAsset = {
    character: parsed.character,
    canonicalKanjiId: resolvedKanjiId,
    sourceRef: KANJIVG_SOURCE_REF,
    svg: parsed.rawSvg,
    viewBox: parsed.viewBox,
    strokeCount: parsed.strokeCount,
    strokes: parsed.strokes.map((s) => ({
      order: s.order,
      id: s.id,
      path: s.path,
      type: s.type,
    })),
    components: Array.from(componentMap.values()),
    primaryRadical: parsed.primaryRadical,
    version: KANJIVG_VERSION,
  };

  return {
    asset,
    isValid: true,
    errors,
    warnings,
  };
}

/**
 * Reconciles stroke counts between KANJIDIC2 and KanjiVG.
 */
export function compareStrokeCounts(
  character: string,
  canonicalKanjiId: string,
  kanjidicStrokeCount: number,
  kanjivgStrokeCount: number
): StrokeCountComparison {
  const matches = kanjidicStrokeCount === kanjivgStrokeCount;
  return {
    character,
    canonicalKanjiId,
    kanjidicStrokeCount,
    kanjivgStrokeCount,
    status: matches ? "STROKE_COUNT_MATCH" : "STROKE_COUNT_DISCREPANCY",
    note: matches
      ? undefined
      : `Discrepancy: KANJIDIC2=${kanjidicStrokeCount} strokes vs KanjiVG=${kanjivgStrokeCount} strokes`,
  };
}
