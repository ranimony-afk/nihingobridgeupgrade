export type ImportedLexeme = {
  externalId: string;
  spellings: Array<{ spelling: string; priority: number; isPrimary: boolean; information: string[] }>;
  readings: Array<{
    reading: string;
    romaji?: string;
    noKanji: boolean;
    isPrimary: boolean;
    information: string[];
    furigana?: Array<{ ruby: string; rt: string }>;
    pitchAccents?: Array<{ pattern: number; morae: string[]; source?: string }>;
  }>;
  senses: Array<{
    position: number;
    partOfSpeech: string[];
    fields: string[];
    dialects: string[];
    misc: string[];
    appliesToSpellings: string[];
    appliesToReadings: string[];
    glosses: Array<{ language: string; gloss: string; type?: string; gender?: string; position: number }>;
  }>;
  common?: boolean;
  jlptLevel?: string;
  frequencyRank?: number;
};

export type ImportedKanji = {
  externalId: string;
  literal: string;
  radical?: string;
  grade?: number;
  strokeCount?: number;
  frequencyRank?: number;
  jlptLevel?: string;
  joyo?: boolean;
  jinmeiyo?: boolean;
  readings: Array<{ reading: string; kind: string; status?: string }>;
  meanings: Array<{ language: string; meaning: string; position: number }>;
  components: Array<{ componentLiteral: string; componentType: string; position: number }>;
};

export type ImportedName = {
  externalId: string;
  kanji?: string;
  reading: string;
  nameTypes: string[];
  translations: Array<{ language: string; text: string }>;
};

export type ImportedSentence = {
  externalId: string;
  language: string;
  text: string;
  reading?: string;
  romaji?: string;
  jlptLevel?: string;
  difficulty?: number;
  audioUrl?: string;
  license?: string;
};

export type ImportedSentenceTranslation = {
  sentenceExternalId: string;
  externalId?: string;
  language: string;
  text: string;
};

export type ImportedSentenceToken = {
  sentenceExternalId: string;
  position: number;
  surface: string;
  lemma?: string;
  reading?: string;
  pronunciation?: string;
  partOfSpeech?: string;
  inflectionType?: string;
  inflectionForm?: string;
  startOffset?: number;
  endOffset?: number;
  features: Record<string, string>;
};

export type ImportedGrammarPoint = {
  externalId: string;
  pattern: string;
  title: string;
  explanation: string;
  jlptLevel?: string;
  formation?: string;
  examples: Array<{ japanese: string; english?: string; explanation?: string; position: number }>;
};

export type ImportedIdiom = {
  externalId: string;
  expression: string;
  reading?: string;
  meaning: string;
  register?: string;
  jlptLevel?: string;
};

export type ImportedCollocation = {
  externalId: string;
  headword: string;
  collocate: string;
  relation?: string;
  frequency?: number;
  example?: string;
};

export type ImportedAudio = {
  externalId: string;
  entityType: string;
  entityExternalId: string;
  url: string;
  mimeType?: string;
  durationMilliseconds?: number;
  speaker?: string;
  license: string;
  attribution: string;
  checksum?: string;
};

export type ImportedKanjiStroke = {
  literal: string;
  strokeNumber: number;
  svgPath: string;
  element?: string;
  sourceFile: string;
};

export type ImportRecord =
  | { kind: "lexeme"; value: ImportedLexeme }
  | { kind: "kanji"; value: ImportedKanji }
  | { kind: "name"; value: ImportedName }
  | { kind: "sentence"; value: ImportedSentence }
  | { kind: "sentence_translation"; value: ImportedSentenceTranslation }
  | { kind: "sentence_token"; value: ImportedSentenceToken }
  | { kind: "grammar"; value: ImportedGrammarPoint }
  | { kind: "idiom"; value: ImportedIdiom }
  | { kind: "collocation"; value: ImportedCollocation }
  | { kind: "audio"; value: ImportedAudio }
  | { kind: "kanji_stroke"; value: ImportedKanjiStroke }
  | { kind: "frequency"; value: { spelling: string; frequencyRank: number; jlptLevel?: string } }
  | { kind: "furigana"; value: { lexemeExternalId: string; reading: string; furigana: Array<{ ruby: string; rt: string }> } }
  | { kind: "pitch"; value: { lexemeExternalId: string; reading: string; pitchAccents: Array<{ pattern: number; morae: string[]; source?: string }> } };
