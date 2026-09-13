import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  CourseDetail,
  CourseModule,
  CourseSummary,
  LessonBlock,
  LessonBlockReference,
  LessonOutlineDetail,
  LessonSection,
  LessonSummary,
  SentenceDetail,
} from "@/types/content";

type Row = Record<string, unknown>;

function rows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nullableNumber = (value: unknown) =>
  value === null || value === undefined ? null : number(value);
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const textArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export async function getSentenceById(id: number): Promise<SentenceDetail | null> {
  const result = await getDb().execute(sql`
    SELECT s.id, s.external_id, s.japanese, s.english, s.length, s.jlpt_level,
           src.code AS source_code, src.name AS source_name,
           src.license AS source_license, src.source_url
    FROM sentences s
    LEFT JOIN sources src ON src.id = s.source_id
    WHERE s.id = ${id} LIMIT 1
  `);
  const [row] = rows<Row>(result);
  if (!row) return null;
  const grammarResult = await getDb().execute(sql`
    SELECT gp.slug, gp.title, gp.title_en,
           sgp.matched_text, sgp.start_index, sgp.end_index
    FROM sentence_grammar_points sgp
    JOIN grammar_points gp ON gp.id = sgp.grammar_point_id
    WHERE sgp.sentence_id = ${id}
    ORDER BY gp.jlpt_level DESC NULLS LAST, gp.sort_order
  `);
  return {
    id: number(row.id),
    externalId: text(row.external_id),
    japanese: String(row.japanese ?? ""),
    english: String(row.english ?? ""),
    length: number(row.length),
    jlptLevel: nullableNumber(row.jlpt_level),
    grammar: rows<Row>(grammarResult).map((item) => ({
      slug: String(item.slug ?? ""),
      title: String(item.title ?? ""),
      titleEn: text(item.title_en),
      matchedText: text(item.matched_text),
      startIndex: nullableNumber(item.start_index),
      endIndex: nullableNumber(item.end_index),
    })),
    source: row.source_code
      ? {
          code: String(row.source_code),
          name: String(row.source_name ?? ""),
          license: String(row.source_license ?? ""),
          sourceUrl: text(row.source_url),
        }
      : null,
  };
}

export async function listCourses(): Promise<CourseSummary[]> {
  const result = await getDb().execute(sql`
    SELECT c.id, c.slug, c.title, c.title_ja, c.summary, c.jlpt_level,
           c.difficulty, c.position, count(l.id)::int AS lesson_count,
           coalesce(sum(l.estimated_minutes), 0)::int AS estimated_minutes
    FROM courses c
    LEFT JOIN lessons l ON l.course_id = c.id AND l.published = true
    WHERE c.published = true
    GROUP BY c.id ORDER BY c.position, c.title
  `);
  return rows<Row>(result).map(mapCourse);
}

export async function getCourseBySlug(slug: string): Promise<CourseDetail | null> {
  const result = await getDb().execute(sql`
    SELECT c.id, c.slug, c.title, c.title_ja, c.summary, c.description,
           c.jlpt_level, c.difficulty, c.position, count(l.id)::int AS lesson_count,
           coalesce(sum(l.estimated_minutes), 0)::int AS estimated_minutes
    FROM courses c
    LEFT JOIN lessons l ON l.course_id = c.id AND l.published = true
    WHERE c.published = true AND c.slug = ${slug}
    GROUP BY c.id LIMIT 1
  `);
  const [row] = rows<Row>(result);
  if (!row) return null;
  const course = mapCourse(row);

  const [lessonResult, moduleResult, prerequisiteResult, tagResult] = await Promise.all([
    getDb().execute(sql`
      SELECT l.id, l.slug, l.title, l.title_ja, l.summary, l.objectives,
             l.jlpt_level, l.position, l.estimated_minutes,
             c.slug AS course_slug, c.title AS course_title,
             cm.slug AS module_slug, cm.title AS module_title
      FROM lessons l JOIN courses c ON c.id = l.course_id
      LEFT JOIN course_modules cm ON cm.id = l.module_id
      WHERE l.course_id = ${course.id} AND l.published = true
      ORDER BY cm.position NULLS LAST, l.position, l.title
    `),
    getDb().execute(sql`
      SELECT id, slug, title, title_ja, summary, position
      FROM course_modules
      WHERE course_id = ${course.id} AND published = true
      ORDER BY position, title
    `),
    getDb().execute(sql`
      SELECT p.slug, p.title, cp.required, cp.note
      FROM course_prerequisites cp
      JOIN courses p ON p.id = cp.prerequisite_course_id
      WHERE cp.course_id = ${course.id} AND p.published = true
      ORDER BY cp.required DESC, p.position
    `),
    getDb().execute(sql`
      SELECT t.slug FROM course_tag_links ctl
      JOIN course_tags t ON t.id = ctl.tag_id
      WHERE ctl.course_id = ${course.id} ORDER BY t.slug
    `),
  ]);

  const lessons = rows<Row>(lessonResult).map(mapLesson);
  const modules: CourseModule[] = rows<Row>(moduleResult).map((module) => {
    const moduleLessons = lessons.filter((lesson) => lesson.moduleSlug === module.slug);
    return {
      id: number(module.id),
      slug: String(module.slug ?? ""),
      title: String(module.title ?? ""),
      titleJa: text(module.title_ja),
      summary: text(module.summary),
      position: number(module.position),
      lessons: moduleLessons,
      estimatedMinutes: moduleLessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0),
    };
  });

  return {
    ...course,
    description: text(row.description),
    tags: rows<Row>(tagResult).map((item) => String(item.slug)),
    prerequisites: rows<Row>(prerequisiteResult).map((item) => ({
      slug: String(item.slug ?? ""),
      title: String(item.title ?? ""),
      required: Boolean(item.required),
      note: text(item.note),
    })),
    modules,
    lessons,
  };
}

export async function getLessonBySlug(slug: string): Promise<LessonOutlineDetail | null> {
  const result = await getDb().execute(sql`
    SELECT l.id, l.slug, l.title, l.title_ja, l.summary, l.objectives,
           l.content, l.jlpt_level, l.position, l.estimated_minutes,
           c.id AS course_id, c.slug AS course_slug, c.title AS course_title,
           cm.slug AS module_slug, cm.title AS module_title
    FROM lessons l JOIN courses c ON c.id = l.course_id
    LEFT JOIN course_modules cm ON cm.id = l.module_id
    WHERE l.published = true AND c.published = true AND l.slug = ${slug}
    LIMIT 1
  `);
  const [row] = rows<Row>(result);
  if (!row) return null;
  const lesson = mapLesson(row);

  const [neighbours, grammarResult, kanjiResult, sectionResult, blockResult, prerequisiteResult] =
    await Promise.all([
    getDb().execute(sql`
      SELECT slug, title, position FROM lessons
      WHERE course_id = ${number(row.course_id)} AND published = true
        AND position IN (${lesson.position - 1}, ${lesson.position + 1})
      ORDER BY position
    `),
    getDb().execute(sql`
      SELECT gp.slug, gp.title, gp.title_en FROM lesson_grammar_points lgp
      JOIN grammar_points gp ON gp.id = lgp.grammar_point_id
      WHERE lgp.lesson_id = ${lesson.id} ORDER BY lgp.position
    `),
    getDb().execute(sql`
      SELECT k.literal, coalesce(m.meanings, '{}'::text[]) AS meanings
      FROM lesson_kanji lk JOIN kanji k ON k.id = lk.kanji_id
      LEFT JOIN (
        SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
        FROM kanji_meanings WHERE lang='en' GROUP BY kanji_id
      ) m ON m.kanji_id = k.id
      WHERE lk.lesson_id = ${lesson.id} ORDER BY lk.position
    `),
    getDb().execute(sql`
      SELECT id, key, kind, title, title_ja, summary, position
      FROM lesson_sections
      WHERE lesson_id = ${lesson.id} AND published = true
      ORDER BY position
    `),
    getDb().execute(sql`
      SELECT b.id, b.section_id, b.position, b.kind, b.title, b.body,
             gp.slug AS grammar_slug, gp.title AS grammar_title,
             gp.title_en AS grammar_title_en, gp.summary AS grammar_summary,
             k.literal AS kanji_literal, km.meanings AS kanji_meanings,
             kr.readings AS kanji_readings,
             v.kanji_text, v.kana_text, v.meanings AS vocabulary_meanings,
             s.id AS sentence_id, s.japanese, s.english
      FROM lesson_blocks b
      JOIN lesson_sections ls ON ls.id = b.section_id AND ls.published = true
      LEFT JOIN grammar_points gp ON gp.id = b.grammar_point_id
      LEFT JOIN kanji k ON k.id = b.kanji_id
      LEFT JOIN (
        SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
        FROM kanji_meanings WHERE lang='en' GROUP BY kanji_id
      ) km ON km.kanji_id = b.kanji_id
      LEFT JOIN (
        SELECT kanji_id, array_agg(reading ORDER BY reading_type, position) AS readings
        FROM kanji_readings WHERE reading_type IN ('ja_on','ja_kun') GROUP BY kanji_id
      ) kr ON kr.kanji_id = b.kanji_id
      LEFT JOIN vocabulary v ON v.id = b.vocabulary_id
      LEFT JOIN sentences s ON s.id = b.sentence_id
      WHERE b.lesson_id = ${lesson.id}
      ORDER BY ls.position, b.position
    `),
    getDb().execute(sql`
      SELECT p.slug, p.title, lp.required, lp.note
      FROM lesson_prerequisites lp
      JOIN lessons p ON p.id = lp.prerequisite_lesson_id
      WHERE lp.lesson_id = ${lesson.id} AND p.published = true
      ORDER BY lp.required DESC, p.position
    `),
  ]);
  const neighbourRows = rows<Row>(neighbours);
  const previousRow = neighbourRows.find((item) => number(item.position) < lesson.position);
  const nextRow = neighbourRows.find((item) => number(item.position) > lesson.position);

  const blocksBySection = new Map<number, LessonBlock[]>();
  for (const blockRow of rows<Row>(blockResult)) {
    const sectionId = number(blockRow.section_id);
    const bucket = blocksBySection.get(sectionId) ?? [];
    bucket.push({
      id: number(blockRow.id),
      position: number(blockRow.position),
      kind: String(blockRow.kind ?? "text") as LessonBlock["kind"],
      title: text(blockRow.title),
      body: text(blockRow.body),
      reference: mapBlockReference(blockRow),
    });
    blocksBySection.set(sectionId, bucket);
  }

  const sections: LessonSection[] = rows<Row>(sectionResult).map((sectionRow) => ({
    id: number(sectionRow.id),
    key: String(sectionRow.key ?? ""),
    kind: String(sectionRow.kind ?? "concept") as LessonSection["kind"],
    title: String(sectionRow.title ?? ""),
    titleJa: text(sectionRow.title_ja),
    summary: text(sectionRow.summary),
    position: number(sectionRow.position),
    blocks: blocksBySection.get(number(sectionRow.id)) ?? [],
  }));

  return {
    ...lesson,
    content: text(row.content),
    previous: previousRow ? { slug: String(previousRow.slug), title: String(previousRow.title) } : null,
    next: nextRow ? { slug: String(nextRow.slug), title: String(nextRow.title) } : null,
    sections,
    blockCount: sections.reduce((sum, section) => sum + section.blocks.length, 0),
    prerequisites: rows<Row>(prerequisiteResult).map((item) => ({
      slug: String(item.slug ?? ""),
      title: String(item.title ?? ""),
      required: Boolean(item.required),
      note: text(item.note),
    })),
    knowledge: {
      grammar: rows<Row>(grammarResult).map((item) => ({
        slug: String(item.slug ?? ""),
        title: String(item.title ?? ""),
        titleEn: text(item.title_en),
      })),
      kanji: rows<Row>(kanjiResult).map((item) => ({
        literal: String(item.literal ?? ""),
        meanings: textArray(item.meanings),
      })),
    },
  };
}

/** Resolves a reference block into canonical display data and a detail route. */
function mapBlockReference(row: Row): LessonBlockReference | null {
  if (row.grammar_slug) {
    return {
      kind: "grammar",
      href: `/grammar/${encodeURIComponent(String(row.grammar_slug))}`,
      label: String(row.grammar_title ?? ""),
      secondary: text(row.grammar_title_en),
      description: text(row.grammar_summary),
    };
  }
  if (row.kanji_literal) {
    const meanings = textArray(row.kanji_meanings);
    const readings = textArray(row.kanji_readings);
    return {
      kind: "kanji",
      href: `/kanji/${encodeURIComponent(String(row.kanji_literal))}`,
      label: String(row.kanji_literal),
      secondary: readings.slice(0, 4).join(" / ") || null,
      description: meanings.slice(0, 4).join(", ") || null,
    };
  }
  if (row.kanji_text) {
    const meanings = textArray(row.vocabulary_meanings);
    return {
      kind: "vocabulary",
      href: `/dictionary?q=${encodeURIComponent(String(row.kanji_text))}`,
      label: String(row.kanji_text),
      secondary: text(row.kana_text),
      description: meanings.slice(0, 3).join("; ") || null,
    };
  }
  if (row.sentence_id) {
    return {
      kind: "sentence",
      href: `/sentences/${number(row.sentence_id)}`,
      label: String(row.japanese ?? ""),
      secondary: text(row.english),
      description: null,
    };
  }
  return null;
}

function mapCourse(row: Row): CourseSummary {
  return {
    id: number(row.id),
    slug: String(row.slug ?? ""),
    title: String(row.title ?? ""),
    titleJa: text(row.title_ja),
    summary: String(row.summary ?? ""),
    jlptLevel: nullableNumber(row.jlpt_level),
    difficulty: String(row.difficulty ?? "beginner"),
    position: number(row.position),
    lessonCount: number(row.lesson_count),
    estimatedMinutes: number(row.estimated_minutes),
  };
}

function mapLesson(row: Row): LessonSummary {
  return {
    id: number(row.id),
    slug: String(row.slug ?? ""),
    courseSlug: String(row.course_slug ?? ""),
    courseTitle: String(row.course_title ?? ""),
    moduleSlug: text(row.module_slug),
    moduleTitle: text(row.module_title),
    title: String(row.title ?? ""),
    titleJa: text(row.title_ja),
    summary: String(row.summary ?? ""),
    objectives: textArray(row.objectives),
    jlptLevel: nullableNumber(row.jlpt_level),
    position: number(row.position),
    estimatedMinutes: number(row.estimated_minutes),
  };
}
