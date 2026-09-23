export const SUPPORTED_LANGUAGES = ["en", "ta", "ml"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const SUPPORTED_ENTITY_TYPES = [
  "dictionary",
  "kanji",
  "grammar",
  "sentence",
  "radical",
  "jlpt",
] as const;
export type SupportedEntityType = (typeof SUPPORTED_ENTITY_TYPES)[number];

export const SUPPORTED_SOURCE_TYPES = [
  "canonical",
  "verified_human",
  "machine",
] as const;
export type SupportedSourceType = (typeof SUPPORTED_SOURCE_TYPES)[number];

export interface EntityTranslation {
  id: string;
  entityType: SupportedEntityType;
  entityId: string;
  language: SupportedLanguage;
  translatedText: string;
  secondaryText?: string | null;
  contextNotes?: string | null;
  sourceType: SupportedSourceType;
  sourceRef?: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTranslationInput {
  entityType: SupportedEntityType;
  entityId: string;
  language: SupportedLanguage;
  translatedText: string;
  secondaryText?: string | null;
  contextNotes?: string | null;
  sourceType: SupportedSourceType;
  sourceRef?: string | null;
  isVerified?: boolean;
}

export interface ReverseLookupResult {
  entityType: SupportedEntityType;
  entityId: string;
  language: SupportedLanguage;
  translatedText: string;
  matchedText: string;
  isVerified: boolean;
  canonical: {
    displayText: string;
    reading?: string | null;
    romaji?: string | null;
    jlptLevel?: string | null;
    canonicalEnglish?: string | null;
  } | null;
}
