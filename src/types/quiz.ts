export type JLPTLevel = "N5" | "N4" | "N3" | "N2" | "N1";

export type QuestionSection = "vocab" | "grammar" | "reading" | "listening" | "language_knowledge_reading";

export type QuestionCategory =
  | "kanji_reading"
  | "orthography"
  | "contextual_use"
  | "paraphrase"
  | "usage"
  | "grammar_form"
  | "sentence_order"
  | "text_grammar"
  | "reading_short"
  | "reading_mid"
  | "reading_info"
  | "listening_task"
  | "listening_point"
  | "listening_utterance"
  | "listening_quick";

export type QuestionType =
  | "multiple_choice"
  | "star_order"
  | "reading_passage"
  | "listening_comprehension"
  | "fill_in_blank";

export interface QuestionOption {
  id: string;
  text: string;
  furigana?: string;
  translation?: string;
}

export interface StarOrderParts {
  parts: Array<{ id: string; text: string; furigana?: string }>;
  correctOrder: string[]; // e.g., ["2", "4", "1", "3"]
  starPosition: number; // 1-indexed (JLPT standard is usually 3)
}

export interface GrammarPointBreakdown {
  title: string;
  explanation: string;
  example?: string;
}

export interface VocabNote {
  word: string;
  reading: string;
  meaning: string;
}

export interface ExplanationBreakdown {
  grammarPoints?: GrammarPointBreakdown[];
  vocabNotes?: VocabNote[];
  whyWrong?: Record<string, string>;
  strategyTip?: string;
}

export interface Question {
  id: string;
  jlptLevel: JLPTLevel;
  section: QuestionSection;
  category: QuestionCategory;
  mondaiNumber: number;
  mondaiTitle: string;
  questionType: QuestionType;
  prompt: string;
  promptFurigana?: string | null;
  promptTranslation: string;
  passage?: string | null;
  passageFurigana?: string | null;
  passageTranslation?: string | null;
  audioScript?: string | null;
  audioUrl?: string | null;
  options: QuestionOption[];
  starOrderParts?: StarOrderParts | null;
  correctAnswer: string;
  explanation: string;
  explanationBreakdown?: ExplanationBreakdown | null;
  difficulty: number;
  tags: string[];
  isActive?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface TestAnswerSubmission {
  questionId: string;
  selectedAnswer?: string; // Option ID or star order representation
  starOrderSubmitted?: string[];
  timeSpentSeconds: number;
  isFlagged?: boolean;
}

export interface QuestionEvaluationResult {
  questionId: string;
  isCorrect: boolean;
  selectedAnswer?: string;
  correctAnswer: string;
  starOrderSubmitted?: string[];
  expectedStarOrder?: string[];
  timeSpentSeconds: number;
  isFlagged: boolean;
  question: Question;
}

export interface CategoryPerformance {
  categoryName: string;
  categoryKey: QuestionCategory;
  correct: number;
  total: number;
  percentage: number;
  grade: "A" | "B" | "C"; // JLPT official A (>=67%), B (34-66%), C (<34%)
}

export interface SectionScoreSummary {
  title: string;
  sectionKey: string;
  earned: number;
  max: number;
  percentage: number;
  passed: boolean;
  requiredScore: number;
}

export interface DiagnosticRecommendation {
  title: string;
  description: string;
  level: JLPTLevel;
  domain: string;
  severity: "high" | "medium" | "low";
}

export interface DetailedTestResult {
  sessionId: string;
  testId?: string | null;
  title: string;
  jlptLevel: JLPTLevel;
  quizType: string;
  isTimed: boolean;
  totalTimeSpentSeconds: number;
  timeLimitSeconds: number;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  passingScore: number;
  sectionScores: Record<string, SectionScoreSummary>;
  categoryBreakdown: Record<string, CategoryPerformance>;
  recommendations: DiagnosticRecommendation[];
  evaluations: QuestionEvaluationResult[];
  startedAt: string | Date;
  completedAt?: string | Date | null;
}
