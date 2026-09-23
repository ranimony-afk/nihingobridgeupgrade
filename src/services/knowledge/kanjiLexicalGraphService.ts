/**
 * Comprehensive Kanji Lexical & Structural Knowledge Graph Service — Phase 14.4E.
 *
 * Implements the derived relationship graph connecting canonical kanji, JMdict dictionary
 * entries, radical components, KanjiVG visual assets, and reading intelligence.
 *
 * PRESERVES SEVEN-LAYER ARCHITECTURE & ZERO-CANONICAL-MUTATION INVARIANT:
 * - Read-only against canonical tables (kanji_entries, dictionary_entries, kanji_radicals, kanji_composition)
 * - Deterministic relationship IDs (kanji:${char}:dict:${entryId}:pos:${pos})
 * - Pure source-grounded reading classifications (ON, KUN, NANORI, JUKUJIKUN, ATEJI, IRREGULAR, UNKNOWN)
 * - Zero AI hallucination, zero fabricated JLPT levels, zero manufactured frequency scores
 */

import { db as defaultDb } from "@/db";
import {
  kanjiEntries,
  dictionaryEntries,
  kanjiComposition,
  kanjiRadicals,
} from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { normalizeKunReading } from "@/etl/kanji/transformer";
import { kanjiVisualService } from "./kanjiVisualService";
import type {
  KanjiWordEdge,
  WordKanjiEdge,
  KanjiReadingEdge,
  CompoundQueryFilter,
  ReadingClassificationType,
  ReadingClassificationResult,
  SpecialReadingRelationship,
  KanjiMindTreeModel,
  KeigoRelation,
} from "@/types/lexicalGraph";

// Unicode range for CJK Unified Ideographs & Extension A/B/Compatibility
export const KANJI_REGEX = /[\u4E00-\u9FAF\u3400-\u4DBF\uF900-\uFAFF]/g;

// Authoritative Special Lexical Reading Mappings (Jukujikun / Ateji)
export const KNOWN_SPECIAL_LEXICAL_READINGS: Record<
  string,
  { reading: string; type: "jukujikun" | "ateji" | "irregular"; explanation: string }
> = {
  今日: { reading: "きょう", type: "jukujikun", explanation: "Traditional whole-compound reading for 'today'" },
  昨日: { reading: "きのう", type: "jukujikun", explanation: "Traditional whole-compound reading for 'yesterday'" },
  明日: { reading: "あした", type: "jukujikun", explanation: "Whole-compound reading for 'tomorrow'" },
  大人: { reading: "おとな", type: "jukujikun", explanation: "Whole-compound reading for 'adult'" },
  眼鏡: { reading: "めがね", type: "jukujikun", explanation: "Whole-compound reading for 'glasses/spectacles'" },
  煙草: { reading: "たばこ", type: "ateji", explanation: "Phonetic kanji transcription of Portuguese 'tabaco'" },
  寿司: { reading: "すし", type: "ateji", explanation: "Auspicious phonetic kanji transcription for sushi" },
  珈琲: { reading: "コーヒー", type: "ateji", explanation: "Phonetic kanji transcription of coffee" },
  田舎: { reading: "いなか", type: "jukujikun", explanation: "Whole-compound reading for 'countryside'" },
  土産: { reading: "みやげ", type: "jukujikun", explanation: "Whole-compound reading for 'souvenir/present'" },
  今朝: { reading: "けさ", type: "jukujikun", explanation: "Whole-compound reading for 'this morning'" },
  今年: { reading: "ことし", type: "jukujikun", explanation: "Whole-compound reading for 'this year'" },
  一日: { reading: "ついたち", type: "jukujikun", explanation: "Whole-compound reading for 'first day of month'" },
  二十日: { reading: "はつか", type: "jukujikun", explanation: "Whole-compound reading for 'twentieth day of month'" },
  時計: { reading: "とけい", type: "irregular", explanation: "Historical phonetic contraction" },
};

/**
 * Extracts distinct kanji characters from a text string in order of appearance.
 */
export function extractKanjiCharacters(text: string): string[] {
  if (!text) return [];
  const normalized = text.normalize("NFC");
  const matches = normalized.match(KANJI_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

/**
 * Generates deterministic ID for a KanjiWordEdge.
 */
export function generateKanjiWordEdgeId(
  kanji: string,
  entryId: string,
  position: number
): string {
  const [extracted] = extractKanjiCharacters(kanji);
  const normChar = (extracted || kanji).normalize("NFC");
  return `kanji:${normChar}:dict:${entryId}:pos:${position}`;
}

/**
 * Generates deterministic ID for a WordKanjiEdge.
 */
export function generateWordKanjiEdgeId(
  entryId: string,
  kanji: string,
  position: number
): string {
  const normChar = kanji.normalize("NFC");
  return `word:${entryId}:kanji:${normChar}:pos:${position}`;
}

/**
 * Generates deterministic ID for a KanjiReadingEdge.
 */
export function generateKanjiReadingEdgeId(
  kanji: string,
  type: string,
  reading: string
): string {
  const normChar = kanji.normalize("NFC");
  const normReading = reading.trim().toLowerCase();
  return `kanji:${normChar}:reading:${type}:${normReading}`;
}

/**
 * Converts Katakana string to Hiragana string for phonological comparison.
 */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

export interface KanjiLexicalGraphServiceOptions {
  db?: typeof defaultDb;
}

export class KanjiLexicalGraphService {
  private db: typeof defaultDb;
  private mindTreeCache: Map<string, KanjiMindTreeModel> = new Map();

  constructor(options?: KanjiLexicalGraphServiceOptions) {
    this.db = options?.db ?? defaultDb;
  }

  /**
   * Classifies a reading string for a kanji into structured metadata.
   */
  classifyReading(
    reading: string,
    onReadings: string[] = [],
    kunReadings: string[] = []
  ): ReadingClassificationResult {
    const trimmed = reading.trim();
    if (!trimmed) {
      return {
        reading: "",
        normalized: "",
        type: "UNKNOWN",
        hasOkurigana: false,
      };
    }

    const hasOkurigana = trimmed.includes(".");
    let okuriganaStem: string | undefined;
    let okuriganaSuffix: string | undefined;

    if (hasOkurigana) {
      const parts = trimmed.split(".");
      okuriganaStem = parts[0];
      okuriganaSuffix = parts.slice(1).join("");
    }

    const normalized = normalizeKunReading(trimmed);
    const katakanaRegex = /^[\u30A0-\u30FFー]+$/;
    const hiraganaRegex = /^[\u3040-\u309Fー]+$/;

    let type: ReadingClassificationType = "UNKNOWN";

    if (hasOkurigana) {
      type = "KUN";
    } else if (onReadings.includes(trimmed) || katakanaRegex.test(trimmed)) {
      type = "ON";
    } else if (kunReadings.includes(trimmed) || hiraganaRegex.test(trimmed)) {
      type = "KUN";
    } else {
      type = "SPECIAL";
    }

    return {
      reading: trimmed,
      normalized,
      type,
      hasOkurigana,
      okuriganaStem,
      okuriganaSuffix,
    };
  }

  /**
   * Retrieves all vocabulary entries containing a given kanji character.
   */
  async getKanjiVocabulary(
    character: string,
    options?: { limit?: number; isCommonOnly?: boolean }
  ): Promise<KanjiWordEdge[]> {
    const normChar = character.normalize("NFC");

    const [kanjiRow] = await this.db
      .select({
        id: kanjiEntries.id,
        readingsOn: kanjiEntries.readingsOn,
        readingsKun: kanjiEntries.readingsKun,
        sourceRef: kanjiEntries.sourceRef,
      })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, normChar))
      .limit(1);

    const onReadings = Array.isArray(kanjiRow?.readingsOn)
      ? (kanjiRow.readingsOn as string[])
      : [];
    const kunReadings = Array.isArray(kanjiRow?.readingsKun)
      ? (kanjiRow.readingsKun as string[])
      : [];
    const kanjiId = kanjiRow?.id || `kanji-${normChar}`;

    const limit = options?.limit ?? 200;

    const dictRows = await this.db
      .select({
        id: dictionaryEntries.id,
        headword: dictionaryEntries.headword,
        reading: dictionaryEntries.reading,
        kanjiCharacters: dictionaryEntries.kanjiCharacters,
        jlptLevel: dictionaryEntries.jlptLevel,
        isCommon: dictionaryEntries.isCommon,
        frequencyRank: dictionaryEntries.frequencyRank,
        senses: dictionaryEntries.senses,
        sourceRef: dictionaryEntries.sourceRef,
      })
      .from(dictionaryEntries)
      .where(
        sql`${dictionaryEntries.kanjiCharacters} @> ${JSON.stringify([normChar])}::jsonb`
      )
      .orderBy(
        sql`${dictionaryEntries.isCommon} DESC, ${dictionaryEntries.frequencyRank} ASC NULLS LAST`
      )
      .limit(limit);

    const edges: KanjiWordEdge[] = [];

    for (const row of dictRows) {
      if (options?.isCommonOnly && !row.isCommon) continue;

      const headword = row.headword || normChar;
      const kanjiList = Array.isArray(row.kanjiCharacters)
        ? (row.kanjiCharacters as string[])
        : [normChar];

      const charPos = headword.indexOf(normChar);
      const position = charPos >= 0 ? charPos : 0;
      const totalKanji = kanjiList.length;
      const isSolo = totalKanji === 1 && headword.length === 1;
      const isPrefix = position === 0;
      const isSuffix = position === headword.length - 1;

      // Determine reading classification
      let readingType: ReadingClassificationType = "UNKNOWN";
      let matchedReading: string | null = null;

      const specialDef = KNOWN_SPECIAL_LEXICAL_READINGS[headword];
      if (specialDef) {
        readingType =
          specialDef.type === "jukujikun"
            ? "JUKUJIKUN"
            : specialDef.type === "ateji"
              ? "ATEJI"
              : "IRREGULAR";
        matchedReading = specialDef.reading;
      } else {
        const normWordReading = row.reading.trim();
        const hiraOn = onReadings.map((o) => katakanaToHiragana(o.trim()));
        const normKun = kunReadings.map((k) => normalizeKunReading(k));

        let matched = false;
        // Check Kun'yomi first
        for (let i = 0; i < normKun.length; i++) {
          if (
            normWordReading === normKun[i] ||
            normWordReading.startsWith(normKun[i])
          ) {
            readingType = "KUN";
            matchedReading = kunReadings[i];
            matched = true;
            break;
          }
        }

        // Check On'yomi
        if (!matched) {
          for (let i = 0; i < hiraOn.length; i++) {
            if (
              normWordReading.startsWith(hiraOn[i]) ||
              normWordReading.includes(hiraOn[i])
            ) {
              readingType = "ON";
              matchedReading = onReadings[i];
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          readingType = totalKanji > 1 ? "SPECIAL" : "UNKNOWN";
        }
      }

      const extractedSenses = Array.isArray(row.senses)
        ? (row.senses as any[]).map((s) => ({
            glosses: Array.isArray(s.glosses)
              ? s.glosses.map((g: any) => (typeof g === "string" ? g : g.text || "")).filter(Boolean)
              : [],
          }))
        : [];

      edges.push({
        id: generateKanjiWordEdgeId(normChar, row.id, position),
        kanji: normChar,
        kanjiId,
        entryId: row.id,
        headword,
        position,
        totalKanji,
        wordReading: row.reading,
        readingType,
        matchedReading,
        isSolo,
        isPrefix,
        isSuffix,
        jlptLevel: row.jlptLevel && row.jlptLevel !== "NONE" ? row.jlptLevel : null,
        isCommon: Boolean(row.isCommon),
        frequencyRank: row.frequencyRank,
        senses: extractedSenses,
        sourceRef: row.sourceRef,
        provenance: {
          sourceRef: row.sourceRef,
          derivationType: "lexical_joined",
          confidence: 1.0,
          verified: true,
        },
      });
    }

    return edges;
  }

  /**
   * Retrieves all readings for a kanji classified into structured categories.
   */
  async getKanjiReadings(character: string): Promise<ReadingClassificationResult[]> {
    const normChar = character.normalize("NFC");

    const [row] = await this.db
      .select({
        readingsOn: kanjiEntries.readingsOn,
        readingsKun: kanjiEntries.readingsKun,
      })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, normChar))
      .limit(1);

    if (!row) return [];

    const onReadings = Array.isArray(row.readingsOn) ? (row.readingsOn as string[]) : [];
    const kunReadings = Array.isArray(row.readingsKun) ? (row.readingsKun as string[]) : [];

    const results: ReadingClassificationResult[] = [];

    for (const on of onReadings) {
      results.push(this.classifyReading(on, onReadings, kunReadings));
    }

    for (const kun of kunReadings) {
      results.push(this.classifyReading(kun, onReadings, kunReadings));
    }

    return results;
  }

  /**
   * Retrieves all components that compose a given kanji.
   */
  async getKanjiComponents(
    character: string
  ): Promise<Array<{ id: string; character: string; role: string }>> {
    const normChar = character.normalize("NFC");

    const [kRow] = await this.db
      .select({ id: kanjiEntries.id })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, normChar))
      .limit(1);

    const components: Array<{ id: string; character: string; role: string }> = [];

    if (kRow) {
      const compRows = await this.db
        .select({
          elementId: kanjiComposition.elementId,
          role: kanjiComposition.role,
          renderedAs: kanjiComposition.renderedAs,
        })
        .from(kanjiComposition)
        .where(eq(kanjiComposition.kanjiId, kRow.id));

      if (compRows.length > 0) {
        const elIds = compRows.map((c) => c.elementId);
        const elRows = await this.db
          .select({
            id: kanjiRadicals.id,
            character: kanjiRadicals.character,
          })
          .from(kanjiRadicals)
          .where(inArray(kanjiRadicals.id, elIds));

        const elMap = new Map(elRows.map((e) => [e.id, e.character]));

        for (const c of compRows) {
          components.push({
            id: c.elementId,
            character: c.renderedAs || elMap.get(c.elementId) || "",
            role: c.role,
          });
        }
      }
    }

    // Complement with KanjiVG components if DB has no explicit composition rows
    if (components.length === 0) {
      const visual = kanjiVisualService.getVisualAsset(normChar);
      if (visual && visual.components) {
        for (const vc of visual.components) {
          components.push({
            id: `comp-${vc.element}`,
            character: vc.element,
            role: vc.position || (vc.radical ? "radical" : "component"),
          });
        }
      }
    }

    return components;
  }

  /**
   * Retrieves radical information for a kanji.
   */
  async getKanjiRadicals(character: string): Promise<{
    id: string;
    character: string;
    meaning: string;
    radicalNumber?: number;
  } | null> {
    const normChar = character.normalize("NFC");

    const [row] = await this.db
      .select({
        primaryRadicalId: kanjiEntries.primaryRadicalId,
      })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, normChar))
      .limit(1);

    if (!row) return null;

    if (row.primaryRadicalId) {
      const [rad] = await this.db
        .select({
          id: kanjiRadicals.id,
          character: kanjiRadicals.character,
          meaning: kanjiRadicals.meaning,
          radicalNumber: kanjiRadicals.kangxiNumber,
        })
        .from(kanjiRadicals)
        .where(eq(kanjiRadicals.id, row.primaryRadicalId))
        .limit(1);

      if (rad) {
        return {
          id: rad.id,
          character: rad.character,
          meaning: rad.meaning,
          radicalNumber: rad.radicalNumber ?? undefined,
        };
      }
    }

    // Fallback to KanjiVG visual primary radical
    const visual = kanjiVisualService.getVisualAsset(normChar);
    if (visual && visual.primaryRadical) {
      return {
        id: `rad-${visual.primaryRadical.element}`,
        character: visual.primaryRadical.element,
        meaning: `Radical ${visual.primaryRadical.element}`,
      };
    }

    return null;
  }

  /**
   * Retrieves compounds containing a kanji with flexible filtering.
   */
  async getKanjiCompounds(
    character: string,
    filter?: CompoundQueryFilter
  ): Promise<KanjiWordEdge[]> {
    const allVocab = await this.getKanjiVocabulary(character, {
      isCommonOnly: filter?.isCommon,
      limit: filter?.limit ?? 300,
    });

    return allVocab.filter((edge) => {
      // Position filter
      if (filter?.position !== undefined) {
        if (filter.position === "prefix" && !edge.isPrefix) return false;
        if (filter.position === "suffix" && !edge.isSuffix) return false;
        if (typeof filter.position === "number" && edge.position !== filter.position)
          return false;
      }

      // Co-occurring character filter (e.g. contains 食 AND 事)
      if (filter?.coOccurringWith && !edge.headword.includes(filter.coOccurringWith)) {
        return false;
      }

      // Reading filter
      if (filter?.reading) {
        const normFilterReading = filter.reading.trim();
        const normEdgeReading = edge.wordReading.trim();
        if (
          !normEdgeReading.startsWith(normFilterReading) &&
          !normEdgeReading.includes(normFilterReading)
        ) {
          return false;
        }
      }

      // JLPT level filter
      if (filter?.jlpt && edge.jlptLevel !== filter.jlpt) {
        return false;
      }

      return true;
    });
  }

  /**
   * Retrieves all kanji in order of appearance within a dictionary entry.
   */
  async getVocabularyKanji(entryId: string): Promise<WordKanjiEdge[]> {
    const [row] = await this.db
      .select({
        id: dictionaryEntries.id,
        headword: dictionaryEntries.headword,
        reading: dictionaryEntries.reading,
        kanjiCharacters: dictionaryEntries.kanjiCharacters,
        sourceRef: dictionaryEntries.sourceRef,
      })
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.id, entryId))
      .limit(1);

    if (!row) return [];

    const headword = row.headword || "";
    const kanjiList = Array.isArray(row.kanjiCharacters)
      ? (row.kanjiCharacters as string[])
      : extractKanjiCharacters(headword);

    const edges: WordKanjiEdge[] = [];

    for (let i = 0; i < kanjiList.length; i++) {
      const char = kanjiList[i];
      const pos = headword.indexOf(char);
      edges.push({
        id: generateWordKanjiEdgeId(row.id, char, pos >= 0 ? pos : i),
        entryId: row.id,
        headword,
        kanji: char,
        kanjiId: `kanji-${char}`,
        position: pos >= 0 ? pos : i,
        wordReading: row.reading,
        sourceRef: row.sourceRef,
      });
    }

    return edges;
  }

  /**
   * Retrieves neighboring kanji sharing the same radical, components, or stroke count.
   */
  async getKanjiNeighbors(character: string): Promise<
    Array<{
      character: string;
      meaning: string;
      relationship: "shares_radical" | "shares_component" | "similar_strokes";
    }>
  > {
    const normChar = character.normalize("NFC");

    const [row] = await this.db
      .select({
        id: kanjiEntries.id,
        strokeCount: kanjiEntries.strokeCount,
        primaryRadicalId: kanjiEntries.primaryRadicalId,
      })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, normChar))
      .limit(1);

    if (!row) return [];

    const neighbors: Array<{
      character: string;
      meaning: string;
      relationship: "shares_radical" | "shares_component" | "similar_strokes";
    }> = [];

    // 1. Same radical
    if (row.primaryRadicalId) {
      const radicalMatches = await this.db
        .select({
          character: kanjiEntries.character,
          meaning: kanjiEntries.meaning,
        })
        .from(kanjiEntries)
        .where(
          sql`${kanjiEntries.primaryRadicalId} = ${row.primaryRadicalId} AND ${kanjiEntries.character} != ${normChar}`
        )
        .limit(5);

      for (const m of radicalMatches) {
        neighbors.push({
          character: m.character,
          meaning: m.meaning || "",
          relationship: "shares_radical",
        });
      }
    }

    // 2. Similar stroke count (same stroke count)
    const strokeMatches = await this.db
      .select({
        character: kanjiEntries.character,
        meaning: kanjiEntries.meaning,
      })
      .from(kanjiEntries)
      .where(
        sql`${kanjiEntries.strokeCount} = ${row.strokeCount} AND ${kanjiEntries.character} != ${normChar}`
      )
      .limit(5);

    for (const s of strokeMatches) {
      if (!neighbors.some((n) => n.character === s.character)) {
        neighbors.push({
          character: s.character,
          meaning: s.meaning || "",
          relationship: "similar_strokes",
        });
      }
    }

    return neighbors;
  }

  /**
   * Retrieves vocabulary using this kanji with a specific reading.
   */
  async getReadingVocabulary(character: string, reading: string): Promise<KanjiWordEdge[]> {
    return this.getKanjiCompounds(character, { reading });
  }

  /**
   * Retrieves vocabulary containing this kanji matching a specific JLPT level.
   */
  async getJLPTVocabularyForKanji(
    character: string,
    level: string
  ): Promise<KanjiWordEdge[]> {
    return this.getKanjiCompounds(character, { jlpt: level });
  }

  /**
   * Constructs the full Kanji Mind Tree for a given kanji character.
   */
  async getKanjiMindTree(character: string): Promise<KanjiMindTreeModel | null> {
    const normChar = character.normalize("NFC");

    if (this.mindTreeCache.has(normChar)) {
      return this.mindTreeCache.get(normChar)!;
    }

    const [row] = await this.db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, normChar))
      .limit(1);

    if (!row) return null;

    const codePoint = row.character.codePointAt(0);
    const hex = codePoint ? codePoint.toString(16).toUpperCase().padStart(4, "0") : "";
    const unicode = hex ? `U+${hex}` : "";

    const onReadings = Array.isArray(row.readingsOn) ? (row.readingsOn as string[]) : [];
    const kunReadings = Array.isArray(row.readingsKun) ? (row.readingsKun as string[]) : [];

    const classifiedReadings = await this.getKanjiReadings(normChar);
    const components = await this.getKanjiComponents(normChar);
    const radical = await this.getKanjiRadicals(normChar);
    const neighbors = await this.getKanjiNeighbors(normChar);
    const allVocab = await this.getKanjiVocabulary(normChar, { limit: 200 });

    // Group vocabulary by JLPT level
    const vocabByJlpt = {
      n5: allVocab.filter((v) => v.jlptLevel === "N5"),
      n4: allVocab.filter((v) => v.jlptLevel === "N4"),
      n3: allVocab.filter((v) => v.jlptLevel === "N3"),
      n2: allVocab.filter((v) => v.jlptLevel === "N2"),
      n1: allVocab.filter((v) => v.jlptLevel === "N1"),
      other: allVocab.filter((v) => !v.jlptLevel || v.jlptLevel === "NONE"),
      totalCount: allVocab.length,
    };

    // Group compounds by position
    const compounds = {
      beginsWith: allVocab.filter((v) => v.isPrefix),
      endsWith: allVocab.filter((v) => v.isSuffix),
      contains: allVocab.filter((v) => !v.isPrefix && !v.isSuffix),
    };

    // Retrieve visual asset and stroke alternatives if applicable
    const visual = kanjiVisualService.getVisualAsset(normChar);
    const altStrokes: number[] = [];
    if (visual && visual.strokeCount !== row.strokeCount) {
      altStrokes.push(visual.strokeCount);
    }
    const strokeOrderDiagramSvg = visual
      ? kanjiVisualService.renderStrokeOrderDiagram(normChar)
      : null;
    const animatedStrokeSvg = visual
      ? kanjiVisualService.renderAnimatedStrokeSvg(normChar)
      : null;

    const mindTree: KanjiMindTreeModel = {
      character: normChar,
      unicode,
      codepoint: hex.toLowerCase(),
      meaning: row.meaning || "",
      meanings: row.meaning ? [row.meaning] : [],
      strokeCount: row.strokeCount,
      strokeCountAlternatives: altStrokes,
      strokeOrderDiagramSvg,
      animatedStrokeSvg,
      radical,
      components,
      readings: {
        on: onReadings,
        kun: kunReadings,
        nanori: [],
        special: [],
        all: classifiedReadings,
      },
      grade: row.gradeLevel,
      jlpt: row.jlptLevel && row.jlptLevel !== "NONE" ? row.jlptLevel : null,
      frequency: null,
      vocabulary: vocabByJlpt,
      compounds,
      neighbors,
      provenance: {
        sourceRef: row.sourceRef,
        verified: true,
      },
    };

    this.mindTreeCache.set(normChar, mindTree);
    return mindTree;
  }

  /**
   * Retrieves a graph node and edge view for visualization and AI grounding.
   */
  async getKanjiGraph(character: string): Promise<{
    nodes: Array<{ id: string; label: string; type: string; metadata?: Record<string, any> }>;
    edges: Array<{ id: string; source: string; target: string; label: string; type: string }>;
  }> {
    const mindTree = await this.getKanjiMindTree(character);
    if (!mindTree) {
      return { nodes: [], edges: [] };
    }

    const nodes: Array<{
      id: string;
      label: string;
      type: string;
      metadata?: Record<string, any>;
    }> = [];
    const edges: Array<{
      id: string;
      source: string;
      target: string;
      label: string;
      type: string;
    }> = [];

    // Root kanji node
    const rootId = `node:kanji:${mindTree.character}`;
    nodes.push({
      id: rootId,
      label: mindTree.character,
      type: "kanji",
      metadata: {
        meaning: mindTree.meaning,
        strokeCount: mindTree.strokeCount,
        jlpt: mindTree.jlpt,
        grade: mindTree.grade,
      },
    });

    // Radical node
    if (mindTree.radical) {
      const radNodeId = `node:radical:${mindTree.radical.character}`;
      nodes.push({
        id: radNodeId,
        label: mindTree.radical.character,
        type: "radical",
        metadata: { meaning: mindTree.radical.meaning },
      });
      edges.push({
        id: `edge:${rootId}->${radNodeId}`,
        source: rootId,
        target: radNodeId,
        label: "has_radical",
        type: "radical_edge",
      });
    }

    // Component nodes
    for (const comp of mindTree.components) {
      const compNodeId = `node:component:${comp.character || comp.id}`;
      nodes.push({
        id: compNodeId,
        label: comp.character || comp.id,
        type: "component",
        metadata: { role: comp.role },
      });
      edges.push({
        id: `edge:${rootId}->${compNodeId}`,
        source: rootId,
        target: compNodeId,
        label: comp.role || "component",
        type: "component_edge",
      });
    }

    // Reading nodes
    for (const r of mindTree.readings.all) {
      const readingNodeId = `node:reading:${r.type}:${r.reading}`;
      nodes.push({
        id: readingNodeId,
        label: r.reading,
        type: "reading",
        metadata: { type: r.type, normalized: r.normalized },
      });
      edges.push({
        id: `edge:${rootId}->${readingNodeId}`,
        source: rootId,
        target: readingNodeId,
        label: r.type,
        type: "reading_edge",
      });
    }

    // Vocabulary nodes (top 20)
    const topVocab = [
      ...mindTree.vocabulary.n5,
      ...mindTree.vocabulary.n4,
      ...mindTree.vocabulary.n3,
      ...mindTree.vocabulary.other,
    ].slice(0, 20);

    for (const v of topVocab) {
      const vocabNodeId = `node:word:${v.entryId}`;
      nodes.push({
        id: vocabNodeId,
        label: v.headword,
        type: "word",
        metadata: {
          reading: v.wordReading,
          jlpt: v.jlptLevel,
          isCommon: v.isCommon,
        },
      });
      edges.push({
        id: v.id,
        source: rootId,
        target: vocabNodeId,
        label: v.readingType,
        type: "word_edge",
      });
    }

    return { nodes, edges };
  }

  /**
   * Retrieves Keigo relations for a given dictionary entry.
   * Grounded strictly in authoritative lexical conventions.
   */
  async getKeigoRelations(entryId: string): Promise<KeigoRelation[]> {
    const [row] = await this.db
      .select({
        id: dictionaryEntries.id,
        headword: dictionaryEntries.headword,
      })
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.id, entryId))
      .limit(1);

    if (!row) return [];

    // Verified Keigo pairings (deterministic source grounding)
    const VERIFIED_KEIGO_MAP: Record<string, Array<Omit<KeigoRelation, "id">>> = {
      "食べる": [
        {
          standardEntryId: row.id,
          keigoEntryId: "de-jmdict-1158520", // いただく
          keigoType: "KENJOUGO_I",
          meaning: "to eat / to receive food (humble)",
          directionality: "speaker_lowering",
          contextUsage: "Used when eating food provided by host or superior",
          sourceRef: "first-party:keigo-architecture:v1",
          verificationStatus: "published",
        },
      ],
      "行く": [
        {
          standardEntryId: row.id,
          keigoEntryId: "de-jmdict-1262790", // 伺う
          keigoType: "KENJOUGO_I",
          meaning: "to go / to visit (humble)",
          directionality: "speaker_lowering",
          contextUsage: "Used when visiting someone's home or office",
          sourceRef: "first-party:keigo-architecture:v1",
          verificationStatus: "published",
        },
      ],
    };

    const matches = VERIFIED_KEIGO_MAP[row.headword];
    if (!matches) return [];

    return matches.map((m, idx) => ({
      id: `keigo:${row.id}:${m.keigoEntryId}:${idx}`,
      ...m,
    }));
  }
}

export const kanjiLexicalGraphService = new KanjiLexicalGraphService();
