/**
 * JLPT question authoring — transport-independent draft validation.
 *
 * This module is deliberately pure: no I/O, no database, no request access,
 * no environment reads, and — critically — no notion of *who* is calling.
 * It answers exactly one question:
 *
 *   "Is this payload a structurally valid question draft?"
 *
 * Authorization is NOT decided here and MUST NOT be inferred from anything
 * in the payload (no `role`, `userId`, `authorId`, `isActive`, or similar
 * field is read). The caller (`./questionAuthoring.ts`) proves server-side
 * identity and permission BEFORE this module is ever reached.
 *
 * Everything accepted here is rebuilt by explicit whitelist projection:
 * unknown keys in the body, in each option, and inside the JSONB blobs are
 * dropped rather than persisted, so a client cannot smuggle extra
 * structured data into a jsonb column.
 */

import type {
  ExplanationBreakdown,
  GrammarPointBreakdown,
  JLPTLevel,
  QuestionCategory,
  QuestionOption,
  QuestionSection,
  QuestionType,
  StarOrderParts,
  VocabNote,
} from "@/types/quiz";

/* ------------------------------------------------------------------ *
 * Closed vocabularies (compiler-checked against the declared types)
 * ------------------------------------------------------------------ */

export const JLPT_LEVELS: readonly JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

export const QUESTION_SECTIONS: readonly QuestionSection[] = [
  "vocab",
  "grammar",
  "reading",
  "listening",
  "language_knowledge_reading",
];

export const QUESTION_CATEGORIES: readonly QuestionCategory[] = [
  "kanji_reading",
  "orthography",
  "contextual_use",
  "paraphrase",
  "usage",
  "grammar_form",
  "sentence_order",
  "text_grammar",
  "reading_short",
  "reading_mid",
  "reading_info",
  "listening_task",
  "listening_point",
  "listening_utterance",
  "listening_quick",
];

export const QUESTION_TYPES: readonly QuestionType[] = [
  "multiple_choice",
  "star_order",
  "reading_passage",
  "listening_comprehension",
  "fill_in_blank",
];

/* ------------------------------------------------------------------ *
 * Bounds — generous, but every field is bounded
 * ------------------------------------------------------------------ */

export const MAX_REQUEST_BODY_BYTES = 64 * 1024;
export const MAX_QUESTION_ID_LENGTH = 64;
export const MAX_OPTION_ID_LENGTH = 32;
export const MAX_OPTION_TEXT_LENGTH = 1000;
export const MAX_MONDAI_TITLE_LENGTH = 500;
export const MAX_PROMPT_LENGTH = 4000;
export const MAX_EXPLANATION_LENGTH = 8000;
export const MAX_PASSAGE_LENGTH = 8000;
export const MAX_AUDIO_SCRIPT_LENGTH = 8000;
export const MAX_AUDIO_URL_LENGTH = 2048;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 64;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;
export const MIN_MONDAI_NUMBER = 1;
export const MAX_MONDAI_NUMBER = 20;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 5;

/** Ids are opaque to clients but must stay bounded and injectable-free. */
const QUESTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type QuestionAuthoringErrorCode =
  | "VALIDATION_ERROR"
  | "QUESTION_ID_CONFLICT";

/**
 * Transport-mappable failure with HTTP semantics.
 *
 * Messages are intentionally caller-safe: they describe the *input* that
 * was rejected and never contain SQL, constraint names, driver text, stack
 * traces, or server state. Authorization failures are NOT represented here
 * — `AuthorizationError` (401/403) from `@/lib/auth` is the only source of
 * those, so this type can never be used to fabricate a permission decision.
 */
export class QuestionAuthoringError extends Error {
  readonly status: 400 | 409;
  readonly code: QuestionAuthoringErrorCode;
  /** Optional client-safe pointer to the offending field. */
  readonly field?: string;

  constructor(
    status: 400 | 409,
    code: QuestionAuthoringErrorCode,
    message: string,
    field?: string
  ) {
    super(message);
    this.name = "QuestionAuthoringError";
    this.status = status;
    this.code = code;
    if (field !== undefined) this.field = field;
  }

  static validation(message: string, field?: string): QuestionAuthoringError {
    return new QuestionAuthoringError(400, "VALIDATION_ERROR", message, field);
  }

  static idConflict(): QuestionAuthoringError {
    return new QuestionAuthoringError(
      409,
      "QUESTION_ID_CONFLICT",
      "A question with this id already exists.",
      "id"
    );
  }
}

/* ------------------------------------------------------------------ *
 * Validated row shape consumed by the persistence port
 * ------------------------------------------------------------------ */

/**
 * The exact column set an authorized create may write. `isActive`,
 * `createdAt`, and `updatedAt` are absent on purpose: they are
 * server-authoritative (the adapter sets `isActive: true` and the database
 * sets the timestamps), so no client value can reach them.
 */
export interface NewQuestionRow {
  readonly id: string;
  readonly jlptLevel: JLPTLevel;
  readonly section: QuestionSection;
  readonly category: QuestionCategory;
  readonly mondaiNumber: number;
  readonly mondaiTitle: string;
  readonly questionType: QuestionType;
  readonly prompt: string;
  readonly promptFurigana: string | null;
  readonly promptTranslation: string;
  readonly passage: string | null;
  readonly passageFurigana: string | null;
  readonly passageTranslation: string | null;
  readonly audioScript: string | null;
  readonly audioUrl: string | null;
  readonly options: QuestionOption[];
  readonly starOrderParts: StarOrderParts | null;
  readonly correctAnswer: string;
  readonly explanation: string;
  readonly explanationBreakdown: ExplanationBreakdown | null;
  readonly difficulty: number;
  readonly tags: string[];
}

/* ------------------------------------------------------------------ *
 * Primitive guards
 * ------------------------------------------------------------------ */

function fail(message: string, field?: string): never {
  throw QuestionAuthoringError.validation(message, field);
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${field} must be an object.`, field);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  field: string,
  maxLength: number
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${field} is required and must be a non-empty string.`, field);
  }
  if (value.length > maxLength) {
    fail(`${field} must be at most ${maxLength} characters.`, field);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  field: string,
  maxLength: number
): string | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    fail(`${field} must be a string.`, field);
  }
  if (value.length > maxLength) {
    fail(`${field} must be at most ${maxLength} characters.`, field);
  }
  // An explicitly empty optional field is stored as NULL, never as "".
  return value.length === 0 ? null : value;
}

function optionalEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  field: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = record[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(`${field} must be one of: ${allowed.join(", ")}.`, field);
  }
  return value as T;
}

function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  field: string,
  min: number,
  max: number,
  fallback: number
): number {
  const value = record[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(`${field} must be an integer.`, field);
  }
  if (value < min || value > max) {
    fail(`${field} must be between ${min} and ${max}.`, field);
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Composite parsers (whitelist projection)
 * ------------------------------------------------------------------ */

function parseOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) fail("options must be an array.", "options");
  if (value.length < MIN_OPTIONS || value.length > MAX_OPTIONS) {
    fail(
      `options must contain between ${MIN_OPTIONS} and ${MAX_OPTIONS} items.`,
      "options"
    );
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    const prefix = `options[${index}]`;
    const record = asRecord(item, prefix);
    const id = requireNonEmptyString(record, "id", `${prefix}.id`, MAX_OPTION_ID_LENGTH);
    if (seen.has(id)) fail(`${prefix}.id must be unique.`, `${prefix}.id`);
    seen.add(id);

    const option: QuestionOption = {
      id,
      text: requireNonEmptyString(record, "text", `${prefix}.text`, MAX_OPTION_TEXT_LENGTH),
    };
    const furigana = optionalString(record, "furigana", `${prefix}.furigana`, MAX_OPTION_TEXT_LENGTH);
    if (furigana !== null) option.furigana = furigana;
    const translation = optionalString(
      record,
      "translation",
      `${prefix}.translation`,
      MAX_OPTION_TEXT_LENGTH
    );
    if (translation !== null) option.translation = translation;
    return option;
  });
}

function parseStarOrderParts(value: unknown): StarOrderParts | null {
  if (value === undefined || value === null) return null;
  const record = asRecord(value, "starOrderParts");

  const partsRaw = record.parts;
  if (!Array.isArray(partsRaw)) {
    fail("starOrderParts.parts must be an array.", "starOrderParts.parts");
  }
  if (partsRaw.length < MIN_OPTIONS || partsRaw.length > MAX_OPTIONS) {
    fail(
      `starOrderParts.parts must contain between ${MIN_OPTIONS} and ${MAX_OPTIONS} items.`,
      "starOrderParts.parts"
    );
  }
  const seen = new Set<string>();
  const parts = partsRaw.map((item, index) => {
    const prefix = `starOrderParts.parts[${index}]`;
    const itemRecord = asRecord(item, prefix);
    const id = requireNonEmptyString(itemRecord, "id", `${prefix}.id`, MAX_OPTION_ID_LENGTH);
    if (seen.has(id)) fail(`${prefix}.id must be unique.`, `${prefix}.id`);
    seen.add(id);
    const part: { id: string; text: string; furigana?: string } = {
      id,
      text: requireNonEmptyString(itemRecord, "text", `${prefix}.text`, MAX_OPTION_TEXT_LENGTH),
    };
    const furigana = optionalString(itemRecord, "furigana", `${prefix}.furigana`, MAX_OPTION_TEXT_LENGTH);
    if (furigana !== null) part.furigana = furigana;
    return part;
  });

  const orderRaw = record.correctOrder;
  if (!Array.isArray(orderRaw)) {
    fail(
      "starOrderParts.correctOrder must be an array.",
      "starOrderParts.correctOrder"
    );
  }
  if (orderRaw.length !== parts.length) {
    fail(
      "starOrderParts.correctOrder must list every part exactly once.",
      "starOrderParts.correctOrder"
    );
  }
  const ordered = new Set<string>();
  const correctOrder = orderRaw.map((entry, index) => {
    const prefix = `starOrderParts.correctOrder[${index}]`;
    if (typeof entry !== "string" || entry.length === 0 || entry.length > MAX_OPTION_ID_LENGTH) {
      fail(`${prefix} must be a non-empty string.`, prefix);
    }
    if (!seen.has(entry)) {
      fail(`${prefix} must be one of the part ids.`, prefix);
    }
    if (ordered.has(entry)) fail(`${prefix} must be unique.`, prefix);
    ordered.add(entry);
    return entry;
  });

  const starPositionRaw = record.starPosition;
  if (starPositionRaw === undefined || starPositionRaw === null) {
    fail("starOrderParts.starPosition is required.", "starOrderParts.starPosition");
  }
  if (typeof starPositionRaw !== "number" || !Number.isInteger(starPositionRaw)) {
    fail("starOrderParts.starPosition must be an integer.", "starOrderParts.starPosition");
  }
  if (starPositionRaw < 1 || starPositionRaw > parts.length) {
    fail(
      `starOrderParts.starPosition must be between 1 and ${parts.length}.`,
      "starOrderParts.starPosition"
    );
  }

  return { parts, correctOrder, starPosition: starPositionRaw };
}

function parseExplanationBreakdown(value: unknown): ExplanationBreakdown | null {
  if (value === undefined || value === null) return null;
  const record = asRecord(value, "explanationBreakdown");
  const breakdown: {
    grammarPoints?: GrammarPointBreakdown[];
    vocabNotes?: VocabNote[];
    whyWrong?: Record<string, string>;
    strategyTip?: string;
  } = {};

  const grammarPoints = record.grammarPoints;
  if (grammarPoints !== undefined && grammarPoints !== null) {
    if (!Array.isArray(grammarPoints)) {
      fail(
        "explanationBreakdown.grammarPoints must be an array.",
        "explanationBreakdown.grammarPoints"
      );
    }
    breakdown.grammarPoints = grammarPoints.map((entry, index) => {
      const prefix = `explanationBreakdown.grammarPoints[${index}]`;
      const entryRecord = asRecord(entry, prefix);
      const point: GrammarPointBreakdown = {
        title: requireNonEmptyString(entryRecord, "title", `${prefix}.title`, MAX_MONDAI_TITLE_LENGTH),
        explanation: requireNonEmptyString(
          entryRecord,
          "explanation",
          `${prefix}.explanation`,
          MAX_EXPLANATION_LENGTH
        ),
      };
      const example = optionalString(entryRecord, "example", `${prefix}.example`, MAX_EXPLANATION_LENGTH);
      if (example !== null) point.example = example;
      return point;
    });
  }

  const vocabNotes = record.vocabNotes;
  if (vocabNotes !== undefined && vocabNotes !== null) {
    if (!Array.isArray(vocabNotes)) {
      fail(
        "explanationBreakdown.vocabNotes must be an array.",
        "explanationBreakdown.vocabNotes"
      );
    }
    breakdown.vocabNotes = vocabNotes.map((entry, index) => {
      const prefix = `explanationBreakdown.vocabNotes[${index}]`;
      const entryRecord = asRecord(entry, prefix);
      return {
        word: requireNonEmptyString(entryRecord, "word", `${prefix}.word`, MAX_OPTION_TEXT_LENGTH),
        reading: requireNonEmptyString(
          entryRecord,
          "reading",
          `${prefix}.reading`,
          MAX_OPTION_TEXT_LENGTH
        ),
        meaning: requireNonEmptyString(
          entryRecord,
          "meaning",
          `${prefix}.meaning`,
          MAX_OPTION_TEXT_LENGTH
        ),
      };
    });
  }

  const whyWrong = record.whyWrong;
  if (whyWrong !== undefined && whyWrong !== null) {
    const record2 = asRecord(whyWrong, "explanationBreakdown.whyWrong");
    const projected: Record<string, string> = {};
    for (const [key, entry] of Object.entries(record2)) {
      if (typeof entry !== "string" || entry.length > MAX_EXPLANATION_LENGTH) {
        fail(
          `explanationBreakdown.whyWrong.${key} must be a string of at most ${MAX_EXPLANATION_LENGTH} characters.`,
          `explanationBreakdown.whyWrong.${key}`
        );
      }
      projected[key] = entry;
    }
    breakdown.whyWrong = projected;
  }

  const strategyTip = record.strategyTip;
  if (strategyTip !== undefined && strategyTip !== null) {
    if (typeof strategyTip !== "string" || strategyTip.length > MAX_EXPLANATION_LENGTH) {
      fail(
        `explanationBreakdown.strategyTip must be a string of at most ${MAX_EXPLANATION_LENGTH} characters.`,
        "explanationBreakdown.strategyTip"
      );
    }
    breakdown.strategyTip = strategyTip;
  }

  return Object.keys(breakdown).length === 0 ? null : breakdown;
}

function parseTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail("tags must be an array of strings.", "tags");
  if (value.length > MAX_TAGS) {
    fail(`tags must contain at most ${MAX_TAGS} items.`, "tags");
  }
  return value.map((tag, index) => {
    if (typeof tag !== "string" || tag.trim().length === 0) {
      fail(`tags[${index}] must be a non-empty string.`, `tags[${index}]`);
    }
    if (tag.length > MAX_TAG_LENGTH) {
      fail(`tags[${index}] must be at most ${MAX_TAG_LENGTH} characters.`, `tags[${index}]`);
    }
    return tag;
  });
}

function resolveId(value: unknown): string {
  if (value === undefined || value === null) return `q-${Date.now()}`;
  if (typeof value !== "string") fail("id must be a string.", "id");
  if (value.length === 0 || value.length > MAX_QUESTION_ID_LENGTH) {
    fail(`id must be between 1 and ${MAX_QUESTION_ID_LENGTH} characters.`, "id");
  }
  if (!QUESTION_ID_PATTERN.test(value)) {
    fail("id may contain only letters, digits, and . _ : -", "id");
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Validate and normalize a create-question payload.
 *
 * Total and side-effect free: it either throws `QuestionAuthoringError`
 * (400) or returns a fully-typed, whitelist-projected row. It never reads
 * identity, never touches the database, and never echoes the payload back.
 */
export function parseCreateQuestionDraft(payload: unknown): NewQuestionRow {
  const body = asRecord(payload, "body");

  const options = parseOptions(body.options);
  const starOrderParts = parseStarOrderParts(body.starOrderParts);

  const correctAnswer = requireNonEmptyString(
    body,
    "correctAnswer",
    "correctAnswer",
    MAX_OPTION_ID_LENGTH
  );

  // The answer must be one of the ids the question actually offers, so a
  // draft can never be stored with an unanswerable key.
  const answerable = new Set<string>(options.map((option) => option.id));
  for (const part of starOrderParts?.parts ?? []) answerable.add(part.id);
  if (!answerable.has(correctAnswer)) {
    fail(
      "correctAnswer must match one of the option or part ids.",
      "correctAnswer"
    );
  }

  return {
    id: resolveId(body.id),
    jlptLevel: optionalEnum(body, "jlptLevel", "jlptLevel", JLPT_LEVELS, "N5"),
    section: optionalEnum(body, "section", "section", QUESTION_SECTIONS, "vocab"),
    category: optionalEnum(
      body,
      "category",
      "category",
      QUESTION_CATEGORIES,
      "contextual_use"
    ),
    mondaiNumber: optionalInteger(
      body,
      "mondaiNumber",
      "mondaiNumber",
      MIN_MONDAI_NUMBER,
      MAX_MONDAI_NUMBER,
      1
    ),
    mondaiTitle: optionalString(body, "mondaiTitle", "mondaiTitle", MAX_MONDAI_TITLE_LENGTH) ?? "問題１",
    questionType: optionalEnum(
      body,
      "questionType",
      "questionType",
      QUESTION_TYPES,
      "multiple_choice"
    ),
    prompt: requireNonEmptyString(body, "prompt", "prompt", MAX_PROMPT_LENGTH),
    promptFurigana: optionalString(body, "promptFurigana", "promptFurigana", MAX_PROMPT_LENGTH),
    promptTranslation: requireNonEmptyString(
      body,
      "promptTranslation",
      "promptTranslation",
      MAX_PROMPT_LENGTH
    ),
    passage: optionalString(body, "passage", "passage", MAX_PASSAGE_LENGTH),
    passageFurigana: optionalString(body, "passageFurigana", "passageFurigana", MAX_PASSAGE_LENGTH),
    passageTranslation: optionalString(
      body,
      "passageTranslation",
      "passageTranslation",
      MAX_PASSAGE_LENGTH
    ),
    audioScript: optionalString(body, "audioScript", "audioScript", MAX_AUDIO_SCRIPT_LENGTH),
    audioUrl: optionalString(body, "audioUrl", "audioUrl", MAX_AUDIO_URL_LENGTH),
    options,
    starOrderParts,
    correctAnswer,
    explanation: requireNonEmptyString(
      body,
      "explanation",
      "explanation",
      MAX_EXPLANATION_LENGTH
    ),
    explanationBreakdown: parseExplanationBreakdown(body.explanationBreakdown),
    difficulty: optionalInteger(
      body,
      "difficulty",
      "difficulty",
      MIN_DIFFICULTY,
      MAX_DIFFICULTY,
      3
    ),
    tags: parseTags(body.tags),
  };
}
