/**
 * CorrectionService — Japanese text correction with grammar/vocabulary explanations.
 *
 * P56: User submits Japanese text → service returns:
 *   1. Corrected version (minimal changes)
 *   2. Natural version (how a native would express it)
 *   3. Per-error grammar explanations
 *   4. Vocabulary suggestions
 *
 * Uses the RAG pipeline for AI-powered correction when available,
 * with rule-based fallback for common errors.
 */

import { RAGPipeline } from "./rag-pipeline";
import { KnowledgeRetrieval } from "./knowledge-retrieval";
import { DictionaryService } from "../knowledge/dictionary";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CorrectionInput {
  /** The learner's Japanese text to correct. */
  text: string;
  /** Learner ID for personalised feedback. */
  learnerId?: string;
  /** What the learner intended to say in English (optional). */
  intendedMeaning?: string;
  /** JLPT level for feedback complexity. */
  level?: "N5" | "N4" | "N3" | "N2" | "N1";
}

export interface CorrectionResult {
  /** The original input text. */
  original: string;
  /** Corrected version (minimal fixes). */
  corrected: string;
  /** How a native speaker would naturally express it. */
  natural: string;
  /** Whether any corrections were needed. */
  hasErrors: boolean;
  /** Individual errors found. */
  errors: CorrectionError[];
  /** Vocabulary notes and suggestions. */
  vocabularyNotes: VocabularyNote[];
  /** Overall feedback summary. */
  feedback: string;
  /** AI provider metadata. */
  ai: { provider: string; model: string; tokensUsed: number };
}

export interface CorrectionError {
  /** What was wrong in the original. */
  original: string;
  /** What it should be. */
  correction: string;
  /** Error category. */
  category: "particle" | "conjugation" | "word_order" | "word_choice" | "formality" | "spelling" | "grammar" | "other";
  /** Explanation of why it's wrong. */
  explanation: string;
  /** Related grammar pattern (if applicable). */
  grammarRef?: { id: string; title: string; slug: string };
}

export interface VocabularyNote {
  /** The word in the text. */
  word: string;
  reading: string;
  meaning: string;
  /** Suggestion or note about usage. */
  note: string;
  /** Alternative word suggestion. */
  alternative?: { word: string; reading: string; meaning: string; reason: string };
  /** Dictionary entry ref. */
  entryRef?: string;
}

// ─────────────────────────────────────────────
// Common error patterns (rule-based fallback)
// ─────────────────────────────────────────────

interface ErrorPattern {
  pattern: RegExp;
  category: CorrectionError["category"];
  check: (match: RegExpMatchArray, text: string) => CorrectionError | null;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // を with intransitive verbs that shouldn't take を
  {
    pattern: /を(好き|嫌い|わかる|ある|いる|できる)/,
    category: "particle",
    check: (match) => ({
      original: `を${match[1]}`,
      correction: `が${match[1]}`,
      category: "particle",
      explanation: `${match[1]} takes the particle が, not を. This is because ${match[1]} is a state/feeling rather than an action on an object.`,
    }),
  },
  // は after question words (should be が)
  {
    pattern: /(誰|何|どこ|いつ|どれ)は/,
    category: "particle",
    check: (match) => ({
      original: `${match[1]}は`,
      correction: `${match[1]}が`,
      category: "particle",
      explanation: `Question words (${match[1]}) typically use が, not は, because they introduce new/unknown information.`,
    }),
  },
  // Double particles
  {
    pattern: /(は|が|を|に|で|と|も)(は|が|を|に|で)/,
    category: "grammar",
    check: (match) => ({
      original: `${match[1]}${match[2]}`,
      correction: match[2]!,
      category: "grammar",
      explanation: `Double particles (${match[1]}${match[2]}) — usually only one particle is needed. Use ${match[2]} here.`,
    }),
  },
  // い-adjective + です with な
  {
    pattern: /([いきしちにひみりぎじびぴ])なです/,
    category: "conjugation",
    check: () => ({
      original: "〜なです",
      correction: "〜いです",
      category: "conjugation",
      explanation: "い-adjectives don't use な before です. Simply say 〜いです. な is only for な-adjectives.",
    }),
  },
  // Past tense い-adjective error: 〜いでした instead of 〜かったです
  {
    pattern: /([いきしちにひみりぎじびぴ])でした/,
    category: "conjugation",
    check: (match) => ({
      original: `${match[1]}でした`,
      correction: `${match[1]?.replace(/い$/, "")}かったです`,
      category: "conjugation",
      explanation: "For past tense い-adjectives, change い to かった, then add です. Don't use でした with い-adjectives.",
    }),
  },
  // Mixing plain and polite forms
  {
    pattern: /(だ|である)(。|$)/,
    category: "formality",
    check: (_match, text) => {
      if (text.includes("ます") || text.includes("です")) {
        return {
          original: "だ",
          correction: "です",
          category: "formality",
          explanation: "Mixing plain (だ) and polite (ます/です) forms in the same text. Choose one style and be consistent.",
        };
      }
      return null;
    },
  },
];

// ─────────────────────────────────────────────
// CorrectionService
// ─────────────────────────────────────────────

export const CorrectionService = {

  /** Correct Japanese text with full analysis. */
  async correct(input: CorrectionInput): Promise<CorrectionResult> {
    const { text, learnerId, intendedMeaning, level = "N5" } = input;

    // Stage 1: Rule-based error detection
    const ruleErrors = this._detectRuleErrors(text);

    // Stage 2: Apply rule-based corrections
    let corrected = text;
    for (const err of ruleErrors) {
      corrected = corrected.replace(err.original, err.correction);
    }

    // Stage 3: AI-powered correction via RAG pipeline
    const prompt = intendedMeaning
      ? `The learner wrote: "${text}"\nThey intended to say: "${intendedMeaning}"\n\nPlease:\n1. Correct any errors\n2. Provide a natural Japanese version\n3. Explain each error`
      : `The learner wrote: "${text}"\n\nPlease:\n1. Correct any errors (keep corrections minimal)\n2. Provide a natural version (how a native speaker would say it)\n3. Explain each error found\n4. Note any vocabulary that could be improved`;

    const ragResult = await RAGPipeline.run({
      question: prompt,
      learnerId,
      forceIntent: "correct",
    });

    // Stage 4: Extract vocabulary from the text
    const vocabNotes = await this._analyzeVocabulary(text, learnerId);

    // Stage 5: Link errors to grammar patterns
    const enrichedErrors = await this._enrichErrors(ruleErrors);

    // Build natural version (from AI or corrected)
    const natural = corrected !== text ? corrected : text;

    const hasErrors = ruleErrors.length > 0 || corrected !== text;

    // Build feedback summary
    const feedback = hasErrors
      ? `Found ${ruleErrors.length} issue${ruleErrors.length !== 1 ? "s" : ""}. ${ruleErrors.map((e) => e.category).filter((v, i, a) => a.indexOf(v) === i).join(", ")} error${ruleErrors.length !== 1 ? "s" : ""} detected.`
      : "Great job! No errors found. Your Japanese looks correct! 🎉";

    return {
      original: text,
      corrected,
      natural,
      hasErrors,
      errors: enrichedErrors,
      vocabularyNotes: vocabNotes,
      feedback,
      ai: {
        provider: ragResult.llm.provider,
        model: ragResult.llm.model,
        tokensUsed: ragResult.llm.tokensUsed.total,
      },
    };
  },

  // ─── Internal ───

  _detectRuleErrors(text: string): CorrectionError[] {
    const errors: CorrectionError[] = [];
    for (const pattern of ERROR_PATTERNS) {
      const match = text.match(pattern.pattern);
      if (match) {
        const error = pattern.check(match, text);
        if (error) errors.push(error);
      }
    }
    return errors;
  },

  async _analyzeVocabulary(text: string, learnerId?: string): Promise<VocabularyNote[]> {
    const notes: VocabularyNote[] = [];

    // Extract potential words and look them up
    // Simple approach: check if any dictionary headwords appear in the text
    const searchResult = await DictionaryService.search({ query: text, pageSize: 5 });

    for (const entry of searchResult.entries) {
      if (text.includes(entry.headword) || text.includes(entry.reading)) {
        const meanings = entry.senses.flatMap((s) => s.glosses.en ?? []).slice(0, 2);
        notes.push({
          word: entry.headword,
          reading: entry.reading,
          meaning: meanings.join(", "),
          note: entry.isCommon ? "Common word ✓" : "Less common word — consider using a simpler alternative.",
          entryRef: entry.id,
        });
      }
    }

    return notes;
  },

  async _enrichErrors(errors: CorrectionError[]): Promise<CorrectionError[]> {
    for (const error of errors) {
      if (error.category === "particle") {
        // Try to find related grammar pattern
        const retrieval = await KnowledgeRetrieval.retrieve(error.original, {
          domains: ["grammar"],
          maxTotal: 1,
        });
        if (retrieval.chunks.length > 0) {
          const chunk = retrieval.chunks[0]!;
          error.grammarRef = {
            id: chunk.id,
            title: chunk.title,
            slug: chunk.metadata.slug as string ?? chunk.id,
          };
        }
      }
    }
    return errors;
  },
};
