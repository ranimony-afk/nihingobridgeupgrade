import {
  GRAMMAR_CORE_SOURCE_REF,
  normalizeJLPTLevel,
  type CanonicalGrammarPattern,
  type GrammarPatternInput,
} from "./types";

export interface GrammarValidationIssue {
  field: string;
  message: string;
  value?: unknown;
}

export interface GrammarTransformResult {
  record: CanonicalGrammarPattern | null;
  isValid: boolean;
  errors: GrammarValidationIssue[];
}

function cleanText(text: string | undefined | null): string {
  if (!text) return "";
  return text.normalize("NFKC").trim();
}

/**
 * Normalizes slug to lowercase alphanumeric kebab-case.
 */
export function normalizeSlug(slug: string): string {
  return cleanText(slug)
    .toLowerCase()
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Transforms and validates a grammar pattern input into canonical schema format.
 */
export function transformGrammarPattern(
  input: GrammarPatternInput,
  defaultSourceRef = GRAMMAR_CORE_SOURCE_REF,
): GrammarTransformResult {
  const errors: GrammarValidationIssue[] = [];

  const slug = normalizeSlug(input.slug);
  if (!slug) {
    errors.push({ field: "slug", message: "Slug is required and must contain alphanumeric characters" });
  }

  const title = cleanText(input.title);
  if (!title) {
    errors.push({ field: "title", message: "Title is required" });
  }

  const structure = cleanText(input.structure);
  if (!structure) {
    errors.push({ field: "structure", message: "Structure is required" });
  }

  const meaning = cleanText(input.meaning);
  if (!meaning) {
    errors.push({ field: "meaning", message: "Meaning is required" });
  }

  const explanation = cleanText(input.explanation);
  if (!explanation) {
    errors.push({ field: "explanation", message: "Explanation is required" });
  }

  let jlptLevel: any = "N5";
  try {
    jlptLevel = normalizeJLPTLevel(input.jlptLevel);
  } catch (err: any) {
    errors.push({ field: "jlptLevel", message: err.message, value: input.jlptLevel });
  }

  // Deterministic ID: gp-{slug}
  const id = input.id ? cleanText(input.id) : `gp-${slug}`;

  const formation = input.formation ? cleanText(input.formation) : null;
  const commonMistakes = (input.commonMistakes || [])
    .map(cleanText)
    .filter(Boolean);

  const tags = (input.tags || []).map(cleanText).filter(Boolean);
  if (jlptLevel) {
    tags.push(`jlpt:${jlptLevel.toLowerCase()}`);
  }

  const sourceRef = input.sourceRef ? cleanText(input.sourceRef) : defaultSourceRef;

  const canonical: CanonicalGrammarPattern = {
    id,
    slug,
    title,
    structure,
    meaning,
    explanation,
    formation,
    jlptLevel,
    commonMistakes,
    tags: [...new Set(tags)],
    sourceRef,
  };

  return {
    record: errors.length === 0 ? canonical : null,
    isValid: errors.length === 0,
    errors,
  };
}
