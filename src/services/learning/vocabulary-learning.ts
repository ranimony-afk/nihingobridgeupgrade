/**
 * VocabularyLearning — Domain service for learner vocabulary interactions.
 *
 * P36: User can learn, mark known, favorite, review, practice.
 *
 * Five actions:
 *   1. learn     — introduce a word (sets mastery to "introduced", records encounter)
 *   2. markKnown — mark a word as already known (jumps to "mastered")
 *   3. favorite  — toggle bookmark for quick access
 *   4. review    — record a review attempt (correct/incorrect, updates mastery)
 *   5. practice  — generate a practice set from due/weak words
 */

import { eq, and, asc, desc, sql, inArray, not, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  vocabularyProgress,
  dictionaryEntries,
  dictionarySenses,
  userBookmarks,
} from "@/db/schema";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type MasteryLevel = "unseen" | "introduced" | "practicing" | "familiar" | "mastered";

export interface VocabProgressView {
  id: string;
  entryId: string;
  mastery: MasteryLevel;
  encounterCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number | null;
  lastSeenAt: Date | null;
  introducedAt: Date | null;
  masteredAt: Date | null;
  /** Enriched entry data */
  word: string;
  reading: string;
  meaning: string;
  jlptLevel: number | null;
  isBookmarked: boolean;
}

export interface PracticeItem {
  entryId: string;
  word: string;
  reading: string;
  meanings: string[];
  pos: string[] | null;
  mastery: MasteryLevel;
  accuracy: number | null;
  /** Exercise for this item */
  exercise: {
    type: "recall_meaning" | "recall_reading" | "recognize";
    prompt: string;
    answer: string;
    options: string[];
  };
}

export interface PracticeSet {
  learnerId: string;
  items: PracticeItem[];
  totalItems: number;
  /** Breakdown of mastery levels in the set */
  breakdown: Record<MasteryLevel, number>;
}

export interface ReviewResult {
  entryId: string;
  correct: boolean;
  previousMastery: MasteryLevel;
  newMastery: MasteryLevel;
  encounterCount: number;
  accuracy: number;
}

export interface VocabStats {
  total: number;
  unseen: number;
  introduced: number;
  practicing: number;
  familiar: number;
  mastered: number;
  bookmarked: number;
  averageAccuracy: number | null;
}

// ─────────────────────────────────────────────
// Mastery progression logic
// ─────────────────────────────────────────────

const MASTERY_ORDER: MasteryLevel[] = ["unseen", "introduced", "practicing", "familiar", "mastered"];

function advanceMastery(current: MasteryLevel, correct: boolean, accuracy: number): MasteryLevel {
  const idx = MASTERY_ORDER.indexOf(current);

  if (correct) {
    // Advance if accuracy is high enough
    if (accuracy >= 0.9 && idx < 4) return MASTERY_ORDER[idx + 1]!;
    if (accuracy >= 0.7 && idx < 3) return MASTERY_ORDER[Math.min(idx + 1, 3)]!;
    return current;
  } else {
    // Regress on incorrect (but never below "introduced")
    if (idx > 1) return MASTERY_ORDER[idx - 1]!;
    return current;
  }
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const VocabularyLearning = {

  /**
   * 1. LEARN — Introduce a word to the learner.
   * Creates or updates vocabulary_progress record.
   */
  async learn(learnerId: string, entryId: string): Promise<VocabProgressView> {
    const existing = await this._getProgress(learnerId, entryId);

    if (existing) {
      // Already learning — record encounter
      await db.update(vocabularyProgress).set({
        encounterCount: existing.encounterCount + 1,
        lastSeenAt: new Date(),
        mastery: existing.mastery === "unseen" ? "introduced" : existing.mastery,
        introducedAt: existing.introducedAt ?? new Date(),
        updatedAt: new Date(),
      }).where(eq(vocabularyProgress.id, existing.id));
    } else {
      // First encounter
      await db.insert(vocabularyProgress).values({
        id: genId("vp"),
        learnerId,
        entryId,
        mastery: "introduced",
        encounterCount: 1,
        correctCount: 0,
        incorrectCount: 0,
        introducedAt: new Date(),
        lastSeenAt: new Date(),
      });
    }

    return this._getProgressView(learnerId, entryId);
  },

  /**
   * 2. MARK KNOWN — Jump a word directly to "mastered".
   * For words the learner already knows before the course teaches them.
   */
  async markKnown(learnerId: string, entryId: string): Promise<VocabProgressView> {
    const existing = await this._getProgress(learnerId, entryId);
    const now = new Date();

    if (existing) {
      await db.update(vocabularyProgress).set({
        mastery: "mastered",
        masteredAt: existing.masteredAt ?? now,
        lastSeenAt: now,
        updatedAt: now,
      }).where(eq(vocabularyProgress.id, existing.id));
    } else {
      await db.insert(vocabularyProgress).values({
        id: genId("vp"),
        learnerId,
        entryId,
        mastery: "mastered",
        encounterCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        introducedAt: now,
        masteredAt: now,
        lastSeenAt: now,
      });
    }

    return this._getProgressView(learnerId, entryId);
  },

  /**
   * 3. FAVORITE — Toggle bookmark on a word.
   */
  async toggleFavorite(learnerId: string, entryId: string): Promise<{ bookmarked: boolean }> {
    const existing = await db.select().from(userBookmarks).where(
      and(
        eq(userBookmarks.learnerId, learnerId),
        eq(userBookmarks.targetType, "dictionary_entry"),
        eq(userBookmarks.targetId, entryId),
      ),
    ).limit(1);

    if (existing.length > 0) {
      await db.delete(userBookmarks).where(eq(userBookmarks.id, existing[0]!.id));
      return { bookmarked: false };
    } else {
      await db.insert(userBookmarks).values({
        id: genId("bk"),
        learnerId,
        targetType: "dictionary_entry",
        targetId: entryId,
      });
      return { bookmarked: true };
    }
  },

  /**
   * 4. REVIEW — Record a correct/incorrect review of a word.
   * Updates mastery level, encounter counts, and accuracy.
   */
  async review(learnerId: string, entryId: string, correct: boolean): Promise<ReviewResult> {
    let progress = await this._getProgress(learnerId, entryId);
    const now = new Date();

    if (!progress) {
      // Auto-create progress if reviewing a word not yet learned
      await db.insert(vocabularyProgress).values({
        id: genId("vp"),
        learnerId,
        entryId,
        mastery: "introduced",
        encounterCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        introducedAt: now,
        lastSeenAt: now,
      });
      progress = (await this._getProgress(learnerId, entryId))!;
    }

    const previousMastery = progress.mastery as MasteryLevel;
    const newCorrect = progress.correctCount + (correct ? 1 : 0);
    const newIncorrect = progress.incorrectCount + (correct ? 0 : 1);
    const newEncounters = progress.encounterCount + 1;
    const accuracy = newCorrect / (newCorrect + newIncorrect);
    const newMastery = advanceMastery(previousMastery, correct, accuracy);

    await db.update(vocabularyProgress).set({
      encounterCount: newEncounters,
      correctCount: newCorrect,
      incorrectCount: newIncorrect,
      accuracy,
      mastery: newMastery,
      lastSeenAt: now,
      masteredAt: newMastery === "mastered" && previousMastery !== "mastered" ? now : progress.masteredAt,
      updatedAt: now,
    }).where(eq(vocabularyProgress.id, progress.id));

    return {
      entryId,
      correct,
      previousMastery,
      newMastery,
      encounterCount: newEncounters,
      accuracy: Math.round(accuracy * 1000) / 1000,
    };
  },

  /**
   * 5. PRACTICE — Generate a practice set from due/weak words.
   * Prioritises: low mastery > low accuracy > least recently seen.
   */
  async practice(learnerId: string, count = 10): Promise<PracticeSet> {
    // Fetch weakest words that have been introduced
    const progressRows = await db.select().from(vocabularyProgress)
      .where(and(
        eq(vocabularyProgress.learnerId, learnerId),
        not(eq(vocabularyProgress.mastery, "unseen")),
        not(eq(vocabularyProgress.mastery, "mastered")),
      ))
      .orderBy(
        asc(vocabularyProgress.accuracy),
        asc(vocabularyProgress.lastSeenAt),
      )
      .limit(count);

    if (progressRows.length === 0) {
      // No progress yet — pick random entries for introduction
      const randomEntries = await db.select().from(dictionaryEntries)
        .orderBy(asc(dictionaryEntries.frequencyRank))
        .limit(count);

      const items: PracticeItem[] = [];
      for (const entry of randomEntries) {
        const meanings = await this._getMeanings(entry.id);
        items.push(this._buildExercise(entry, meanings, "unseen", null));
      }

      return {
        learnerId,
        items,
        totalItems: items.length,
        breakdown: { unseen: items.length, introduced: 0, practicing: 0, familiar: 0, mastered: 0 },
      };
    }

    // Fetch entry data for each progress row
    const entryIds = progressRows.map((r) => r.entryId);
    const entries = await db.select().from(dictionaryEntries)
      .where(inArray(dictionaryEntries.id, entryIds));
    const entryMap = new Map(entries.map((e) => [e.id, e]));

    const items: PracticeItem[] = [];
    const breakdown: Record<MasteryLevel, number> = { unseen: 0, introduced: 0, practicing: 0, familiar: 0, mastered: 0 };

    for (const prog of progressRows) {
      const entry = entryMap.get(prog.entryId);
      if (!entry) continue;
      const meanings = await this._getMeanings(entry.id);
      const mastery = prog.mastery as MasteryLevel;
      breakdown[mastery]++;
      items.push(this._buildExercise(entry, meanings, mastery, prog.accuracy));
    }

    return { learnerId, items, totalItems: items.length, breakdown };
  },

  // ─── Query methods ───

  /** Get all vocabulary progress for a learner, with optional mastery filter. */
  async getAll(learnerId: string, opts?: { mastery?: MasteryLevel; bookmarkedOnly?: boolean; page?: number; pageSize?: number }): Promise<{
    items: VocabProgressView[];
    total: number;
    stats: VocabStats;
  }> {
    const { mastery, bookmarkedOnly, page = 1, pageSize = 50 } = opts ?? {};
    const offset = (page - 1) * pageSize;
    const conds = [eq(vocabularyProgress.learnerId, learnerId)];
    if (mastery) conds.push(eq(vocabularyProgress.mastery, mastery));

    const countRes = await db.select({ count: sql<number>`count(*)::int` }).from(vocabularyProgress).where(and(...conds));
    const total = countRes[0]?.count ?? 0;

    let rows = await db.select().from(vocabularyProgress).where(and(...conds))
      .orderBy(desc(vocabularyProgress.updatedAt)).limit(pageSize).offset(offset);

    if (bookmarkedOnly) {
      const bookmarked = await db.select({ targetId: userBookmarks.targetId }).from(userBookmarks)
        .where(and(eq(userBookmarks.learnerId, learnerId), eq(userBookmarks.targetType, "dictionary_entry")));
      const bmSet = new Set(bookmarked.map((b) => b.targetId));
      rows = rows.filter((r) => bmSet.has(r.entryId));
    }

    const items: VocabProgressView[] = [];
    for (const row of rows) {
      items.push(await this._enrichProgress(row, learnerId));
    }

    const stats = await this._getStats(learnerId);

    return { items, total, stats };
  },

  /** Get stats summary. */
  async getStats(learnerId: string): Promise<VocabStats> {
    return this._getStats(learnerId);
  },

  // ─── Internal ───

  async _getProgress(learnerId: string, entryId: string) {
    const rows = await db.select().from(vocabularyProgress)
      .where(and(eq(vocabularyProgress.learnerId, learnerId), eq(vocabularyProgress.entryId, entryId)))
      .limit(1);
    return rows[0] ?? null;
  },

  async _getProgressView(learnerId: string, entryId: string): Promise<VocabProgressView> {
    const progress = await this._getProgress(learnerId, entryId);
    if (!progress) throw new Error(`No progress for ${entryId}`);
    return this._enrichProgress(progress, learnerId);
  },

  async _enrichProgress(row: typeof vocabularyProgress.$inferSelect, learnerId: string): Promise<VocabProgressView> {
    const [entry] = await db.select().from(dictionaryEntries).where(eq(dictionaryEntries.id, row.entryId)).limit(1);
    const meanings = entry ? await this._getMeanings(entry.id) : [];
    const bm = await db.select().from(userBookmarks).where(
      and(eq(userBookmarks.learnerId, learnerId), eq(userBookmarks.targetType, "dictionary_entry"), eq(userBookmarks.targetId, row.entryId)),
    ).limit(1);

    return {
      id: row.id,
      entryId: row.entryId,
      mastery: row.mastery as MasteryLevel,
      encounterCount: row.encounterCount,
      correctCount: row.correctCount,
      incorrectCount: row.incorrectCount,
      accuracy: row.accuracy,
      lastSeenAt: row.lastSeenAt,
      introducedAt: row.introducedAt,
      masteredAt: row.masteredAt,
      word: entry?.headword ?? "?",
      reading: entry?.reading ?? "?",
      meaning: meanings.join("; "),
      jlptLevel: entry?.jlptLevel ?? null,
      isBookmarked: bm.length > 0,
    };
  },

  async _getMeanings(entryId: string): Promise<string[]> {
    const senses = await db.select({ glosses: dictionarySenses.glosses }).from(dictionarySenses)
      .where(eq(dictionarySenses.entryId, entryId)).orderBy(asc(dictionarySenses.position)).limit(3);
    return senses.flatMap((s) => {
      const g = s.glosses as Record<string, string[]>;
      return g.en ?? Object.values(g).flat();
    }).slice(0, 4);
  },

  async _getStats(learnerId: string): Promise<VocabStats> {
    const rows = await db.select({
      mastery: vocabularyProgress.mastery,
      count: sql<number>`count(*)::int`,
    }).from(vocabularyProgress)
      .where(eq(vocabularyProgress.learnerId, learnerId))
      .groupBy(vocabularyProgress.mastery);

    const map: Record<string, number> = {};
    let total = 0;
    for (const r of rows) { map[r.mastery] = r.count; total += r.count; }

    const accRes = await db.select({
      avg: sql<number>`avg(accuracy)`,
    }).from(vocabularyProgress).where(
      and(eq(vocabularyProgress.learnerId, learnerId), not(isNull(vocabularyProgress.accuracy))),
    );

    const bmCount = await db.select({ count: sql<number>`count(*)::int` }).from(userBookmarks)
      .where(and(eq(userBookmarks.learnerId, learnerId), eq(userBookmarks.targetType, "dictionary_entry")));

    return {
      total,
      unseen: map["unseen"] ?? 0,
      introduced: map["introduced"] ?? 0,
      practicing: map["practicing"] ?? 0,
      familiar: map["familiar"] ?? 0,
      mastered: map["mastered"] ?? 0,
      bookmarked: bmCount[0]?.count ?? 0,
      averageAccuracy: accRes[0]?.avg ? Math.round(Number(accRes[0].avg) * 1000) / 1000 : null,
    };
  },

  _buildExercise(
    entry: typeof dictionaryEntries.$inferSelect,
    meanings: string[],
    mastery: MasteryLevel,
    accuracy: number | null,
  ): PracticeItem {
    const meaning = meanings[0] ?? "?";
    // Vary exercise type by mastery level
    let type: PracticeItem["exercise"]["type"];
    if (mastery === "unseen" || mastery === "introduced") {
      type = "recognize"; // Show word, pick meaning
    } else if (mastery === "practicing") {
      type = "recall_meaning"; // Show reading, type meaning
    } else {
      type = "recall_reading"; // Show meaning, type reading
    }

    // Build distractors for multiple choice
    const distractors = ["to run", "beautiful", "person", "mountain", "big", "small", "new"]
      .filter((d) => d !== meaning)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [...distractors, meaning].sort(() => Math.random() - 0.5);

    let prompt: string;
    let answer: string;
    switch (type) {
      case "recognize":
        prompt = `${entry.headword} (${entry.reading})`;
        answer = meaning;
        break;
      case "recall_meaning":
        prompt = entry.reading;
        answer = meaning;
        break;
      case "recall_reading":
        prompt = meaning;
        answer = entry.reading;
        options.length = 0;
        options.push(entry.reading, "たべる", "のむ", "みる");
        options.sort(() => Math.random() - 0.5);
        break;
    }

    return {
      entryId: entry.id,
      word: entry.headword,
      reading: entry.reading,
      meanings,
      pos: entry.pos,
      mastery,
      accuracy,
      exercise: { type, prompt, answer, options },
    };
  },
};
