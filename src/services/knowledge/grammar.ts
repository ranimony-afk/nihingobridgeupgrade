/**
 * GrammarLearning — Domain service for grammar pattern lookup, learning, and practice.
 *
 * P38: pattern, meaning, formation, examples, JLPT, related patterns, practice.
 */

import { eq, and, asc, desc, sql, not, inArray, ilike } from "drizzle-orm";
import { db } from "@/db";
import {
  grammarPatterns,
  grammarExamples,
  grammarProgress,
  userBookmarks,
} from "@/db/schema";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type MasteryLevel = "unseen" | "introduced" | "practicing" | "familiar" | "mastered";

export interface GrammarPatternView {
  id: string;
  slug: string;
  title: string;
  titleJa: string | null;
  jlptLevel: number | null;
  structure: string;
  meaning: string;
  explanation: string;
  notes: string | null;
  formation: string | null;
  difficulty: number | null;
  tags: string[] | null;
  examples: { ja: string; en: string }[];
  /** Related patterns at the same or adjacent JLPT level. */
  relatedPatterns: { id: string; slug: string; title: string; meaning: string; jlptLevel: number | null }[];
  /** Learner progress (null if not logged in). */
  progress: GrammarProgressView | null;
  isBookmarked: boolean;
}

export interface GrammarProgressView {
  mastery: MasteryLevel;
  recognitionAccuracy: number | null;
  productionAccuracy: number | null;
  encounterCount: number;
  correctCount: number;
  incorrectCount: number;
}

export interface GrammarPracticeItem {
  grammarId: string;
  title: string;
  structure: string;
  meaning: string;
  mastery: MasteryLevel;
  exercise: {
    type: "meaning_from_pattern" | "pattern_from_meaning" | "fill_sentence" | "choose_example";
    prompt: string;
    answer: string;
    options: string[];
    explanation: string | null;
  };
}

export interface GrammarReviewResult {
  grammarId: string;
  correct: boolean;
  previousMastery: MasteryLevel;
  newMastery: MasteryLevel;
  recognitionAccuracy: number | null;
  productionAccuracy: number | null;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const GrammarLearning = {

  // ═══════════════════════════════════════════
  // LOOKUP
  // ═══════════════════════════════════════════

  /** Get grammar pattern by ID or slug with examples + related patterns. */
  async get(idOrSlug: string, learnerId?: string): Promise<GrammarPatternView | null> {
    const [row] = await db.select().from(grammarPatterns)
      .where(
        idOrSlug.startsWith("gp-")
          ? eq(grammarPatterns.id, idOrSlug)
          : eq(grammarPatterns.slug, idOrSlug),
      )
      .limit(1);
    if (!row) return null;
    return this._hydrate(row, learnerId);
  },

  /** Search grammar patterns by title, meaning, or tags. */
  async search(query: string, opts?: { jlpt?: number; limit?: number }): Promise<GrammarPatternView[]> {
    const limit = opts?.limit ?? 20;
    const conds = [];

    conds.push(sql`(
      ${grammarPatterns.title} ILIKE ${"%" + query + "%"}
      OR ${grammarPatterns.meaning} ILIKE ${"%" + query + "%"}
      OR ${grammarPatterns.structure} ILIKE ${"%" + query + "%"}
      OR ${grammarPatterns.explanation} ILIKE ${"%" + query + "%"}
    )`);

    if (opts?.jlpt) conds.push(eq(grammarPatterns.jlptLevel, opts.jlpt));

    const rows = await db.select().from(grammarPatterns)
      .where(and(...conds))
      .orderBy(asc(grammarPatterns.difficulty))
      .limit(limit);

    return Promise.all(rows.map((r) => this._hydrate(r)));
  },

  /** List grammar by JLPT level. */
  async getByJlpt(level: number): Promise<GrammarPatternView[]> {
    const rows = await db.select().from(grammarPatterns)
      .where(eq(grammarPatterns.jlptLevel, level))
      .orderBy(asc(grammarPatterns.difficulty));
    return Promise.all(rows.map((r) => this._hydrate(r)));
  },

  // ═══════════════════════════════════════════
  // REVIEW + PRACTICE
  // ═══════════════════════════════════════════

  /** Record a grammar review. */
  async review(
    learnerId: string,
    grammarId: string,
    correct: boolean,
    reviewType: "recognition" | "production" = "recognition",
  ): Promise<GrammarReviewResult> {
    let progress = await this._getProgress(learnerId, grammarId);
    const now = new Date();

    if (!progress) {
      await db.insert(grammarProgress).values({
        id: genId("gpr"),
        learnerId,
        grammarId,
        mastery: "introduced",
        encounterCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        introducedAt: now,
        lastSeenAt: now,
      });
      progress = (await this._getProgress(learnerId, grammarId))!;
    }

    const prev = progress.mastery as MasteryLevel;
    const newCorrect = progress.correctCount + (correct ? 1 : 0);
    const newIncorrect = progress.incorrectCount + (correct ? 0 : 1);
    const totalAcc = newCorrect / (newCorrect + newIncorrect);

    const recogAcc = reviewType === "recognition"
      ? (correct ? Math.min((progress.recognitionAccuracy ?? 0) + 0.15, 1) : Math.max((progress.recognitionAccuracy ?? 0.5) - 0.2, 0))
      : progress.recognitionAccuracy;
    const prodAcc = reviewType === "production"
      ? (correct ? Math.min((progress.productionAccuracy ?? 0) + 0.15, 1) : Math.max((progress.productionAccuracy ?? 0.5) - 0.2, 0))
      : progress.productionAccuracy;

    const MASTERY: MasteryLevel[] = ["unseen", "introduced", "practicing", "familiar", "mastered"];
    const idx = MASTERY.indexOf(prev);
    let newMastery = prev;
    if (correct && totalAcc >= 0.85 && idx < 4) newMastery = MASTERY[idx + 1]!;
    else if (!correct && idx > 1) newMastery = MASTERY[idx - 1]!;

    await db.update(grammarProgress).set({
      encounterCount: progress.encounterCount + 1,
      correctCount: newCorrect,
      incorrectCount: newIncorrect,
      mastery: newMastery,
      recognitionAccuracy: recogAcc,
      productionAccuracy: prodAcc,
      lastSeenAt: now,
      masteredAt: newMastery === "mastered" && prev !== "mastered" ? now : progress.masteredAt,
      updatedAt: now,
    }).where(eq(grammarProgress.id, progress.id));

    return {
      grammarId,
      correct,
      previousMastery: prev,
      newMastery,
      recognitionAccuracy: recogAcc ? Math.round(recogAcc * 1000) / 1000 : null,
      productionAccuracy: prodAcc ? Math.round(prodAcc * 1000) / 1000 : null,
    };
  },

  /** Generate grammar practice set. */
  async practice(learnerId: string, count = 8): Promise<GrammarPracticeItem[]> {
    // Fetch weakest grammar the learner has encountered
    let progressRows = await db.select().from(grammarProgress)
      .where(and(
        eq(grammarProgress.learnerId, learnerId),
        not(eq(grammarProgress.mastery, "mastered")),
      ))
      .orderBy(asc(grammarProgress.mastery), asc(grammarProgress.lastSeenAt))
      .limit(count);

    // If no progress, grab easiest grammar for introduction
    if (progressRows.length === 0) {
      const fresh = await db.select().from(grammarPatterns)
        .orderBy(asc(grammarPatterns.difficulty), asc(grammarPatterns.jlptLevel))
        .limit(count);
      const items: GrammarPracticeItem[] = [];
      for (const gp of fresh) {
        const examples = await this._getExamples(gp.id);
        items.push(this._buildExercise(gp, "unseen", examples));
      }
      return items;
    }

    const grammarIds = progressRows.map((p) => p.grammarId);
    const grammarRows = await db.select().from(grammarPatterns)
      .where(inArray(grammarPatterns.id, grammarIds));
    const grammarMap = new Map(grammarRows.map((g) => [g.id, g]));

    const items: GrammarPracticeItem[] = [];
    for (const prog of progressRows) {
      const gp = grammarMap.get(prog.grammarId);
      if (!gp) continue;
      const examples = await this._getExamples(gp.id);
      items.push(this._buildExercise(gp, prog.mastery as MasteryLevel, examples));
    }
    return items;
  },

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  async _hydrate(row: typeof grammarPatterns.$inferSelect, learnerId?: string): Promise<GrammarPatternView> {
    const examples = await this._getExamples(row.id);

    // Related patterns: same or adjacent JLPT level, excluding self
    const jlpt = row.jlptLevel ?? 5;
    const related = await db.select({
      id: grammarPatterns.id,
      slug: grammarPatterns.slug,
      title: grammarPatterns.title,
      meaning: grammarPatterns.meaning,
      jlptLevel: grammarPatterns.jlptLevel,
    }).from(grammarPatterns)
      .where(and(
        not(eq(grammarPatterns.id, row.id)),
        sql`${grammarPatterns.jlptLevel} BETWEEN ${jlpt - 1} AND ${jlpt + 1}`,
      ))
      .orderBy(asc(grammarPatterns.difficulty))
      .limit(5);

    let progress: GrammarProgressView | null = null;
    let isBookmarked = false;
    if (learnerId) {
      const [prog] = await db.select().from(grammarProgress)
        .where(and(eq(grammarProgress.learnerId, learnerId), eq(grammarProgress.grammarId, row.id)))
        .limit(1);
      if (prog) {
        progress = {
          mastery: prog.mastery as MasteryLevel,
          recognitionAccuracy: prog.recognitionAccuracy,
          productionAccuracy: prog.productionAccuracy,
          encounterCount: prog.encounterCount,
          correctCount: prog.correctCount,
          incorrectCount: prog.incorrectCount,
        };
      }
      const [bm] = await db.select().from(userBookmarks).where(
        and(eq(userBookmarks.learnerId, learnerId), eq(userBookmarks.targetType, "grammar_pattern"), eq(userBookmarks.targetId, row.id)),
      ).limit(1);
      isBookmarked = !!bm;
    }

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      titleJa: row.titleJa,
      jlptLevel: row.jlptLevel,
      structure: row.structure,
      meaning: row.meaning,
      explanation: row.explanation,
      notes: row.notes,
      formation: row.formation,
      difficulty: row.difficulty,
      tags: row.tags,
      examples,
      relatedPatterns: related,
      progress,
      isBookmarked,
    };
  },

  async _getExamples(grammarId: string): Promise<{ ja: string; en: string }[]> {
    const rows = await db.select({ ja: grammarExamples.ja, en: grammarExamples.en })
      .from(grammarExamples)
      .where(eq(grammarExamples.grammarId, grammarId))
      .orderBy(asc(grammarExamples.position));
    return rows;
  },

  async _getProgress(learnerId: string, grammarId: string) {
    const [row] = await db.select().from(grammarProgress)
      .where(and(eq(grammarProgress.learnerId, learnerId), eq(grammarProgress.grammarId, grammarId)))
      .limit(1);
    return row ?? null;
  },

  _buildExercise(
    gp: typeof grammarPatterns.$inferSelect,
    mastery: MasteryLevel,
    examples: { ja: string; en: string }[],
  ): GrammarPracticeItem {
    let type: GrammarPracticeItem["exercise"]["type"];
    let prompt: string;
    let answer: string;
    let options: string[];
    let explanation: string | null = null;

    const allMeanings = ["is, am, are (polite)", "as for ~", "subject marker", "object marker",
      "to, at, in", "and, then", "want to ~", "if, when", "if (conditional)", "it seems"];

    if (mastery === "unseen" || mastery === "introduced") {
      // Recognition: show pattern, pick meaning
      type = "meaning_from_pattern";
      prompt = `${gp.title}  (${gp.structure})`;
      answer = gp.meaning;
      options = allMeanings.filter((m) => m !== gp.meaning).sort(() => Math.random() - 0.5).slice(0, 3);
      options.push(answer);
      options.sort(() => Math.random() - 0.5);
    } else if (mastery === "practicing" && examples.length > 0) {
      // Fill sentence: show example with pattern blanked
      type = "fill_sentence";
      const ex = examples[0]!;
      prompt = ex.en;
      answer = gp.title;
      options = [gp.title, "〜ている", "〜ません", "〜ましょう"].sort(() => Math.random() - 0.5);
      explanation = ex.ja;
    } else if (examples.length > 0) {
      // Choose correct example
      type = "choose_example";
      prompt = `Which sentence uses ${gp.title} correctly?`;
      answer = examples[0]!.ja;
      options = [
        examples[0]!.ja,
        "昨日は楽しいでした。",
        "私は猫を好きです。",
        "東京に行くをしたい。",
      ].sort(() => Math.random() - 0.5);
      explanation = examples[0]!.en;
    } else {
      // Fallback: meaning from pattern
      type = "pattern_from_meaning";
      prompt = gp.meaning;
      answer = gp.title;
      options = ["です", "は", "が", "を", "に", "〜て", "〜たい", "〜たら", "〜ば", "〜らしい"]
        .filter((t) => t !== gp.title).sort(() => Math.random() - 0.5).slice(0, 3);
      options.push(answer);
      options.sort(() => Math.random() - 0.5);
    }

    return {
      grammarId: gp.id,
      title: gp.title,
      structure: gp.structure,
      meaning: gp.meaning,
      mastery,
      exercise: { type, prompt, answer, options, explanation },
    };
  },
};
