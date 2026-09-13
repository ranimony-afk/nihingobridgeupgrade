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
  /** Dictionary entries linked to this lesson (canonical `vocabulary` rows). */
  vocabulary: Array<{
    id: number;
    kanjiText: string;
    kanaText: string | null;
    meanings: string[];
  }>;
  /** Corpus sentences used here, with the grammar point that motivated them. */
  sentences: Array<{
    id: number;
    japanese: string;
    english: string;
    grammarSlug: string | null;
    grammarTitle: string | null;
  }>;
}

export interface LessonSection {
  id: number;
  position: number;
  kind: string;
  heading: string;
  headingJa: string | null;
  body: string;
  examples: string[];
}

export interface LessonObjective {
  position: number;
  objective: string;
}

export interface LessonStructure {
  sectionCount: number;
  objectiveCount: number;
  vocabularyCount: number;
  sentenceCount: number;
  grammarCount: number;
  kanjiCount: number;
}

export interface CourseDetail extends CourseSummary {
  description: string | null;
  tags: string[];
  prerequisites: CoursePrerequisite[];
  modules: CourseModule[];
  /** Flat compatibility view; canonical hierarchy is `modules[].lessons`. */
  lessons: LessonSummary[];
}

export interface LessonOutlineDetail extends LessonDetail {
  knowledge: LessonKnowledge;
  /** Authored teaching blocks, in presentation order. */
  sections: LessonSection[];
  /** Normalised objectives; `objectives` remains the string compatibility view. */
  objectivesDetail: LessonObjective[];
  structure: LessonStructure;
}
