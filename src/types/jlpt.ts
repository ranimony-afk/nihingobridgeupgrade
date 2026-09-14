/**
 * Phase 10.3 contracts — JLPT test blueprints and attempts.
 *
 * A blueprint describes *structure* only (sections, limits, pass marks).
 * Questions are always sampled from the canonical bank at attempt time, so a
 * blueprint never duplicates question data.
 */

export interface JlptSectionDefinition {
  code: string;
  title: string;
  titleJa: string | null;
  instructions: string | null;
  position: number;
  timeLimitSeconds: number;
  questionCount: number;
  skills: string[];
  kinds: string[];
  /** Number of active bank questions that currently match this section. */
  available: number;
  /** false when the bank cannot fill the section. */
  satisfiable: boolean;
}

export interface JlptTestPublic {
  slug: string;
  level: number;
  levelLabel: string;
  title: string;
  titleJa: string | null;
  subtitle: string | null;
  description: string | null;
  instructions: string | null;
  timeLimitSeconds: number;
  questionCount: number;
  totalPoints: number;
  passingPercent: number;
  sectionMinimumPercent: number;
  available: boolean;
  published: boolean;
  sections: JlptSectionDefinition[];
}

export interface JlptAttemptSummary {
  publicId: string;
  testSlug: string;
  testTitle: string;
  level: number;
  status: string;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  score: number;
  totalPoints: number;
  percent: number;
  passed: boolean | null;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
}

export interface JlptLevelStat {
  level: number;
  levelLabel: string;
  attempts: number;
  completed: number;
  passed: number;
  passRate: number;
  averagePercent: number;
}

export interface JlptStats {
  tests: number;
  published: number;
  attempts: number;
  completed: number;
  passed: number;
  passRate: number;
  averagePercent: number;
  bankQuestionsByLevel: Array<{ level: number; total: number }>;
  byLevel: JlptLevelStat[];
  bySection: Array<{ code: string; title: string; attempts: number; averagePercent: number }>;
  bySkill: Array<{ skill: string; answers: number; correct: number; percent: number }>;
}

export const jlptLevelLabel = (level: number | null | undefined): string =>
  level && level >= 1 && level <= 5 ? `N${6 - level}` : "—";
