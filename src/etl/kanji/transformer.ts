import { normalizeJLPTLevel } from "@/etl/grammar/types";
import type {
  KanjiEntryInput,
  KanjiRadicalInput,
  KanjiCompositionInput,
} from "./types";

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
