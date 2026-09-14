export type QuestionSkill = "grammar" | "kanji" | "vocabulary" | "reading";
export type QuestionKind = "multiple_choice" | "cloze" | "reading" | "meaning";
export type QuestionAnswerMode = "option" | "text";

/** Public option. No `isCorrect` — correctness never leaves the server. */
export interface QuestionOptionPublic {
  id: number;
  position: number;
  label: string;
  subLabel: string | null;
}

/** Public question payload (safe for any client). */
export interface QuestionPublic {
  id: number;
  sourceKey: string;
  skill: QuestionSkill;
  kind: QuestionKind;
  answerMode: QuestionAnswerMode;
  prompt: string;
  promptJa: string | null;
  instructions: string | null;
  jlptLevel: number | null;
  difficulty: number;
  points: number;
  options: QuestionOptionPublic[];
  reference: {
    kind: "grammar" | "kanji" | "vocabulary" | "sentence";
    href: string;
    label: string;
  } | null;
}

/** One graded answer. Correctness is revealed only after an attempt. */
export interface QuestionGrade {
  questionId: number;
  correct: boolean;
  points: number;
  awardedPoints: number;
  correctOptionId: number | null;
  correctAnswer: string | null;
  explanation: string | null;
  feedback: string | null;
}

export interface QuestionAnswerInput {
  questionId: number;
  optionId?: number | null;
  value?: string | null;
}

export interface QuestionQuery {
  skills?: QuestionSkill[];
  jlptLevel?: number | null;
  kinds?: QuestionKind[];
  limit?: number;
  /** Deterministic sampling seed; omit for random selection */
  seed?: number | null;
}

export interface QuestionSet {
  questions: QuestionPublic[];
  total: number;
  totalPoints: number;
  filters: {
    skills: QuestionSkill[];
    jlptLevel: number | null;
    kinds: QuestionKind[];
  };
}

export interface QuestionBankStats {
  total: number;
  active: number;
  bySkill: Array<{ skill: string; total: number }>;
  byLevel: Array<{ jlptLevel: number | null; total: number }>;
  byOrigin: Array<{ origin: string; total: number }>;
}
