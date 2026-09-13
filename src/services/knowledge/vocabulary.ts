import "server-only";

import { findKanjiByLiteral, getVocabularyById, getVocabularyForKanji, searchVocabulary } from "@/repositories/knowledge";
import type { VocabularyEntry } from "@/types/knowledge";

export async function searchDictionary(query: string, limit = 24): Promise<VocabularyEntry[]> {
  return searchVocabulary(query, limit);
}

export async function getDictionaryEntry(id: number): Promise<VocabularyEntry | null> {
  return getVocabularyById(id);
}

/** Vocabulary that uses a given kanji literal (used by the kanji detail page). */
export async function getVocabularyByKanjiLiteral(literal: string, limit = 24) {
  const kanji = await findKanjiByLiteral(literal);
  if (!kanji) return null;
  const entries = await getVocabularyForKanji(kanji.id, limit);
  return { kanji, entries };
}
