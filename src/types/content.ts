export interface SentenceGrammarRef {
  slug: string;
  title: string;
  titleEn: string | null;
  matchedText: string | null;
  startIndex: number | null;
  endIndex: number | null;
}

export interface SentenceDetail {
  id: number;
  externalId: string | null;
  japanese: string;
  english: string;
  length: number;
  jlptLevel: number | null;
  grammar: SentenceGrammarRef[];
  source: {
    code: string;
    name: string;
    license: string;
    sourceUrl: string | null;
  } | null;
}

export interface LessonSummary {
  id: number;
  slug: string;
  courseSlug: string;
  courseTitle: string;
  moduleSlug: string | null;
  moduleTitle: string | null;
  title: string;
  titleJa: string | null;
  summary: string;
  objectives: string[];
  jlptLevel: number | null;
  position: number;
  estimatedMinutes: number;
}

export interface LessonDetail extends LessonSummary {
  content: string | null;
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
}

export interface CourseSummary {
  id: number;
  slug: string;
  title: string;
  titleJa: string | null;
  summary: string;
  jlptLevel: number | null;
  difficulty: string;
  position: number;
  lessonCount: number;
  estimatedMinutes: number;
}

export interface CourseModule {
  id: number;
  slug: string;
  title: string;
  titleJa: string | null;
  summary: string | null;
  position: number;
  lessons: LessonSummary[];
  estimatedMinutes: number;
}

export interface CoursePrerequisite {
  slug: string;
  title: string;
  required: boolean;
  note: string | null;
}

export interface LessonKnowledge {
  grammar: Array<{ slug: string; title: string; titleEn: string | null }>;
  kanji: Array<{ literal: string; meanings: string[] }>;
}

export interface CourseDetail extends CourseSummary {
  description: string | null;
  tags: string[];
  prerequisites: CoursePrerequisite[];
  modules: CourseModule[];
  /** Flat compatibility view; canonical hierarchy is `modules[].lessons`. */
  lessons: LessonSummary[];
}

export type LessonSectionKind =
  | "concept"
  | "grammar"
  | "kanji"
  | "vocabulary"
  | "examples"
  | "practice"
  | "summary";

export type LessonBlockKind =
  | "text"
  | "objective"
  | "tip"
  | "warning"
  | "checkpoint"
  | "grammar_ref"
  | "kanji_ref"
  | "vocabulary_ref"
  | "sentence_ref";

/** Canonical knowledge resolved for a reference block. */
export interface LessonBlockReference {
  kind: "grammar" | "kanji" | "vocabulary" | "sentence";
  /** Canonical detail route */
  href: string;
  /** Primary display value (〜てしまう, 語, 日本語, a sentence) */
  label: string;
  /** Reading, gloss or translation */
  secondary: string | null;
  /** Short supporting description */
  description: string | null;
}

export interface LessonBlock {
  id: number;
  position: number;
  kind: LessonBlockKind;
  title: string | null;
  body: string | null;
  reference: LessonBlockReference | null;
}

export interface LessonSection {
  id: number;
  key: string;
  kind: LessonSectionKind;
  title: string;
  titleJa: string | null;
  summary: string | null;
  position: number;
  blocks: LessonBlock[];
}

export interface LessonPrerequisite {
  slug: string;
  title: string;
  required: boolean;
  note: string | null;
}

export interface LessonOutlineDetail extends LessonDetail {
  knowledge: LessonKnowledge;
  sections: LessonSection[];
  prerequisites: LessonPrerequisite[];
  blockCount: number;
}
