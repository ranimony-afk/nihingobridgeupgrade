/**
 * KanjiLearning — Domain service for kanji lookup, learning, and practice.
 *
 * P37: meaning, readings, components, radicals, examples, stroke info, practice.
 */

import { eq, and, asc, desc, sql, ilike, not, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  kanjiEntries,
  kanjiReadings,
  kanjiComponents,
  kanjiComponentLinks,
  kanjiProgress,
  dictionaryEntries,
  userBookmarks,
} from "@/db/schema";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type MasteryLevel = "unseen" | "introduced" | "practicing" | "familiar" | "mastered";

export interface KanjiView {
  id: string;
  character: string;
  unicodeCodepoint: string;
  strokeCount: number;
  grade: number | null;
  jlptLevel: number | null;
  frequencyRank: number | null;
  meanings: string[];
  readings: {
    on: string[];
    kun: string[];
    nanori: string[];
  };
  components: ComponentView[];
  /** Words that use this kanji */
  exampleWords: { id: string; headword: string; reading: string; meaning: string }[];
  /** Stroke data (placeholder until KanjiVG import) */
  strokes: StrokeInfo | null;
  /** Learning progress for this learner (null if not logged in) */
  progress: KanjiProgressView | null;
  isBookmarked: boolean;
}

export interface ComponentView {
  id: string;
  character: string;
  kangxiNumber: number | null;
  strokeCount: number;
  meaning: string | null;
}

export interface StrokeInfo {
  strokeCount: number;
  /** SVG paths per stroke — populated when KanjiVG data is imported */
  paths: string[];
  /** Stroke order animation available? */
  hasAnimation: boolean;
}

export interface KanjiProgressView {
  mastery: MasteryLevel;
  meaningAccuracy: number | null;
  readingAccuracy: number | null;
  encounterCount: number;
  correctCount: number;
  incorrectCount: number;
}

export interface KanjiPracticeItem {
  kanjiId: string;
  character: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  mastery: MasteryLevel;
  exercise: {
    type: "meaning_from_kanji" | "reading_from_kanji" | "kanji_from_meaning";
    prompt: string;
    answer: string;
    options: string[];
  };
}

export interface KanjiReviewResult {
  kanjiId: string;
  correct: boolean;
  previousMastery: MasteryLevel;
  newMastery: MasteryLevel;
  meaningAccuracy: number | null;
  readingAccuracy: number | null;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const KanjiLearning = {

  // ═══════════════════════════════════════════
  // LOOKUP
  // ═══════════════════════════════════════════

  /** Get full kanji detail by character. */
  async getByCharacter(character: string, learnerId?: string): Promise<KanjiView | null> {
    const [row] = await db.select().from(kanjiEntries)
      .where(eq(kanjiEntries.character, character)).limit(1);
    if (!row) return null;
    return this._hydrate(row, learnerId);
  },

  /** Get full kanji detail by ID. */
  async getById(id: string, learnerId?: string): Promise<KanjiView | null> {
    const [row] = await db.select().from(kanjiEntries)
      .where(eq(kanjiEntries.id, id)).limit(1);
    if (!row) return null;
    return this._hydrate(row, learnerId);
  },

  /** Search kanji by meaning, reading, or character. */
  async search(query: string, opts?: { jlpt?: number; grade?: number; limit?: number }): Promise<KanjiView[]> {
    const limit = opts?.limit ?? 20;
    const conds = [];

    if (/[\u4E00-\u9FFF]/.test(query)) {
      conds.push(eq(kanjiEntries.character, query));
    } else if (/[\u3040-\u30FF]/.test(query)) {
      // Kana → search readings
      conds.push(sql`EXISTS (
        SELECT 1 FROM ${kanjiReadings}
        WHERE ${kanjiReadings.kanjiId} = ${kanjiEntries.id}
        AND ${kanjiReadings.reading} ILIKE ${"%" + query + "%"}
      )`);
    } else {
      // English → search meanings array
      conds.push(sql`array_to_string(${kanjiEntries.meanings}, ' ') ILIKE ${"%" + query + "%"}`);
    }

    if (opts?.jlpt) conds.push(eq(kanjiEntries.jlptLevel, opts.jlpt));
    if (opts?.grade) conds.push(eq(kanjiEntries.grade, opts.grade));

    const rows = await db.select().from(kanjiEntries)
      .where(and(...conds))
      .orderBy(asc(kanjiEntries.frequencyRank))
      .limit(limit);

    return Promise.all(rows.map((r) => this._hydrate(r)));
  },

  /** List kanji by JLPT level. */
  async getByJlpt(level: number): Promise<KanjiView[]> {
    const rows = await db.select().from(kanjiEntries)
      .where(eq(kanjiEntries.jlptLevel, level))
      .orderBy(asc(kanjiEntries.frequencyRank));
    return Promise.all(rows.map((r) => this._hydrate(r)));
  },

  /** List kanji that use a specific radical. */
  async getByRadical(radicalId: string): Promise<KanjiView[]> {
    const links = await db.select({ kanjiId: kanjiComponentLinks.kanjiId })
      .from(kanjiComponentLinks)
      .where(eq(kanjiComponentLinks.componentId, radicalId));

    if (links.length === 0) return [];
    const kanjiIds = links.map((l) => l.kanjiId);
    const rows = await db.select().from(kanjiEntries)
      .where(inArray(kanjiEntries.id, kanjiIds))
      .orderBy(asc(kanjiEntries.strokeCount));
    return Promise.all(rows.map((r) => this._hydrate(r)));
  },

  /** List all radicals/components. */
  async listRadicals(): Promise<ComponentView[]> {
    const rows = await db.select().from(kanjiComponents)
      .orderBy(asc(kanjiComponents.kangxiNumber));
    return rows.map((r) => ({
      id: r.id,
      character: r.character,
      kangxiNumber: r.kangxiNumber,
      strokeCount: r.strokeCount,
      meaning: r.meaning,
    }));
  },

  // ═══════════════════════════════════════════
  // LEARNING + REVIEW
  // ═══════════════════════════════════════════

  /** Record a kanji review (meaning or reading). */
  async review(
    learnerId: string,
    kanjiId: string,
    correct: boolean,
    reviewType: "meaning" | "reading",
  ): Promise<KanjiReviewResult> {
    let progress = await this._getProgress(learnerId, kanjiId);
    const now = new Date();

    if (!progress) {
      await db.insert(kanjiProgress).values({
        id: genId("kp"),
        learnerId,
        kanjiId,
        mastery: "introduced",
        encounterCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        introducedAt: now,
        lastSeenAt: now,
      });
      progress = (await this._getProgress(learnerId, kanjiId))!;
    }

    const prev = progress.mastery as MasteryLevel;
    const newCorrect = progress.correctCount + (correct ? 1 : 0);
    const newIncorrect = progress.incorrectCount + (correct ? 0 : 1);
    const totalAcc = newCorrect / (newCorrect + newIncorrect);

    // Update type-specific accuracy
    const meaningAcc = reviewType === "meaning"
      ? (correct ? Math.min((progress.meaningAccuracy ?? 0) + 0.15, 1) : Math.max((progress.meaningAccuracy ?? 0.5) - 0.2, 0))
      : progress.meaningAccuracy;
    const readingAcc = reviewType === "reading"
      ? (correct ? Math.min((progress.readingAccuracy ?? 0) + 0.15, 1) : Math.max((progress.readingAccuracy ?? 0.5) - 0.2, 0))
      : progress.readingAccuracy;

    // Mastery progression
    const MASTERY_ORDER: MasteryLevel[] = ["unseen", "introduced", "practicing", "familiar", "mastered"];
    const idx = MASTERY_ORDER.indexOf(prev);
    let newMastery = prev;
    if (correct && totalAcc >= 0.85 && idx < 4) newMastery = MASTERY_ORDER[idx + 1]!;
    else if (!correct && idx > 1) newMastery = MASTERY_ORDER[idx - 1]!;

    await db.update(kanjiProgress).set({
      encounterCount: progress.encounterCount + 1,
      correctCount: newCorrect,
      incorrectCount: newIncorrect,
      mastery: newMastery,
      meaningAccuracy: meaningAcc,
      readingAccuracy: readingAcc,
      lastSeenAt: now,
      masteredAt: newMastery === "mastered" && prev !== "mastered" ? now : progress.masteredAt,
      updatedAt: now,
    }).where(eq(kanjiProgress.id, progress.id));

    return {
      kanjiId,
      correct,
      previousMastery: prev,
      newMastery,
      meaningAccuracy: meaningAcc ? Math.round(meaningAcc * 1000) / 1000 : null,
      readingAccuracy: readingAcc ? Math.round(readingAcc * 1000) / 1000 : null,
    };
  },

  /** Generate a kanji practice set. */
  async practice(learnerId: string, count = 10): Promise<KanjiPracticeItem[]> {
    // Fetch weakest kanji the learner has encountered
    let progressRows = await db.select().from(kanjiProgress)
      .where(and(
        eq(kanjiProgress.learnerId, learnerId),
        not(eq(kanjiProgress.mastery, "mastered")),
      ))
      .orderBy(asc(kanjiProgress.mastery), asc(kanjiProgress.lastSeenAt))
      .limit(count);

    // If no progress yet, grab common kanji for introduction
    if (progressRows.length === 0) {
      const fresh = await db.select().from(kanjiEntries)
        .where(eq(kanjiEntries.jlptLevel, 5))
        .orderBy(asc(kanjiEntries.frequencyRank))
        .limit(count);

      return fresh.map((k) => this._buildKanjiExercise(k, "unseen"));
    }

    const kanjiIds = progressRows.map((p) => p.kanjiId);
    const kanjiRows = await db.select().from(kanjiEntries)
      .where(inArray(kanjiEntries.id, kanjiIds));
    const kanjiMap = new Map(kanjiRows.map((k) => [k.id, k]));

    return progressRows
      .map((p) => {
        const k = kanjiMap.get(p.kanjiId);
        if (!k) return null;
        return this._buildKanjiExercise(k, p.mastery as MasteryLevel);
      })
      .filter((x): x is KanjiPracticeItem => x !== null);
  },

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  async _hydrate(row: typeof kanjiEntries.$inferSelect, learnerId?: string): Promise<KanjiView> {
    // Readings
    const readingRows = await db.select().from(kanjiReadings)
      .where(eq(kanjiReadings.kanjiId, row.id));
    const readings = {
      on: readingRows.filter((r) => r.kind === "on").map((r) => r.reading),
      kun: readingRows.filter((r) => r.kind === "kun").map((r) => r.reading),
      nanori: readingRows.filter((r) => r.kind === "nanori").map((r) => r.reading),
    };

    // Components
    const compLinks = await db.select({ componentId: kanjiComponentLinks.componentId })
      .from(kanjiComponentLinks)
      .where(eq(kanjiComponentLinks.kanjiId, row.id));
    let components: ComponentView[] = [];
    if (compLinks.length > 0) {
      const compRows = await db.select().from(kanjiComponents)
        .where(inArray(kanjiComponents.id, compLinks.map((c) => c.componentId)));
      components = compRows.map((c) => ({
        id: c.id,
        character: c.character,
        kangxiNumber: c.kangxiNumber,
        strokeCount: c.strokeCount,
        meaning: c.meaning,
      }));
    }

    // Example words containing this kanji
    const exampleWords = await db.select({
      id: dictionaryEntries.id,
      headword: dictionaryEntries.headword,
      reading: dictionaryEntries.reading,
    }).from(dictionaryEntries)
      .where(ilike(dictionaryEntries.headword, `%${row.character}%`))
      .orderBy(asc(dictionaryEntries.frequencyRank))
      .limit(8);

    // Enrich example words with first meaning
    const enrichedExamples = exampleWords.map((w) => ({
      ...w,
      meaning: "", // Will be filled below
    }));

    // Stroke info placeholder
    const strokes: StrokeInfo = {
      strokeCount: row.strokeCount,
      paths: [],
      hasAnimation: false,
    };

    // Progress
    let progress: KanjiProgressView | null = null;
    let isBookmarked = false;
    if (learnerId) {
      const [prog] = await db.select().from(kanjiProgress)
        .where(and(eq(kanjiProgress.learnerId, learnerId), eq(kanjiProgress.kanjiId, row.id)))
        .limit(1);
      if (prog) {
        progress = {
          mastery: prog.mastery as MasteryLevel,
          meaningAccuracy: prog.meaningAccuracy,
          readingAccuracy: prog.readingAccuracy,
          encounterCount: prog.encounterCount,
          correctCount: prog.correctCount,
          incorrectCount: prog.incorrectCount,
        };
      }
      const [bm] = await db.select().from(userBookmarks).where(
        and(eq(userBookmarks.learnerId, learnerId), eq(userBookmarks.targetType, "kanji_entry"), eq(userBookmarks.targetId, row.id)),
      ).limit(1);
      isBookmarked = !!bm;
    }

    return {
      id: row.id,
      character: row.character,
      unicodeCodepoint: row.unicodeCodepoint,
      strokeCount: row.strokeCount,
      grade: row.grade,
      jlptLevel: row.jlptLevel,
      frequencyRank: row.frequencyRank,
      meanings: row.meanings,
      readings,
      components,
      exampleWords: enrichedExamples,
      strokes,
      progress,
      isBookmarked,
    };
  },

  async _getProgress(learnerId: string, kanjiId: string) {
    const [row] = await db.select().from(kanjiProgress)
      .where(and(eq(kanjiProgress.learnerId, learnerId), eq(kanjiProgress.kanjiId, kanjiId)))
      .limit(1);
    return row ?? null;
  },

  _buildKanjiExercise(k: typeof kanjiEntries.$inferSelect, mastery: MasteryLevel): KanjiPracticeItem {
    const meaning = k.meanings[0] ?? "?";
    const onReading = k.onReadings?.[0] ?? "";
    const kunReading = k.kunReadings?.[0] ?? "";

    let type: KanjiPracticeItem["exercise"]["type"];
    let prompt: string;
    let answer: string;

    if (mastery === "unseen" || mastery === "introduced") {
      type = "meaning_from_kanji";
      prompt = k.character;
      answer = meaning;
    } else if (mastery === "practicing") {
      type = "reading_from_kanji";
      prompt = k.character;
      answer = onReading || kunReading;
    } else {
      type = "kanji_from_meaning";
      prompt = meaning;
      answer = k.character;
    }

    const distractors = ["fire", "water", "tree", "gold", "earth", "moon", "sun", "big"]
      .filter((d) => d !== answer && d !== meaning)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [...distractors, answer].sort(() => Math.random() - 0.5);

    return {
      kanjiId: k.id,
      character: k.character,
      meanings: k.meanings,
      onReadings: k.onReadings ?? [],
      kunReadings: k.kunReadings ?? [],
      mastery,
      exercise: { type, prompt, answer, options },
    };
  },
};
