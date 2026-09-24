/**
 * §14 — JLPT-specific data-quality checks.
 *
 * Pure functions over in-memory values; no database, no I/O. They classify
 * defects and never repair them.
 *
 * ## Why this file exists separately from `checks.ts`
 *
 * `checks.ts` holds generic primitives (duplicate ids, orphan refs, provenance
 * placeholders). Everything here encodes JLPT *domain* rules — eligible levels,
 * section vocabularies, and answer-reference integrity — so the domain logic
 * stays separable from the reusable primitives.
 *
 * ## The foundational fact this contract is built on
 *
 * **The JLPT has not published official vocabulary, kanji, or grammar lists
 * since the 2010 revision.** The Japan Foundation's stated position is that
 * publishing "Test Content Specifications" was inappropriate, because the test
 * measures general communicative competence rather than a fixed word list. The
 * pre-2010 four-level system did have published specifications; those lists are
 * still used as the empirical basis for today's community N5–N1 lists, but they
 * are no longer authoritative for the current five-level test.
 *
 * Consequence: **every JLPT level assignment in this system is
 * community-derived or editorial, never officially published.** The checks below
 * therefore validate *representability and internal consistency*, not
 * correctness of classification. A level that passes these checks is
 * well-formed; it is not thereby verified. That distinction must not be
 * collapsed anywhere in the UI or the API.
 */

import type { QualityFinding } from "./checks";

/**
 * Eligible JLPT levels. Uppercase `N`-prefixed.
 *
 * Note the asymmetry with the broader codebase: `src/etl/grammar/types.ts`
 * exports `VALID_JLPT_LEVELS` as `["N5","N4","N3","N2","N1"]`, while
 * `src/etl/dictionary/types.ts` holds a `Set` of the same values under the same
 * name. Both agree; this constant exists so quality checks do not depend on
 * which module a caller happened to import.
 */
export const VALID_JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type ValidJlptLevel = (typeof VALID_JLPT_LEVELS)[number];

export function isValidJlptLevel(value: string): value is ValidJlptLevel {
  return (VALID_JLPT_LEVELS as readonly string[]).includes(value);
}

/**
 * Sentinel written when no level is known.
 *
 * `normalizeJlpt` (src/etl/dictionary/types.ts:286) returns `"NONE"` for absent
 * or unparseable input, and `dictionary_entries.jlpt_level` is `NOT NULL`, so
 * `"NONE"` is stored as a literal value in a column whose documented domain is
 * `'N5' | 'N4' | 'N3' | 'N2' | 'N1'`.
 *
 * This is a **known, documented domain violation**, not a defect introduced by
 * these checks. It is represented explicitly here so that:
 *
 *   1. consumers can distinguish "no level known" from "level N-something";
 *   2. a strict domain check reports it as a single recognised sentinel class
 *      rather than as thousands of indistinguishable unexpected values;
 *   3. the sentinel is never mistaken for a level by a naive parser.
 */
export const JLPT_LEVEL_UNKNOWN = "NONE";

export type JlptLevelMeaning = "known" | "unknown" | "invalid";

/**
 * Classifies a stored level without repairing it.
 *
 * A consumer filtering by level must use this rather than a truthiness or
 * non-null test, because `"NONE"` is truthy and non-null.
 */
export function classifyJlptLevel(stored: string | null | undefined): JlptLevelMeaning {
  if (stored === null || stored === undefined || stored === "") return "unknown";
  if (stored === JLPT_LEVEL_UNKNOWN) return "unknown";
  if (isValidJlptLevel(stored)) return "known";
  return "invalid";
}

/**
 * Checks stored JLPT levels against the controlled vocabulary.
 *
 * Severity is `ERROR` for unrecognised values (they are unrepresentable) and
 * `INFO` for the `"NONE"` sentinel, because the sentinel is a documented,
 * expected state. Reporting it at `ERROR` would drown every genuine defect in
 * ~206,000 identical findings.
 */
export function checkJlptLevels(
  subject: string,
  records: Iterable<{ id: string; jlptLevel: string | null | undefined }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    const classified = classifyJlptLevel(record.jlptLevel);
    if (classified === "unknown") {
      findings.push({
        code: "JLPT_LEVEL_UNKNOWN",
        severity: "INFO",
        subject,
        ref: record.id,
        detail: `No JLPT level established (stored as "${record.jlptLevel ?? ""}")`,
      });
    } else if (classified === "invalid") {
      findings.push({
        code: "JLPT_LEVEL_INVALID",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `"${record.jlptLevel}" is not one of ${VALID_JLPT_LEVELS.join(", ")}`,
      });
    }
  }
  return findings;
}

/**
 * Detects the `normalizeJlpt` digit-scavenging hazard.
 *
 * `normalizeJlpt` falls back to `upper.match(/N?[1-5]/)` — an unanchored search
 * for any digit 1–5 anywhere in the string. A version string or date therefore
 * yields a plausible-looking level:
 *
 * ```
 * normalizeJlpt("2024-07")    -> "N2"
 * normalizeJlpt("v1.5")       -> "N1"
 * normalizeJlpt("2023-08-20") -> "N2"
 * normalizeJlpt("test-4")     -> "N4"
 * ```
 *
 * Because `jlpt_level` is `NOT NULL`, such a value is stored and is
 * indistinguishable from a real classification afterwards. This check flags
 * levels whose *claimed* source text is not itself a level, so the hazard is
 * detectable rather than latent.
 *
 * @param records pairs of stored level and the raw text it was derived from
 */
export function checkJlptLevelDerivation(
  subject: string,
  records: Iterable<{ id: string; storedLevel: string; rawSource: string | null | undefined }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const strict = /^(?:N)?[1-5]$/i;

  for (const record of records) {
    const raw = record.rawSource;
    if (raw === null || raw === undefined || raw.trim() === "") continue;

    const trimmed = raw.trim();
    if (strict.test(trimmed)) continue; // genuinely level-shaped

    // The stored value looks like a level but its source text did not.
    if (isValidJlptLevel(record.storedLevel)) {
      findings.push({
        code: "JLPT_LEVEL_DERIVED_FROM_NON_LEVEL_SOURCE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Stored level "${record.storedLevel}" was derived from "${trimmed}", which is not a level designator`,
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Section vocabulary
 * ------------------------------------------------------------------ */

/**
 * `questions.section` domain — 4 values (src/db/schema.ts:54).
 */
export const QUESTION_SECTIONS = ["vocab", "grammar", "reading", "listening"] as const;

/**
 * `jlpt_test_questions.section_key` domain (src/db/schema.ts:137).
 *
 * Note: a **different** vocabulary from `QUESTION_SECTIONS`, for the same
 * conceptual axis. Two tables describing JLPT sections use two incompatible
 * value sets, so a join or aggregate across them by section silently misses
 * rows. This is documented rather than reconciled, because reconciling it would
 * require a migration.
 */
export const TEST_SECTION_KEYS = [
  "vocab",
  "grammar_reading",
  "listening",
  "language_knowledge_reading",
] as const;

/**
 * `questions.category` domain (src/db/schema.ts:55).
 *
 * Listed as a single flat set because the column is flat, even though the
 * categories partition by section in practice. The check below verifies that
 * relation rather than assuming it.
 */
export const QUESTION_CATEGORIES = [
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
] as const;

/**
 * Section each question category belongs to, per the column comment.
 *
 * Used to detect a question whose `section` and `category` disagree — e.g.
 * a `listening_quick` category filed under `section: "reading"`. Such a row
 * is representable in the schema and would be miscounted in sectional scoring.
 */
export const CATEGORY_TO_SECTION: Record<string, (typeof QUESTION_SECTIONS)[number]> = {
  kanji_reading: "vocab",
  orthography: "vocab",
  contextual_use: "vocab",
  paraphrase: "vocab",
  usage: "vocab",
  grammar_form: "grammar",
  sentence_order: "grammar",
  text_grammar: "grammar",
  reading_short: "reading",
  reading_mid: "reading",
  reading_info: "reading",
  listening_task: "listening",
  listening_point: "listening",
  listening_utterance: "listening",
  listening_quick: "listening",
};

export function checkSectionCategoryConsistency(
  subject: string,
  records: Iterable<{ id: string; section: string; category: string }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    const expected = CATEGORY_TO_SECTION[record.category];
    if (!expected) {
      findings.push({
        code: "JLPT_CATEGORY_UNKNOWN",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Category "${record.category}" is not in the controlled set`,
      });
      continue;
    }
    if (expected !== record.section) {
      findings.push({
        code: "JLPT_SECTION_CATEGORY_MISMATCH",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Category "${record.category}" belongs to section "${expected}", not "${record.section}"`,
      });
    }
  }
  return findings;
}

/** Detects use of the wrong section vocabulary for a given table. */
export function checkSectionVocabulary(
  subject: string,
  records: Iterable<{ id: string; sectionKey: string }>,
  vocabulary: readonly string[]
): QualityFinding[] {
  const permitted = new Set(vocabulary);
  const findings: QualityFinding[] = [];
  for (const record of records) {
    if (!permitted.has(record.sectionKey)) {
      findings.push({
        code: "JLPT_SECTION_UNKNOWN",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Section key "${record.sectionKey}" is not in this table's vocabulary`,
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Answer validation
 * ------------------------------------------------------------------ */

export interface AnswerCandidate {
  id: string;
  /** Option ids for multiple-choice; part ids for star-order. */
  optionIds: string[];
  /** Stored `correct_answer`. */
  correctAnswer: string;
  /** Present for star-order questions. */
  starOrder?: {
    partIds: string[];
    correctOrder: string[];
    starPosition: number;
  };
}

/**
 * Validates that a stored answer can actually be resolved.
 *
 * The schema (`src/db/schema.ts:88`) declares `correct_answer` as `NOT NULL` but
 * places **no constraint on it** relative to `options[].id`. A question whose
 * `correctAnswer` is `"5"` while `options` holds ids `["1","2","3","4"]` is
 * perfectly valid to the database and completely unanswerable to a learner.
 * Nothing in the storage layer can detect this, which is why it belongs here.
 *
 * Rules:
 *   - `correctAnswer` must match exactly one entry in the option/part id set.
 *     Zero matches is `ERROR` (unresolvable); more than one is `ERROR`
 *     (ambiguous, since ids are meant to be unique).
 *   - For star-order questions, `correctOrder` must be a **permutation** of the
 *     part ids — same length, no repeats, no strangers. A partial or padded
 *     order produces a scoring routine that cannot be trusted.
 *   - `starPosition` must lie within `1..partIds.length`. The comment notes
 *     official JLPT star questions normally use position 3, but that is a
 *     convention, not a validity bound.
 *   - An empty option set is `ERROR`: the question cannot be presented.
 */
export function checkAnswers(
  subject: string,
  records: Iterable<AnswerCandidate>
): QualityFinding[] {
  const findings: QualityFinding[] = [];

  for (const record of records) {
    const ids = new Set(record.optionIds);

    if (record.optionIds.length === 0) {
      findings.push({
        code: "JLPT_NO_OPTIONS",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: "Question has no answer options",
      });
    }

    const matches = record.optionIds.filter((id) => id === record.correctAnswer).length;
    if (matches === 0) {
      findings.push({
        code: "JLPT_ANSWER_NOT_AN_OPTION",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `correct_answer "${record.correctAnswer}" matches no option id; the question is unanswerable`,
      });
    } else if (matches > 1) {
      findings.push({
        code: "JLPT_ANSWER_AMBIGUOUS",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `correct_answer "${record.correctAnswer}" matches ${matches} option ids`,
      });
    }

    const star = record.starOrder;
    if (!star) continue;

    const partIds = new Set(star.partIds);
    const order = star.correctOrder;

    if (order.length !== star.partIds.length) {
      findings.push({
        code: "JLPT_STAR_ORDER_LENGTH",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `correctOrder has ${order.length} entries for ${star.partIds.length} parts`,
      });
    }

    const seen = new Set<string>();
    for (const partId of order) {
      if (!partIds.has(partId)) {
        findings.push({
          code: "JLPT_STAR_ORDER_UNKNOWN_PART",
          severity: "ERROR",
          subject,
          ref: record.id,
          detail: `correctOrder references "${partId}", which is not a part`,
        });
      }
      if (seen.has(partId)) {
        findings.push({
          code: "JLPT_STAR_ORDER_DUPLICATE",
          severity: "ERROR",
          subject,
          ref: record.id,
          detail: `correctOrder repeats part "${partId}"; it is not a permutation`,
        });
      }
      seen.add(partId);
    }

    for (const partId of star.partIds) {
      if (!seen.has(partId)) {
        findings.push({
          code: "JLPT_STAR_ORDER_MISSING_PART",
          severity: "ERROR",
          subject,
          ref: record.id,
          detail: `correctOrder omits part "${partId}"`,
        });
      }
    }

    if (
      !Number.isInteger(star.starPosition) ||
      star.starPosition < 1 ||
      star.starPosition > star.partIds.length
    ) {
      findings.push({
        code: "JLPT_STAR_POSITION_OUT_OF_RANGE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `starPosition ${star.starPosition} is outside 1..${star.partIds.length}`,
      });
    }
  }

  return findings;
}

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;

/**
 * Validates `questions.difficulty` (1–5 per the column comment, default 3).
 *
 * An integer outside the range is `ERROR`; a non-integer is `ERROR` because the
 * schema comment and downstream weighting both assume whole numbers.
 */
export function checkDifficulty(
  subject: string,
  records: Iterable<{ id: string; difficulty: number | null | undefined }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    const value = record.difficulty;
    if (value === null || value === undefined) {
      findings.push({
        code: "JLPT_DIFFICULTY_MISSING",
        severity: "WARNING",
        subject,
        ref: record.id,
        detail: "Difficulty is absent",
      });
      continue;
    }
    if (!Number.isInteger(value) || value < DIFFICULTY_MIN || value > DIFFICULTY_MAX) {
      findings.push({
        code: "JLPT_DIFFICULTY_INVALID",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Difficulty ${value} is outside ${DIFFICULTY_MIN}..${DIFFICULTY_MAX} (or not an integer)`,
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Explanations and translations
 * ------------------------------------------------------------------ */

/**
 * Checks that required explanatory/translation fields are populated.
 *
 * `prompt_translation` and `explanation` are both `NOT NULL`
 * (src/db/schema.ts:63, :92) and both describe the *same* question in a second
 * language. An empty string satisfies `NOT NULL` while conveying nothing, so an
 * empty value is reported here even though the database accepts it.
 *
 * `explanation` is `WARNING` rather than `ERROR`: a question without a written
 * explanation is usable, just poorly supported. `promptTranslation` is allowed
 * to be absent only where the prompt is not Japanese prose to begin with.
 */
export function checkExplanations(
  subject: string,
  records: Iterable<{
    id: string;
    promptTranslation: string | null | undefined;
    explanation: string | null | undefined;
  }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    if (!record.promptTranslation || record.promptTranslation.trim() === "") {
      findings.push({
        code: "JLPT_TRANSLATION_MISSING",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: "promptTranslation is present but empty",
      });
    }
    if (!record.explanation || record.explanation.trim() === "") {
      findings.push({
        code: "JLPT_EXPLANATION_MISSING",
        severity: "WARNING",
        subject,
        ref: record.id,
        detail: "explanation is present but empty",
      });
    }
  }
  return findings;
}

/**
 * Scores a test's sectional configuration for internal consistency.
 *
 * `jlpt_tests.section_configs` carries per-section `maxScore`/`passScore` and a
 * `mondaiList`. Nothing in the schema checks that:
 *   - section maxima sum to the declared `totalScore`;
 *   - each `passScore` is within `0..maxScore`;
 *   - the `mondaiList` numbers are positive integers.
 *
 * The real JLPT has *both* a total pass mark and per-section minimum marks, so a
 * configuration whose sections do not sum to the total would score the exam
 * inconsistently depending on which rule was applied.
 */
export function checkTestScoring(
  subject: string,
  tests: Iterable<{
    id: string;
    totalScore: number;
    passingScore: number;
    sectionConfigs: Record<string, { maxScore: number; passScore: number; mondaiList: number[] }>;
  }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];

  for (const test of tests) {
    const configs = Object.entries(test.sectionConfigs);

    if (configs.length === 0) {
      findings.push({
        code: "JLPT_TEST_NO_SECTIONS",
        severity: "ERROR",
        subject,
        ref: test.id,
        detail: "Test declares no section configurations",
      });
      continue;
    }

    const sum = configs.reduce((acc, [, config]) => acc + config.maxScore, 0);
    if (sum !== test.totalScore) {
      findings.push({
        code: "JLPT_TEST_SECTION_TOTAL_MISMATCH",
        severity: "ERROR",
        subject,
        ref: test.id,
        detail: `Section maxima sum to ${sum}, but totalScore is ${test.totalScore}`,
      });
    }

    if (test.passingScore <= 0 || test.passingScore > test.totalScore) {
      findings.push({
        code: "JLPT_TEST_PASS_MARK_OUT_OF_RANGE",
        severity: "ERROR",
        subject,
        ref: test.id,
        detail: `passingScore ${test.passingScore} is outside 1..${test.totalScore}`,
      });
    }

    const sectionPassSum = configs.reduce((acc, [, config]) => acc + config.passScore, 0);
    if (sectionPassSum > test.totalScore) {
      findings.push({
        code: "JLPT_TEST_SECTION_PASS_SUM_EXCEEDS_TOTAL",
        severity: "WARNING",
        subject,
        ref: test.id,
        detail: `Sum of sectional pass marks (${sectionPassSum}) exceeds totalScore (${test.totalScore})`,
      });
    }

    for (const [key, config] of configs) {
      if (config.passScore < 0 || config.passScore > config.maxScore) {
        findings.push({
          code: "JLPT_TEST_SECTION_PASS_OUT_OF_RANGE",
          severity: "ERROR",
          subject,
          ref: test.id,
          detail: `Section "${key}" passScore ${config.passScore} is outside 0..${config.maxScore}`,
        });
      }
      if (config.maxScore <= 0) {
        findings.push({
          code: "JLPT_TEST_SECTION_NO_SCORE",
          severity: "ERROR",
          subject,
          ref: test.id,
          detail: `Section "${key}" has non-positive maxScore`,
        });
      }
      if (!Array.isArray(config.mondaiList) || config.mondaiList.length === 0) {
        findings.push({
          code: "JLPT_TEST_SECTION_NO_MONDAI",
          severity: "ERROR",
          subject,
          ref: test.id,
          detail: `Section "${key}" declares no mondai numbers`,
        });
      } else if (config.mondaiList.some((n) => !Number.isInteger(n) || n < 1)) {
        findings.push({
          code: "JLPT_TEST_SECTION_INVALID_MONDAI",
          severity: "ERROR",
          subject,
          ref: test.id,
          detail: `Section "${key}" has a non-positive or non-integer mondai number`,
        });
      }
    }
  }

  return findings;
}
