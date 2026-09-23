import { extractKanjiCharacters, normalizeJlpt } from "../dictionary/types";
import { SentenceMatcher } from "./matcher";
import {
  TATOEBA_SOURCE_REF,
  type CanonicalExampleSentence,
  type RawSentenceSourceRecord,
} from "./types";

export interface SentenceValidationIssue {
  field: string;
  message: string;
  value?: unknown;
}

export interface SentenceTransformResult {
  record: CanonicalExampleSentence | null;
  isValid: boolean;
  errors: SentenceValidationIssue[];
}

/**
 * Normalizes text with Unicode NFKC and trims whitespace.
 */
function cleanText(text: string | undefined | null): string {
  if (!text) return "";
  return text.normalize("NFKC").trim();
}

/**
 * Transforms a raw sentence record into canonical ExampleSentence.
 */
export function transformSentenceEntry(
  raw: RawSentenceSourceRecord,
  sourceRef: string = TATOEBA_SOURCE_REF,
): SentenceTransformResult {
  const errors: SentenceValidationIssue[] = [];

  if (!raw.tatoebaId || typeof raw.tatoebaId !== "string" || !raw.tatoebaId.trim()) {
    errors.push({ field: "tatoebaId", message: "Missing or invalid tatoebaId" });
  }

  const japanese = cleanText(raw.japanese);
  if (!japanese) {
    errors.push({ field: "japanese", message: "Japanese sentence text is required" });
  }

  const english = cleanText(raw.english);
  if (!english) {
    errors.push({ field: "english", message: "English translation is required" });
  }

  const reading = cleanText(raw.reading) || japanese;

  const jlptLevel = normalizeJlpt(raw.jlptLevel);

  // Extract kanji characters
  const kanjiCharacters = extractKanjiCharacters(japanese);

  // Cross-entity linkage: Dictionary entries
  const autoMatchedVocab = SentenceMatcher.matchDictionaryEntries(japanese);
  const explicitVocab = raw.dictionaryEntryIds || [];
  const dictionaryEntryIds = [...new Set([...autoMatchedVocab, ...explicitVocab])];

  // Cross-entity linkage: Grammar pattern
  const grammarId =
    raw.grammarId !== undefined
      ? raw.grammarId
      : SentenceMatcher.matchGrammarPattern(japanese);

  const tags = raw.tags ? [...raw.tags] : [];
  if (jlptLevel && jlptLevel !== "NONE") {
    tags.push(`jlpt:${jlptLevel.toLowerCase()}`);
  }

  const id = `es-tat-${raw.tatoebaId.trim()}`;

  const canonical: CanonicalExampleSentence = {
    id,
    japanese,
    reading,
    english,
    jlptLevel,
    grammarId,
    dictionaryEntryIds,
    kanjiCharacters,
    tags: [...new Set(tags)],
    sourceRef,
  };

  return {
    record: errors.length === 0 ? canonical : null,
    isValid: errors.length === 0,
    errors,
  };
}
