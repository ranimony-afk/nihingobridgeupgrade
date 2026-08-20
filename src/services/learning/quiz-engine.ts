/**
 * QuizEngine — Reusable question type system.
 *
 * P39: Creates, renders, and grades 8 question types:
 *   1. multiple_choice    — pick one correct answer from options
 *   2. type_answer        — type the answer (with accepted variants)
 *   3. reading            — given kanji/word, produce reading
 *   4. listening          — listen to audio, type/select what you hear
 *   5. matching           — match pairs (left↔right)
 *   6. fill_blank         — complete a sentence with missing word
 *   7. translation        — translate between Japanese and English
 *   8. kanji_recognition  — identify kanji meaning, reading, or character
 *
 * Each type has: generate, render (client-safe), grade.
 * The engine is used by LessonPlayer, PracticeTests, and VocabularyLearning.
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type QuestionType =
  | "multiple_choice"
  | "type_answer"
  | "reading"
  | "listening"
  | "matching"
  | "fill_blank"
  | "translation"
  | "kanji_recognition";

/** Full question with answer (server-side). */
export interface Question {
  id: string;
  type: QuestionType;
  /** What the learner sees. */
  prompt: string;
  /** Japanese prompt if applicable. */
  promptJa: string | null;
  /** Hint text (shown after first wrong attempt or on request). */
  hint: string | null;
  /** Audio URL for listening questions. */
  audioUrl: string | null;
  /** Image URL for visual questions. */
  imageUrl: string | null;
  /** Options for selection-based types. */
  options: string[] | null;
  /** Pairs for matching type: [[left, right], ...] */
  pairs: [string, string][] | null;
  /** Blank position and sentence for fill_blank. */
  sentence: string | null;
  /** The correct answer (NOT sent to client). */
  answer: string | string[];
  /** Additional accepted answers. */
  accepted: string[];
  /** Explanation shown after grading. */
  explanation: string | null;
  /** Points for this question. */
  points: number;
  /** Knowledge reference for analytics. */
  knowledgeRef: string | null;
  /** Tags for categorization. */
  tags: string[];
}

/** Client-safe question (answer stripped). */
export interface QuestionRendered {
  id: string;
  type: QuestionType;
  prompt: string;
  promptJa: string | null;
  hint: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  options: string[] | null;
  pairs: [string, string][] | null;
  sentence: string | null;
  points: number;
  tags: string[];
}

/** Result of grading a single answer. */
export interface GradeResult {
  questionId: string;
  type: QuestionType;
  correct: boolean;
  pointsEarned: number;
  pointsPossible: number;
  correctAnswer: string | string[];
  userAnswer: unknown;
  explanation: string | null;
}

/** Batch grading result. */
export interface QuizGradeResult {
  totalQuestions: number;
  correctCount: number;
  score: number; // 0-100
  totalPoints: number;
  earnedPoints: number;
  grades: GradeResult[];
}

/** Input data for generating questions from knowledge. */
export interface QuestionSeed {
  /** The word/kanji/grammar to test. */
  target: string;
  /** Reading in kana. */
  reading?: string;
  /** English meaning(s). */
  meanings: string[];
  /** Part of speech tags. */
  pos?: string[];
  /** Knowledge entity ID. */
  knowledgeRef?: string;
  /** JLPT level. */
  jlpt?: number;
}

// ─────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────

function normalize(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[。、！？.!?,\s]+/g, "")
    .replace(/\u3000/g, ""); // fullwidth space
}

function answersMatch(user: string, correct: string, accepted: string[]): boolean {
  const nu = normalize(user);
  if (nu === normalize(correct)) return true;
  return accepted.some((a) => nu === normalize(a));
}

// ─────────────────────────────────────────────
// Distractor pool (for generating wrong options)
// ─────────────────────────────────────────────

const MEANING_DISTRACTORS = [
  "to run", "to sleep", "beautiful", "person", "mountain", "big", "small",
  "new", "old", "fast", "slow", "to buy", "to sell", "to read", "to write",
  "water", "fire", "tree", "flower", "rain", "wind", "sky", "sea",
  "school", "house", "car", "book", "friend", "child", "dog", "cat",
];

const READING_DISTRACTORS = [
  "たべる", "のむ", "みる", "いく", "くる", "する", "ある", "いる",
  "おおきい", "ちいさい", "あたらしい", "ふるい", "はやい", "おそい",
  "やま", "かわ", "うみ", "そら", "ほん", "いえ", "みち", "まち",
];

const KANJI_DISTRACTORS = [
  "日", "月", "火", "水", "木", "金", "土", "人", "大", "小",
  "山", "川", "上", "下", "中", "出", "入", "口", "目", "手",
];

function pickDistractors(pool: string[], correct: string, count: number): string[] {
  return pool
    .filter((d) => normalize(d) !== normalize(correct))
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

function shuffleWithAnswer(distractors: string[], answer: string): string[] {
  return [...distractors, answer].sort(() => Math.random() - 0.5);
}

// ─────────────────────────────────────────────
// QuizEngine
// ─────────────────────────────────────────────

export const QuizEngine = {

  // ═══════════════════════════════════════════
  // GENERATE — Create questions from seed data
  // ═══════════════════════════════════════════

  /** Generate a multiple choice question. */
  multipleChoice(id: string, seed: QuestionSeed): Question {
    const meaning = seed.meanings[0] ?? "?";
    const distractors = pickDistractors(MEANING_DISTRACTORS, meaning, 3);
    return {
      id, type: "multiple_choice",
      prompt: `What does 「${seed.target}」 mean?`,
      promptJa: seed.target,
      hint: seed.reading ? `Reading: ${seed.reading}` : null,
      audioUrl: null, imageUrl: null,
      options: shuffleWithAnswer(distractors, meaning),
      pairs: null, sentence: null,
      answer: meaning, accepted: seed.meanings.slice(1),
      explanation: `${seed.target}${seed.reading ? ` (${seed.reading})` : ""} means "${meaning}".`,
      points: 1, knowledgeRef: seed.knowledgeRef ?? null,
      tags: seed.pos ?? [],
    };
  },

  /** Generate a type-the-answer question. */
  typeAnswer(id: string, seed: QuestionSeed, direction: "en_to_ja" | "ja_to_en" = "en_to_ja"): Question {
    if (direction === "en_to_ja") {
      return {
        id, type: "type_answer",
        prompt: `Type the Japanese for: "${seed.meanings[0]}"`,
        promptJa: null,
        hint: seed.reading ? `Hint: ${seed.reading.slice(0, 2)}...` : null,
        audioUrl: null, imageUrl: null,
        options: null, pairs: null, sentence: null,
        answer: seed.target,
        accepted: seed.reading ? [seed.reading, seed.target] : [seed.target],
        explanation: `The answer is ${seed.target}${seed.reading ? ` (${seed.reading})` : ""}.`,
        points: 2, knowledgeRef: seed.knowledgeRef ?? null,
        tags: ["production", ...(seed.pos ?? [])],
      };
    } else {
      return {
        id, type: "type_answer",
        prompt: `Type the English meaning of 「${seed.target}」`,
        promptJa: seed.target,
        hint: null,
        audioUrl: null, imageUrl: null,
        options: null, pairs: null, sentence: null,
        answer: seed.meanings[0] ?? "?",
        accepted: seed.meanings,
        explanation: `${seed.target} means "${seed.meanings.join(", ")}".`,
        points: 2, knowledgeRef: seed.knowledgeRef ?? null,
        tags: ["recall", ...(seed.pos ?? [])],
      };
    }
  },

  /** Generate a reading question (given word → type reading). */
  reading(id: string, seed: QuestionSeed): Question {
    const distractors = pickDistractors(READING_DISTRACTORS, seed.reading ?? "", 3);
    return {
      id, type: "reading",
      prompt: `What is the reading of 「${seed.target}」?`,
      promptJa: seed.target,
      hint: `Meaning: ${seed.meanings[0]}`,
      audioUrl: null, imageUrl: null,
      options: seed.reading ? shuffleWithAnswer(distractors, seed.reading) : null,
      pairs: null, sentence: null,
      answer: seed.reading ?? seed.target,
      accepted: [],
      explanation: `${seed.target} is read as ${seed.reading ?? seed.target}.`,
      points: 1, knowledgeRef: seed.knowledgeRef ?? null,
      tags: ["reading", ...(seed.pos ?? [])],
    };
  },

  /** Generate a listening question (audio → type what you hear). */
  listening(id: string, seed: QuestionSeed, audioUrl: string): Question {
    return {
      id, type: "listening",
      prompt: "Listen and type what you hear.",
      promptJa: null,
      hint: `Meaning: ${seed.meanings[0]}`,
      audioUrl,
      imageUrl: null,
      options: null, pairs: null, sentence: null,
      answer: seed.target,
      accepted: seed.reading ? [seed.reading, seed.target] : [seed.target],
      explanation: `The audio says ${seed.target}${seed.reading ? ` (${seed.reading})` : ""} — "${seed.meanings[0]}".`,
      points: 2, knowledgeRef: seed.knowledgeRef ?? null,
      tags: ["listening", ...(seed.pos ?? [])],
    };
  },

  /** Generate a matching question from multiple seeds. */
  matching(id: string, seeds: QuestionSeed[]): Question {
    const pairs: [string, string][] = seeds.map((s) => [s.target, s.meanings[0] ?? "?"]);
    // Shuffle the right column for the client display
    const shuffledPairs: [string, string][] = pairs.map(([l]) => [l, "?"]);
    return {
      id, type: "matching",
      prompt: "Match the Japanese words with their English meanings.",
      promptJa: null,
      hint: null,
      audioUrl: null, imageUrl: null,
      options: null,
      pairs,
      sentence: null,
      answer: pairs.map(([l, r]) => `${l}=${r}`),
      accepted: [],
      explanation: pairs.map(([l, r]) => `${l} = ${r}`).join(", "),
      points: pairs.length,
      knowledgeRef: null,
      tags: ["matching"],
    };
  },

  /** Generate a fill-in-the-blank question. */
  fillBlank(id: string, sentence: string, blank: string, meaning: string): Question {
    const withBlank = sentence.replace(blank, "＿＿＿");
    const distractors = pickDistractors(
      ["は", "が", "を", "に", "で", "と", "も", "から", "まで", "より", "ので", "のに"],
      blank, 3,
    );
    return {
      id, type: "fill_blank",
      prompt: `Complete the sentence:`,
      promptJa: withBlank,
      hint: meaning,
      audioUrl: null, imageUrl: null,
      options: shuffleWithAnswer(distractors, blank),
      pairs: null,
      sentence: withBlank,
      answer: blank,
      accepted: [],
      explanation: `The complete sentence is: ${sentence} — "${meaning}"`,
      points: 1, knowledgeRef: null,
      tags: ["grammar", "fill_blank"],
    };
  },

  /** Generate a translation question. */
  translation(id: string, seed: QuestionSeed, direction: "ja_to_en" | "en_to_ja" = "ja_to_en"): Question {
    if (direction === "ja_to_en") {
      return {
        id, type: "translation",
        prompt: `Translate to English: 「${seed.target}」`,
        promptJa: seed.target,
        hint: seed.reading ? `Reading: ${seed.reading}` : null,
        audioUrl: null, imageUrl: null,
        options: null, pairs: null, sentence: null,
        answer: seed.meanings[0] ?? "?",
        accepted: seed.meanings,
        explanation: `${seed.target} = "${seed.meanings.join(", ")}"`,
        points: 2, knowledgeRef: seed.knowledgeRef ?? null,
        tags: ["translation", "ja_to_en"],
      };
    } else {
      const distractors = pickDistractors(
        ["食べる", "飲む", "見る", "行く", "来る", "書く", "読む", "話す"],
        seed.target, 3,
      );
      return {
        id, type: "translation",
        prompt: `Translate to Japanese: "${seed.meanings[0]}"`,
        promptJa: null,
        hint: null,
        audioUrl: null, imageUrl: null,
        options: shuffleWithAnswer(distractors, seed.target),
        pairs: null, sentence: null,
        answer: seed.target,
        accepted: seed.reading ? [seed.reading] : [],
        explanation: `"${seed.meanings[0]}" = ${seed.target}${seed.reading ? ` (${seed.reading})` : ""}`,
        points: 2, knowledgeRef: seed.knowledgeRef ?? null,
        tags: ["translation", "en_to_ja"],
      };
    }
  },

  /** Generate a kanji recognition question. */
  kanjiRecognition(
    id: string,
    character: string,
    meanings: string[],
    readings: string[],
    mode: "meaning" | "reading" | "character" = "meaning",
  ): Question {
    if (mode === "meaning") {
      const distractors = pickDistractors(MEANING_DISTRACTORS, meanings[0] ?? "", 3);
      return {
        id, type: "kanji_recognition",
        prompt: `What does the kanji 「${character}」 mean?`,
        promptJa: character,
        hint: readings.length > 0 ? `Readings: ${readings.slice(0, 2).join(", ")}` : null,
        audioUrl: null, imageUrl: null,
        options: shuffleWithAnswer(distractors, meanings[0] ?? "?"),
        pairs: null, sentence: null,
        answer: meanings[0] ?? "?",
        accepted: meanings.slice(1),
        explanation: `${character} means "${meanings.join(", ")}". Readings: ${readings.join(", ")}.`,
        points: 1, knowledgeRef: null,
        tags: ["kanji", "meaning"],
      };
    } else if (mode === "reading") {
      const distractors = pickDistractors(READING_DISTRACTORS, readings[0] ?? "", 3);
      return {
        id, type: "kanji_recognition",
        prompt: `What is the reading of 「${character}」?`,
        promptJa: character,
        hint: `Meaning: ${meanings[0]}`,
        audioUrl: null, imageUrl: null,
        options: readings[0] ? shuffleWithAnswer(distractors, readings[0]) : null,
        pairs: null, sentence: null,
        answer: readings[0] ?? "?",
        accepted: readings.slice(1),
        explanation: `${character} (${meanings[0]}) is read as ${readings.join(" / ")}.`,
        points: 1, knowledgeRef: null,
        tags: ["kanji", "reading"],
      };
    } else {
      const distractors = pickDistractors(KANJI_DISTRACTORS, character, 3);
      return {
        id, type: "kanji_recognition",
        prompt: `Which kanji means "${meanings[0]}"?`,
        promptJa: null,
        hint: readings.length > 0 ? `Reading: ${readings[0]}` : null,
        audioUrl: null, imageUrl: null,
        options: shuffleWithAnswer(distractors, character),
        pairs: null, sentence: null,
        answer: character,
        accepted: [],
        explanation: `${character} means "${meanings.join(", ")}".`,
        points: 1, knowledgeRef: null,
        tags: ["kanji", "character"],
      };
    }
  },

  // ═══════════════════════════════════════════
  // RENDER — Strip answers for client
  // ═══════════════════════════════════════════

  /** Remove answer data before sending to client. */
  render(question: Question): QuestionRendered {
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      promptJa: question.promptJa,
      hint: question.hint,
      audioUrl: question.audioUrl,
      imageUrl: question.imageUrl,
      options: question.options,
      // For matching, shuffle the right side
      pairs: question.pairs
        ? question.pairs.map(([l]) => [l, "?"] as [string, string])
        : null,
      sentence: question.sentence,
      points: question.points,
      tags: question.tags,
    };
  },

  // ═══════════════════════════════════════════
  // GRADE — Check answers
  // ═══════════════════════════════════════════

  /** Grade a single question. */
  grade(question: Question, userAnswer: unknown): GradeResult {
    let correct = false;

    switch (question.type) {
      case "multiple_choice":
      case "reading":
      case "kanji_recognition":
      case "fill_blank":
        correct = typeof userAnswer === "string"
          && answersMatch(userAnswer, String(question.answer), question.accepted);
        break;

      case "type_answer":
      case "listening":
      case "translation":
        correct = typeof userAnswer === "string"
          && answersMatch(userAnswer, String(question.answer), question.accepted);
        break;

      case "matching":
        if (Array.isArray(userAnswer) && Array.isArray(question.answer)) {
          const correctPairs = new Set(question.answer.map(String));
          const userPairs = (userAnswer as string[]).map(String);
          correct = userPairs.length === correctPairs.size
            && userPairs.every((p) => correctPairs.has(p));
        }
        break;
    }

    return {
      questionId: question.id,
      type: question.type,
      correct,
      pointsEarned: correct ? question.points : 0,
      pointsPossible: question.points,
      correctAnswer: question.answer,
      userAnswer,
      explanation: question.explanation,
    };
  },

  /** Grade a batch of questions. */
  gradeAll(questions: Question[], answers: Record<string, unknown>): QuizGradeResult {
    const grades = questions.map((q) => this.grade(q, answers[q.id]));
    const correctCount = grades.filter((g) => g.correct).length;
    const earnedPoints = grades.reduce((sum, g) => sum + g.pointsEarned, 0);
    const totalPoints = grades.reduce((sum, g) => sum + g.pointsPossible, 0);

    return {
      totalQuestions: questions.length,
      correctCount,
      score: questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0,
      totalPoints,
      earnedPoints,
      grades,
    };
  },

  // ═══════════════════════════════════════════
  // GENERATE MIXED — Auto-generate from seeds
  // ═══════════════════════════════════════════

  /** Generate a mixed set of questions from seed data, varying question types. */
  generateMixed(seeds: QuestionSeed[], questionsPerSeed = 1): Question[] {
    const questions: Question[] = [];
    const types: Array<(id: string, seed: QuestionSeed) => Question> = [
      (id, s) => this.multipleChoice(id, s),
      (id, s) => this.typeAnswer(id, s, "ja_to_en"),
      (id, s) => this.reading(id, s),
      (id, s) => this.translation(id, s, "ja_to_en"),
      (id, s) => this.translation(id, s, "en_to_ja"),
    ];

    // Add kanji recognition for single-character targets
    const kanjiTypes: Array<(id: string, s: QuestionSeed) => Question> = [
      (id, s) => this.kanjiRecognition(id, s.target, s.meanings, s.reading ? [s.reading] : [], "meaning"),
      (id, s) => this.kanjiRecognition(id, s.target, s.meanings, s.reading ? [s.reading] : [], "reading"),
      (id, s) => this.kanjiRecognition(id, s.target, s.meanings, s.reading ? [s.reading] : [], "character"),
    ];

    for (const seed of seeds) {
      const isKanji = seed.target.length === 1 && /[\u4E00-\u9FFF]/.test(seed.target);
      const pool = isKanji ? [...types, ...kanjiTypes] : types;

      for (let i = 0; i < questionsPerSeed; i++) {
        const gen = pool[Math.floor(Math.random() * pool.length)]!;
        const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        questions.push(gen(id, seed));
      }
    }

    // Add a matching question if we have enough seeds
    if (seeds.length >= 3) {
      const matchSeeds = seeds.slice(0, Math.min(seeds.length, 5));
      const id = `q-match-${Date.now().toString(36)}`;
      questions.push(this.matching(id, matchSeeds));
    }

    return questions;
  },
};
