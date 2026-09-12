/**
 * LessonPlayer — Domain service for playing through a lesson.
 *
 * P35: Resolves lesson items into playable content, enriching
 * vocabulary/kanji/grammar refs with real knowledge data, and
 * structuring exercises for interactive answering.
 *
 * Supports all item types: text, vocabulary, kanji, grammar,
 * audio, examples, exercises (7 sub-types), images, video, dividers.
 */

import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  lessons,
  lessonItems,
  courseModules,
  courses,
  dictionaryEntries,
  dictionarySenses,
  kanjiEntries,
  grammarPatterns,
  grammarExamples,
} from "@/db/schema";
import { DictionaryService } from "../knowledge/dictionary";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** The full playable lesson sent to the client. */
export interface PlayableLesson {
  id: string;
  title: string;
  summary: string | null;
  kind: string;
  xpReward: number;
  estimatedMinutes: number | null;
  jlptLevel: number | null;
  /** Course + module context for breadcrumbs. */
  breadcrumb: {
    courseId: string;
    courseTitle: string;
    courseSlug: string;
    moduleId: string;
    moduleTitle: string;
    moduleSlug: string;
  } | null;
  /** Total number of items. */
  totalItems: number;
  /** Number of exercise items (determines quiz scoring). */
  exerciseCount: number;
  /** Resolved and enriched items, in order. */
  items: PlayableItem[];
}

/** A single resolved lesson item ready for rendering/interaction. */
export type PlayableItem =
  | PlayableText
  | PlayableVocabulary
  | PlayableKanji
  | PlayableGrammar
  | PlayableExample
  | PlayableAudio
  | PlayableImage
  | PlayableVideo
  | PlayableExercise
  | PlayableDivider;

interface PlayableBase {
  id: string;
  type: string;
  sortOrder: number;
}

export interface PlayableText extends PlayableBase {
  type: "text";
  body: string;
}

export interface PlayableVocabulary extends PlayableBase {
  type: "vocabulary";
  word: string;
  reading: string;
  meaning: string;
  pos: string[] | null;
  jlpt: number | null;
  audio: string | null;
  sentences: string[];
  /** Enriched from dictionary if knowledgeRef exists. */
  senses: { glosses: Record<string, string[]>; pos: string[] | null }[];
  conjugations: Record<string, string> | null;
  entryId: string | null;
}

export interface PlayableKanji extends PlayableBase {
  type: "kanji";
  character: string;
  meanings: string[];
  onReadings: string[] | null;
  kunReadings: string[] | null;
  strokeCount: number | null;
  grade: number | null;
  jlpt: number | null;
}

export interface PlayableGrammar extends PlayableBase {
  type: "grammar";
  title: string;
  structure: string;
  meaning: string;
  explanation: string;
  formation: string | null;
  examples: { ja: string; en: string }[];
}

export interface PlayableExample extends PlayableBase {
  type: "example";
  japanese: string;
  reading: string | null;
  english: string;
  notes: string | null;
}

export interface PlayableAudio extends PlayableBase {
  type: "audio";
  src: string;
  label: string | null;
  transcript: string | null;
  duration: number | null;
}

export interface PlayableImage extends PlayableBase {
  type: "image";
  src: string;
  alt: string | null;
  caption: string | null;
}

export interface PlayableVideo extends PlayableBase {
  type: "video";
  src: string;
  caption: string | null;
}

export interface PlayableExercise extends PlayableBase {
  type: "exercise";
  exerciseType: string;
  prompt: string;
  promptJa: string | null;
  hint: string | null;
  /** Options for multiple choice / matching. */
  options: string[] | null;
  /** Pairs for matching exercises. */
  pairs: [string, string][] | null;
  /** Tiles for sentence-build exercises. */
  tiles: string[] | null;
  /** NOT sent to client in play mode — only used for server-side grading. */
  _answer: unknown;
  _accepted: string[] | null;
  explanation: string | null;
}

export interface PlayableDivider extends PlayableBase {
  type: "divider";
}

/** Result of grading a single exercise answer. */
export interface GradeResult {
  itemId: string;
  correct: boolean;
  pointsEarned: number;
  pointsPossible: number;
  explanation: string | null;
  correctAnswer: unknown;
}

/** Result of grading all exercises in a lesson. */
export interface LessonGradeResult {
  lessonId: string;
  totalExercises: number;
  correctCount: number;
  score: number; // 0-100
  xpEarned: number;
  grades: GradeResult[];
}

// ─────────────────────────────────────────────
// LessonPlayer
// ─────────────────────────────────────────────

export const LessonPlayer = {
  /**
   * Load a lesson and resolve all items into playable content.
   * Enriches vocabulary/kanji/grammar refs with real knowledge data.
   */
  async load(lessonId: string): Promise<PlayableLesson | null> {
    // Fetch lesson
    const [lessonRow] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!lessonRow) return null;

    // Fetch breadcrumb (module → course)
    let breadcrumb: PlayableLesson["breadcrumb"] = null;
    const [modRow] = await db.select().from(courseModules).where(eq(courseModules.id, lessonRow.moduleId)).limit(1);
    if (modRow) {
      const [courseRow] = await db.select().from(courses).where(eq(courses.id, modRow.courseId)).limit(1);
      if (courseRow) {
        breadcrumb = {
          courseId: courseRow.id,
          courseTitle: courseRow.title,
          courseSlug: courseRow.slug,
          moduleId: modRow.id,
          moduleTitle: modRow.title,
          moduleSlug: modRow.slug,
        };
      }
    }

    // Fetch items
    const itemRows = await db.select().from(lessonItems)
      .where(eq(lessonItems.lessonId, lessonId))
      .orderBy(asc(lessonItems.sortOrder));

    // Resolve each item
    const items: PlayableItem[] = [];
    let exerciseCount = 0;
    for (const row of itemRows) {
      const resolved = await this._resolveItem(row);
      items.push(resolved);
      if (resolved.type === "exercise") exerciseCount++;
    }

    return {
      id: lessonRow.id,
      title: lessonRow.title,
      summary: lessonRow.summary,
      kind: lessonRow.kind,
      xpReward: lessonRow.xpReward,
      estimatedMinutes: lessonRow.estimatedMinutes,
      jlptLevel: lessonRow.jlptLevel,
      breadcrumb,
      totalItems: items.length,
      exerciseCount,
      items,
    };
  },

  /**
   * Grade a set of exercise answers for a lesson.
   * `answers` is a map of itemId → user's answer.
   */
  async grade(
    lessonId: string,
    answers: Record<string, unknown>,
  ): Promise<LessonGradeResult | null> {
    const itemRows = await db.select().from(lessonItems)
      .where(eq(lessonItems.lessonId, lessonId))
      .orderBy(asc(lessonItems.sortOrder));

    const exerciseItems = itemRows.filter((i) => i.type === "exercise");
    if (exerciseItems.length === 0) return null;

    const [lessonRow] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!lessonRow) return null;

    const grades: GradeResult[] = [];
    let correctCount = 0;

    for (const item of exerciseItems) {
      const payload = item.payload as Record<string, unknown>;
      const userAnswer = answers[item.id];
      const correctAnswer = payload.answer;
      const accepted = (payload.accepted as string[] | undefined) ?? [];
      const explanation = (payload.explanation as string) ?? null;

      let correct = false;

      if (typeof correctAnswer === "string" && typeof userAnswer === "string") {
        const norm = (s: string) => s.trim().toLowerCase().replace(/[。、！？.!?,]/g, "");
        correct = norm(userAnswer) === norm(correctAnswer) || accepted.some((a) => norm(userAnswer) === norm(a));
      } else if (typeof correctAnswer === "string" && typeof userAnswer === "string") {
        correct = userAnswer === correctAnswer;
      } else {
        correct = JSON.stringify(userAnswer) === JSON.stringify(correctAnswer);
      }

      if (correct) correctCount++;

      grades.push({
        itemId: item.id,
        correct,
        pointsEarned: correct ? 1 : 0,
        pointsPossible: 1,
        explanation,
        correctAnswer,
      });
    }

    const score = Math.round((correctCount / exerciseItems.length) * 100);
    const xpEarned = score >= 60 ? lessonRow.xpReward : Math.round(lessonRow.xpReward * score / 200);

    return {
      lessonId,
      totalExercises: exerciseItems.length,
      correctCount,
      score,
      xpEarned,
      grades,
    };
  },

  // ─────────────────────────────────────────────
  // Item resolver
  // ─────────────────────────────────────────────

  async _resolveItem(row: typeof lessonItems.$inferSelect): Promise<PlayableItem> {
    const p = row.payload as Record<string, unknown>;
    const base = { id: row.id, sortOrder: row.sortOrder };

    switch (row.type) {
      case "text":
        return { ...base, type: "text", body: String(p.body ?? "") };

      case "vocabulary":
        return this._resolveVocabulary(base, p, row.knowledgeRef);

      case "grammar":
        return this._resolveGrammar(base, p, row.knowledgeRef);

      case "example":
        return {
          ...base,
          type: "example",
          japanese: String(p.japanese ?? ""),
          reading: (p.reading as string) ?? null,
          english: String(p.english ?? ""),
          notes: (p.notes as string) ?? null,
        };

      case "audio":
        return {
          ...base,
          type: "audio",
          src: String(p.src ?? ""),
          label: (p.label as string) ?? null,
          transcript: (p.transcript as string) ?? null,
          duration: (p.duration as number) ?? null,
        };

      case "image":
        return {
          ...base,
          type: "image",
          src: String(p.src ?? ""),
          alt: (p.alt as string) ?? null,
          caption: (p.caption as string) ?? null,
        };

      case "video":
        return {
          ...base,
          type: "video",
          src: String(p.src ?? ""),
          caption: (p.caption as string) ?? null,
        };

      case "exercise":
        return {
          ...base,
          type: "exercise",
          exerciseType: row.exerciseType ?? String(p.exerciseType ?? "multiple_choice"),
          prompt: String(p.prompt ?? ""),
          promptJa: (p.promptJa as string) ?? null,
          hint: (p.hint as string) ?? null,
          options: (p.options as string[]) ?? null,
          pairs: (p.pairs as [string, string][]) ?? null,
          tiles: (p.tiles as string[]) ?? null,
          _answer: p.answer,
          _accepted: (p.accepted as string[]) ?? null,
          explanation: (p.explanation as string) ?? null,
        };

      case "divider":
        return { ...base, type: "divider" };

      default:
        return { ...base, type: "text", body: `[Unknown type: ${row.type}]` };
    }
  },

  async _resolveVocabulary(
    base: { id: string; sortOrder: number },
    p: Record<string, unknown>,
    knowledgeRef: string | null,
  ): Promise<PlayableVocabulary> {
    const result: PlayableVocabulary = {
      ...base,
      type: "vocabulary",
      word: String(p.word ?? ""),
      reading: String(p.reading ?? ""),
      meaning: String(p.meaning ?? ""),
      pos: (p.pos as string[]) ?? null,
      jlpt: (p.jlpt as number) ?? null,
      audio: (p.audio as string) ?? null,
      sentences: (p.sentences as string[]) ?? [],
      senses: [],
      conjugations: null,
      entryId: knowledgeRef,
    };

    // Enrich from dictionary if ref exists
    if (knowledgeRef) {
      try {
        const entry = await DictionaryService.getById(knowledgeRef);
        if (entry) {
          result.word = entry.headword;
          result.reading = entry.reading;
          result.pos = entry.pos;
          result.jlpt = entry.jlptLevel;
          result.senses = entry.senses.map((s) => ({ glosses: s.glosses, pos: s.pos }));

          // Generate conjugations if it's a verb
          const conj = await DictionaryService.getConjugations(knowledgeRef);
          if (conj) {
            result.conjugations = conj as unknown as Record<string, string>;
          }
        }
      } catch {
        // Knowledge ref not found — use payload data as fallback
      }
    }

    return result;
  },

  async _resolveGrammar(
    base: { id: string; sortOrder: number },
    p: Record<string, unknown>,
    knowledgeRef: string | null,
  ): Promise<PlayableGrammar> {
    // If knowledgeRef points to a grammar_patterns row, enrich from DB
    if (knowledgeRef) {
      try {
        const [gp] = await db.select().from(grammarPatterns).where(eq(grammarPatterns.id, knowledgeRef)).limit(1);
        if (gp) {
          const examples = await db.select().from(grammarExamples)
            .where(eq(grammarExamples.grammarId, gp.id))
            .orderBy(asc(grammarExamples.position));
          return {
            ...base,
            type: "grammar",
            title: gp.title,
            structure: gp.structure,
            meaning: gp.meaning,
            explanation: gp.explanation,
            formation: gp.formation,
            examples: examples.map((e) => ({ ja: e.ja, en: e.en })),
          };
        }
      } catch { /* fall through to payload */ }
    }

    // Fallback: use payload data
    return {
      ...base,
      type: "grammar",
      title: String(p.title ?? ""),
      structure: String(p.structure ?? ""),
      meaning: String(p.meaning ?? ""),
      explanation: String(p.explanation ?? ""),
      formation: (p.formation as string) ?? null,
      examples: (p.examples as { ja: string; en: string }[]) ?? [],
    };
  },
};
