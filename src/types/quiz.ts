import type { QuestionPublic } from "@/types/question";

/**
 * Phase 10.2/10.3 contracts for assessment runs.
 *
 * A *run* is one graded, ordered sample of bank questions owned by one learner.
 * `kind = "quiz"` is a practice quiz; `kind = "jlpt"` is a timed JLPT attempt.
 * There is exactly one run model, one sampling path and one grading authority.
 */

export type QuizRunKind = "quiz" | "jlpt";
export type QuizRunStatus = "in_progress" | "completed" | "expired";

/** Section framing. Only JLPT attempts carry sections. */
export interface QuizRunSection {
  code: string;
  title: string;
  titleJa: string | null;
  instructions: string | null;
  position: number;
  timeLimitSeconds: number;
  questionCount: number;
  skills: string[];
  kinds: string[];
  /** First item position covered by this section. */
  fromPosition: number;
  /** Last item position covered by this section. */
  toPosition: number;
}

/** Public run view — no answer keys, no other learners' data. */
export interface QuizRunPublic {
  publicId: string;
  kind: QuizRunKind;
  status: QuizRunStatus;
  title: string;
  jlptSlug: string | null;
  jlptLevel: number | null;
  seed: number;
  skills: string[];
  kinds: string[];
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  totalPoints: number;
  score: number;
  percent: number;
  passed: boolean | null;
  timeLimitSeconds: number | null;
  sections: QuizRunSection[];
  startedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
}

/** Per-item result of a run, revealed progressively. */
export interface QuizRunItemPublic {
  position: number;
  sectionCode: string | null;
  question: QuestionPublic;
  answer: {
    optionId: number | null;
    value: string | null;
    correct: boolean;
    awardedPoints: number;
    points: number;
    correctAnswer: string | null;
    feedback: string | null;
    explanation: string | null;
    elapsedMs: number | null;
  } | null;
}

export interface QuizRunDetail {
  run: QuizRunPublic;
  items: QuizRunItemPublic[];
  /** Present once the run is completed. */
  result: QuizRunResult | null;
}

export interface QuizRunSectionResult {
  code: string;
  title: string;
  questionCount: number;
  answered: number;
  correct: number;
  score: number;
  totalPoints: number;
  percent: number;
  passed: boolean | null;
}

export interface QuizRunSkillResult {
  skill: string;
  questionCount: number;
  correct: number;
  percent: number;
}

export interface QuizRunResult {
  score: number;
  totalPoints: number;
  percent: number;
  answered: number;
  correct: number;
  incorrect: number;
  skipped: number;
  passed: boolean | null;
  passingPercent: number | null;
  sectionMinimumPercent: number | null;
  sections: QuizRunSectionResult[];
  skills: QuizRunSkillResult[];
  durationSeconds: number | null;
}

export interface QuizRunGradeResponse {
  run: QuizRunPublic;
  position: number;
  grade: {
    correct: boolean;
    points: number;
    awardedPoints: number;
    correctAnswer: string | null;
    explanation: string | null;
    feedback: string | null;
  };
  /** Remaining unanswered items after this submission. */
  remaining: number;
}

export interface QuizStartInput {
  kind?: QuizRunKind;
  title?: string;
  jlptLevel?: number | null;
  skills?: string[];
  kinds?: string[];
  limit?: number;
  seed?: number | null;
  timeLimitSeconds?: number | null;
}

export interface QuizRunSummary extends Omit<QuizRunPublic, "sections"> {
  sections: QuizRunSection[];
}

/** Platform-wide run analytics (admin + `/api/quiz/stats`). */
export interface QuizRunStats {
  runs: number;
  completed: number;
  inProgress: number;
  expired: number;
  attempts: number;
  answers: number;
  correctAnswers: number;
  averagePercent: number;
  byKind: Array<{ kind: string; total: number; completed: number; averagePercent: number }>;
  byLevel: Array<{ jlptLevel: number | null; total: number }>;
}
