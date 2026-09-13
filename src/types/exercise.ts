export type ExerciseKind = "multiple_choice" | "cloze" | "reading" | "meaning";
export type ExerciseAnswerMode = "option" | "text";

/**
 * Public option shape.
 *
 * There is intentionally no `isCorrect` field: correctness never leaves the
 * server in a question payload. Grading happens through the check endpoint.
 */
export interface ExerciseOptionPublic {
  id: number;
  position: number;
  label: string;
  subLabel: string | null;
}

/** Public exercise shape (safe to send to any client). */
export interface ExercisePublic {
  id: number;
  key: string;
  kind: ExerciseKind;
  answerMode: ExerciseAnswerMode;
  prompt: string;
  promptJa: string | null;
  instructions: string | null;
  difficulty: number;
  position: number;
  points: number;
  options: ExerciseOptionPublic[];
  /** Canonical knowledge this exercise is about */
  reference: {
    kind: "grammar" | "kanji" | "vocabulary" | "sentence";
    href: string;
    label: string;
  } | null;
}

export interface ExerciseSet {
  lesson: { id: number; slug: string; title: string };
  exercises: ExercisePublic[];
  totalPoints: number;
}

/** Result of grading one answer. */
export interface ExerciseGrade {
  exerciseId: number;
  correct: boolean;
  points: number;
  awardedPoints: number;
  /** Correct option id (option mode) — only revealed after an attempt */
  correctOptionId: number | null;
  /** A canonical accepted answer (text mode) */
  correctAnswer: string | null;
  explanation: string | null;
  feedback: string | null;
}

export interface ExerciseSubmissionResult {
  lessonSlug: string;
  total: number;
  answered: number;
  correct: number;
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  grades: ExerciseGrade[];
}
