import "server-only";

import {
  countVocabularyForKanji,
  findKanjiByLiteral,
  findKanjiRowByLiteral,
  getComponentsForKanji,
  getKanjiReadings,
  getKanjiUsingComponentLiteral,
  getRadicalsForKanji,
  getVocabularyForKanji,
  listKanji,
  searchKanji as searchKanjiRepo,
} from "@/repositories/knowledge";
import type { KanjiDetail, KanjiSummary, SearchResponse } from "@/types/knowledge";

/**
 * Knowledge service for the kanji domain.
 *
 * Everything returned here is assembled from the canonical PostgreSQL graph:
 *   kanji -> kanji_radicals -> radicals
 *   kanji -> kanji_components -> components
 *   kanji -> kanji_vocabulary -> vocabulary
 */
export async function getKanjiDetail(literal: string): Promise<KanjiDetail | null> {
  const summary = await findKanjiRowByLiteral(literal);
  if (!summary) return null;

  const [readings, radicals, components, usedIn, vocabularyCount] = await Promise.all([
    getKanjiReadings(summary.id),
    getRadicalsForKanji(summary.id),
    getComponentsForKanji(summary.id),
    getKanjiUsingComponentLiteral(literal, 24),
    countVocabularyForKanji(summary.id),
  ]);

  const nanori = readings
    .filter((reading) => reading.readingType === "nanori")
    .map((reading) => reading.reading);

  return {
    ...summary,
    codepoint: summary.codepoint,
    jlptLegacyLevel: summary.jlptLegacyLevel,
    heisigIndex: summary.heisigIndex,
    skipCode: summary.skipCode,
    nanori,
    radicals,
    components,
    usedIn: usedIn.filter((kanji) => kanji.literal !== literal),
    vocabularyCount,
  };
}

export async function getKanjiVocabulary(literal: string, limit = 24) {
  const summary = await findKanjiByLiteral(literal);
  if (!summary) return null;
  const entries = await getVocabularyForKanji(summary.id, limit);
  return { kanji: summary, entries };
}

export async function searchKanji(query: string, limit = 24): Promise<SearchResponse> {
  const started = Date.now();
  let results: Awaited<ReturnType<typeof searchKanjiRepo>> = [];
  try {
    results = await searchKanjiRepo(query, limit);
  } catch {
    // Un-provisioned schema: degrade to an empty result set instead of a 500.
    results = [];
  }
  return {
    query,
    total: results.length,
    results,
    tookMs: Date.now() - started,
  };
}

export async function browseKanji(options: {
  jlptLevel?: number;
  limit?: number;
  offset?: number;
}): Promise<KanjiSummary[]> {
  try {
    return await listKanji(options);
  } catch {
    return [];
  }
}
