/**
 * Original Learning Tools Engine (Phase 8)
 *
 * Implements original algorithms and utilities for:
 *  - Spaced Repetition (SRS SM-2 algorithm)
 *  - Vocabulary Extraction from reading passages
 *  - Matching game shuffler
 *  - Gamification (XP, Streaks, Achievements)
 *  - Audio pronunciation helpers
 */

/* ------------------------------------------------------------------ */
/* 1. Spaced Repetition System (SuperMemo-2 / SM-2)                   */
/* ------------------------------------------------------------------ */

export interface SrsCalculationInput {
  quality: number; // 0 (blackout) to 5 (perfect response)
  repetitions: number;
  easeFactor: number; // stored as integer * 100 (e.g. 250 = 2.50)
  intervalDays: number;
}

export interface SrsCalculationResult {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewDate: Date;
}

export function calculateSrs(input: SrsCalculationInput): SrsCalculationResult {
  const q = Math.max(0, Math.min(5, input.quality));
  let repetitions = input.repetitions;
  let easeFactor = input.easeFactor / 100;
  let interval = input.intervalDays;

  if (q >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  // SM-2 Ease Factor calculation formula
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    repetitions,
    easeFactor: Math.round(easeFactor * 100),
    intervalDays: interval,
    nextReviewDate,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Vocabulary & Furigana Extraction Parser                         */
/* ------------------------------------------------------------------ */

export interface ExtractedVocab {
  japanese: string;
  furigana: string;
  meaning: string;
}

export function extractVocabularyFromText(text: string): ExtractedVocab[] {
  // Original parser for bracketed Japanese vocab: [漢字|かんじ|kanji]
  const pattern = /\[([^|]+)\|([^|]+)\|([^\]]+)\]/g;
  const results: ExtractedVocab[] = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    results.push({
      japanese: match[1],
      furigana: match[2],
      meaning: match[3],
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/* 3. Matching Game Generator                                         */
/* ------------------------------------------------------------------ */

export interface MatchingCard {
  id: string;
  text: string;
  pairId: number;
  type: "japanese" | "meaning";
}

export function generateMatchingGame(
  items: Array<{ id: number; japanese: string; meaning: string }>,
): MatchingCard[] {
  const cards: MatchingCard[] = [];

  for (const item of items) {
    cards.push({ id: `ja-${item.id}`, text: item.japanese, pairId: item.id, type: "japanese" });
    cards.push({ id: `en-${item.id}`, text: item.meaning, pairId: item.id, type: "meaning" });
  }

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards;
}

/* ------------------------------------------------------------------ */
/* 4. Gamification (XP, Streaks, Achievements)                        */
/* ------------------------------------------------------------------ */

export interface GamificationState {
  xp: number;
  streakDays: number;
  achievements: string[];
}

export function awardXp(current: GamificationState, xpGained: number): GamificationState {
  const newXp = current.xp + xpGained;
  const unlocked = [...current.achievements];

  if (newXp >= 100 && !unlocked.includes("First 100 XP")) {
    unlocked.push("First 100 XP");
  }
  if (newXp >= 500 && !unlocked.includes("JLPT Master")) {
    unlocked.push("JLPT Master");
  }

  return {
    xp: newXp,
    streakDays: current.streakDays,
    achievements: unlocked,
  };
}
