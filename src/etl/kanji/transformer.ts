import { normalizeJLPTLevel } from "@/etl/grammar/types";
import type {
  KanjiEntryInput,
  KanjiRadicalInput,
  KanjiCompositionInput,
  RawKanjidicCharacter,
  CanonicalKanjiRecord,
  KanjidicTransformResult,
} from "./types";

export const KANJIDIC2_SOURCE_REF = "upstream:kanjidic2:2023-08";

/**
 * Normalizes KANJIDIC2 old JLPT level (1..4) to the modern JLPT level string (N1..N5, NONE).
 * Old JLPT:
 * 4 -> N5 (basic beginner)
 * 3 -> N4 (elementary)
 * 2 -> N2 (upper-intermediate)
 * 1 -> N1 (advanced)
 */
export function mapOldJlptToModern(jlptOld: number | null): "N5" | "N4" | "N3" | "N2" | "N1" | "NONE" {
  if (jlptOld === null || jlptOld === undefined) return "NONE";
  switch (jlptOld) {
    case 4:
      return "N5";
    case 3:
      return "N4";
    case 2:
      return "N2";
    case 1:
      return "N1";
    default:
      return "NONE";
  }
}

/**
 * Strips okurigana delimiter '.' and hyphen prefixes/suffixes from a Kun'yomi reading.
 * e.g., "た.べる" -> "たべる", "-づ.く" -> "づく", "お.える" -> "おえる".
 */
export function normalizeKunReading(kunReading: string): string {
  if (!kunReading) return "";
  return kunReading.replace(/\./g, "").replace(/^-+|-+$/g, "");
}

/**
 * Derives hexadecimal Unicode codepoint and standard "U+XXXX" string for a character.
 */
export function extractUnicodeCodepoints(character: string, rawUcs?: string): {
  hexCodepoint: string;
  unicode: string;
} {
  if (rawUcs && /^[0-9a-fA-F]+$/.test(rawUcs)) {
    const hex = rawUcs.toLowerCase();
    return {
      hexCodepoint: hex,
      unicode: `U+${hex.toUpperCase().padStart(4, "0")}`,
    };
  }

  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return { hexCodepoint: "", unicode: "" };
  }
  const hex = codePoint.toString(16).toLowerCase();
  return {
    hexCodepoint: hex,
    unicode: `U+${hex.toUpperCase().padStart(4, "0")}`,
  };
}

/**
 * Generates deterministic canonical ID for a kanji character.
 * Uses existing ID if present in existingIdMap (e.g. "kj-mei"),
 * otherwise falls back to the deterministic "kanji-${character}" standard.
 */
export function generateKanjiId(
  character: string,
  existingIdMap?: Map<string, string>
): string {
  if (existingIdMap && existingIdMap.has(character)) {
    return existingIdMap.get(character)!;
  }
  return `kanji-${character}`;
}

/**
 * Transforms a raw KANJIDIC2 character into a validated canonical kanji record.
 */
export function transformKanjidicCharacter(
  raw: RawKanjidicCharacter,
  existingIdMap?: Map<string, string>
): KanjidicTransformResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const character = raw.literal?.trim();
  if (!character) {
    errors.push("Missing literal character");
    return { record: null, isValid: false, errors, warnings };
  }

  // Stroke counts
  if (!raw.strokeCounts || raw.strokeCounts.length === 0) {
    errors.push(`Missing stroke count for kanji ${character}`);
    return { record: null, isValid: false, errors, warnings };
  }

  const primaryStrokeCount = raw.strokeCounts[0];
  if (primaryStrokeCount < 1 || !Number.isInteger(primaryStrokeCount)) {
    errors.push(`Invalid stroke count ${primaryStrokeCount} for kanji ${character}`);
    return { record: null, isValid: false, errors, warnings };
  }
  const additionalStrokeCounts = raw.strokeCounts.slice(1);

  // Unicode codepoint
  const rawUcs = raw.codepoints.find((cp) => cp.type === "ucs")?.value;
  const { hexCodepoint, unicode } = extractUnicodeCodepoints(character, rawUcs);
  if (!hexCodepoint || !unicode) {
    errors.push(`Could not derive Unicode codepoint for kanji ${character}`);
    return { record: null, isValid: false, errors, warnings };
  }

  // Radicals
  const classicalRadical =
    raw.radicals.find((r) => r.type === "classical")?.value ?? null;
  const nelsonRadical =
    raw.radicals.find((r) => r.type === "nelson_c")?.value ?? null;

  // Readings separation
  const readingsOn: string[] = [];
  const readingsKun: string[] = [];
  const normalizedReadingsKun: string[] = [];

  for (const r of raw.readings) {
    if (r.type === "ja_on") {
      readingsOn.push(r.value);
    } else if (r.type === "ja_kun") {
      readingsKun.push(r.value);
      const norm = normalizeKunReading(r.value);
      if (norm && !normalizedReadingsKun.includes(norm)) {
        normalizedReadingsKun.push(norm);
      }
    }
  }

  const readingsNanori = [...(raw.nanori || [])];

  // Meanings (English)
  const meanings = raw.meanings
    .filter((m) => !m.lang || m.lang === "en")
    .map((m) => m.text);
  const primaryMeaning = meanings[0] || "";

  if (meanings.length === 0) {
    warnings.push(`Kanji ${character} has no English meanings in KANJIDIC2`);
  }

  const jlptLevel = mapOldJlptToModern(raw.jlptOld);

  const id = generateKanjiId(character, existingIdMap);

  const record: CanonicalKanjiRecord = {
    id,
    character,
    unicode,
    hexCodepoint,
    strokeCount: primaryStrokeCount,
    additionalStrokeCounts,
    gradeLevel: raw.grade ?? null,
    jlptLevel,
    jlptOld: raw.jlptOld ?? null,
    frequencyRank: raw.frequency ?? null,
    classicalRadical,
    nelsonRadical,
    readingsOn,
    readingsKun,
    normalizedReadingsKun,
    readingsNanori,
    meanings,
    primaryMeaning,
    variants: raw.variants || [],
    radicalNames: raw.radicalNames || [],
    sourceRef: KANJIDIC2_SOURCE_REF,
  };

  return {
    record,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}


export interface TransformedKanjiData {
  radicals: KanjiRadicalInput[];
  kanji: KanjiEntryInput[];
  compositions: KanjiCompositionInput[];
}

export function validateAndTransformKanjiData(
  entries: KanjiEntryInput[],
  additionalRadicals: KanjiRadicalInput[] = []
): TransformedKanjiData {
  const radicalsMap = new Map<string, KanjiRadicalInput>();
  const kanjiMap = new Map<string, KanjiEntryInput>();
  const compositions: KanjiCompositionInput[] = [];

  // Register additional radicals
  for (const rad of additionalRadicals) {
    if (!rad.id || !rad.character || !rad.meaning) {
      throw new Error(`Invalid radical: ${JSON.stringify(rad)}`);
    }
    radicalsMap.set(rad.id, {
      ...rad,
      altForms: rad.altForms ?? [],
      strokeCount: Math.max(1, rad.strokeCount),
      readingOn: rad.readingOn || null,
      kangxiNumber: rad.kangxiNumber ?? null,
      mnemonic: rad.mnemonic ?? null,
      sourceRef: rad.sourceRef || "first-party:kanji-corpus:v1",
    });
  }

  for (const entry of entries) {
    if (!entry.id || !entry.character || !entry.meaning) {
      throw new Error(`Invalid kanji entry: missing required fields in ${JSON.stringify(entry)}`);
    }

    if (entry.strokeCount <= 0 || !Number.isInteger(entry.strokeCount)) {
      throw new Error(`Invalid stroke count ${entry.strokeCount} for kanji ${entry.character}`);
    }

    // Normalize JLPT level
    const normalizedJLPT = normalizeJLPTLevel(entry.jlptLevel);

    // Validate vocabulary
    const validVocabulary = (entry.vocabulary || []).map((v) => {
      if (!v.word || !v.reading || !v.meaning) {
        throw new Error(`Invalid vocabulary item in kanji ${entry.character}: ${JSON.stringify(v)}`);
      }
      return {
        word: v.word.trim(),
        reading: v.reading.trim(),
        meaning: v.meaning.trim(),
      };
    });

    const transformedEntry: KanjiEntryInput = {
      id: entry.id.trim(),
      character: entry.character.trim(),
      meaning: entry.meaning.trim(),
      readingsKun: (entry.readingsKun || []).map((r) => r.trim()).filter(Boolean),
      readingsOn: (entry.readingsOn || []).map((r) => r.trim()).filter(Boolean),
      strokeCount: entry.strokeCount,
      jlptLevel: normalizedJLPT,
      gradeLevel: entry.gradeLevel ?? null,
      primaryRadicalId: entry.primaryRadicalId?.trim() || null,
      mnemonic: entry.mnemonic?.trim() || null,
      vocabulary: validVocabulary,
      sourceRef: entry.sourceRef || "first-party:kanji-corpus:v1",
    };

    kanjiMap.set(transformedEntry.id, transformedEntry);

    // Register embedded radicals if present
    if (entry.radicals) {
      for (const r of entry.radicals) {
        if (!radicalsMap.has(r.id)) {
          radicalsMap.set(r.id, {
            ...r,
            altForms: r.altForms ?? [],
            strokeCount: Math.max(1, r.strokeCount),
            readingOn: r.readingOn || null,
            kangxiNumber: r.kangxiNumber ?? null,
            mnemonic: r.mnemonic ?? null,
            sourceRef: r.sourceRef || "first-party:kanji-corpus:v1",
          });
        }
      }
    }

    // Process composition edges
    if (entry.composition) {
      for (const c of entry.composition) {
        if (!c.elementId) {
          throw new Error(`Composition missing elementId for kanji ${entry.character}`);
        }
        compositions.push({
          kanjiId: transformedEntry.id,
          elementId: c.elementId.trim(),
          role: c.role,
          position: c.position ?? null,
          renderedAs: c.renderedAs || c.rendering || transformedEntry.character,
          orderIndex: c.orderIndex,
          sourceRef: c.sourceRef || transformedEntry.sourceRef,
        });
      }
    }
  }

  return {
    radicals: Array.from(radicalsMap.values()),
    kanji: Array.from(kanjiMap.values()),
    compositions,
  };
}
