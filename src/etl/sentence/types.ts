export const TATOEBA_SOURCE_REF = "tatoeba:corpus:2024-07";

export const TATOEBA_KNOWLEDGE_SOURCE = {
  id: TATOEBA_SOURCE_REF,
  name: "Tatoeba Multilingual Example Sentences",
  version: "2024-07",
  license: "CC-BY-2.0-FR",
  url: "https://tatoeba.org",
  description:
    "Open collection of collaborative example sentences and translations for language learners.",
  domain: "sentence" as const,
};

export interface RawSentenceSourceRecord {
  tatoebaId: string;
  japanese: string;
  reading?: string;
  english: string;
  jlptLevel?: string;
  grammarId?: string | null;
  dictionaryEntryIds?: string[];
  tags?: string[];
  license?: string;
}

export interface CanonicalExampleSentence {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  jlptLevel: string;
  grammarId: string | null;
  dictionaryEntryIds: string[];
  kanjiCharacters: string[];
  tags: string[];
  sourceRef: string;
}
