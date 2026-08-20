/**
 * CourseEngine — Domain service for the learning platform.
 *
 * P34: CRUD and query operations for Course → Module → Lesson → LessonItem.
 * Pure TypeScript, no HTTP. Services layer only.
 *
 * Design notes:
 *   - IDs are generated at the service layer (nanoid-style text IDs)
 *   - Slugs are unique within their parent scope (course global, module per-course, lesson per-module)
 *   - Sort order is explicit integers (not auto-increment)
 *   - Published content is filtered by status='published' in public queries
 */

import { eq, and, asc, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  courses,
  courseModules,
  lessons,
  lessonItems,
  learningContent,
} from "@/db/schema";

// ─────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type CourseRow = typeof courses.$inferSelect;
type ModuleRow = typeof courseModules.$inferSelect;
type LessonRow = typeof lessons.$inferSelect;
type LessonItemRow = typeof lessonItems.$inferSelect;
type ContentRow = typeof learningContent.$inferSelect;

/** Course with nested modules (and optionally nested lessons). */
export interface CourseView extends CourseRow {
  modules: ModuleView[];
  contentCount?: number;
}

/** Module with nested lessons. */
export interface ModuleView extends ModuleRow {
  lessons: LessonRow[];
  lessonCount: number;
}

/** Lesson with nested items. */
export interface LessonDetail extends LessonRow {
  items: LessonItemRow[];
  itemCount: number;
  content: ContentRow[];
}

export interface CreateCourseInput {
  title: string;
  slug: string;
  subtitle?: string;
  description?: string;
  level?: "beginner" | "elementary" | "intermediate" | "upper_intermediate" | "advanced";
  jlptLevel?: number;
  imageUrl?: string;
  icon?: string;
  color?: string;
  estimatedHours?: number;
  tags?: string[];
  prerequisites?: string[];
  createdBy?: string;
}

export interface UpdateCourseInput {
  title?: string;
  subtitle?: string;
  description?: string;
  level?: "beginner" | "elementary" | "intermediate" | "upper_intermediate" | "advanced";
  jlptLevel?: number;
  status?: "draft" | "review" | "published" | "archived";
  imageUrl?: string;
  icon?: string;
  color?: string;
  estimatedHours?: number;
  tags?: string[];
  prerequisites?: string[];
  sortOrder?: number;
}

export interface CreateModuleInput {
  courseId: string;
  title: string;
  slug: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface CreateLessonInput {
  moduleId: string;
  title: string;
  slug: string;
  summary?: string;
  kind?: "lesson" | "quiz" | "practice" | "reading" | "listening" | "story";
  xpReward?: number;
  estimatedMinutes?: number;
  jlptLevel?: number;
}

export interface CreateLessonItemInput {
  lessonId: string;
  type: "text" | "vocabulary" | "grammar" | "example" | "exercise" | "audio" | "image" | "video" | "divider";
  payload: Record<string, unknown>;
  exerciseType?: "multiple_choice" | "fill_blank" | "matching" | "ordering" | "free_text" | "select_translation" | "type_answer" | "listen_type" | "sentence_build";
  knowledgeRef?: string;
}

export interface ListCoursesParams {
  status?: "draft" | "review" | "published" | "archived";
  level?: string;
  jlpt?: number;
  page?: number;
  pageSize?: number;
}

// ─────────────────────────────────────────────
// CourseEngine
// ─────────────────────────────────────────────

export const CourseEngine = {

  // ═══════════════════════════════════════════
  // COURSE
  // ═══════════════════════════════════════════

  async createCourse(input: CreateCourseInput): Promise<CourseRow> {
    const id = genId("crs");
    const maxOrder = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(courses);
    const sortOrder = (maxOrder[0]?.max ?? -1) + 1;

    const [row] = await db.insert(courses).values({
      id,
      slug: input.slug,
      title: input.title,
      subtitle: input.subtitle ?? null,
      description: input.description ?? null,
      level: input.level ?? "beginner",
      jlptLevel: input.jlptLevel ?? null,
      status: "draft",
      sortOrder,
      imageUrl: input.imageUrl ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      estimatedHours: input.estimatedHours ?? null,
      tags: input.tags ?? null,
      prerequisites: input.prerequisites ?? null,
      createdBy: input.createdBy ?? null,
    }).returning();

    return row!;
  },

  async updateCourse(id: string, input: UpdateCourseInput): Promise<CourseRow | null> {
    const [row] = await db.update(courses)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(courses.id, id))
      .returning();
    return row ?? null;
  },

  async deleteCourse(id: string): Promise<boolean> {
    const result = await db.delete(courses).where(eq(courses.id, id)).returning({ id: courses.id });
    return result.length > 0;
  },

  async getCourse(idOrSlug: string): Promise<CourseView | null> {
    const row = await db.select().from(courses)
      .where(
        idOrSlug.startsWith("crs-")
          ? eq(courses.id, idOrSlug)
          : eq(courses.slug, idOrSlug),
      )
      .limit(1);

    if (row.length === 0) return null;
    const course = row[0]!;

    const mods = await db.select().from(courseModules)
      .where(eq(courseModules.courseId, course.id))
      .orderBy(asc(courseModules.sortOrder));

    const moduleViews: ModuleView[] = await Promise.all(
      mods.map(async (m) => {
        const lsns = await db.select().from(lessons)
          .where(eq(lessons.moduleId, m.id))
          .orderBy(asc(lessons.sortOrder));
        return { ...m, lessons: lsns, lessonCount: lsns.length };
      }),
    );

    return { ...course, modules: moduleViews };
  },

  async listCourses(params: ListCoursesParams = {}): Promise<{
    courses: CourseRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { status, level, jlpt, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;
    const conds: SQL[] = [];
    if (status) conds.push(eq(courses.status, status));
    if (level) conds.push(eq(courses.level, level as never));
    if (jlpt) conds.push(eq(courses.jlptLevel, jlpt));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const [countRes, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(courses).where(where),
      db.select().from(courses).where(where).orderBy(asc(courses.sortOrder)).limit(pageSize).offset(offset),
    ]);

    return { courses: rows, total: countRes[0]?.count ?? 0, page, pageSize };
  },

  // ═══════════════════════════════════════════
  // MODULE
  // ═══════════════════════════════════════════

  async createModule(input: CreateModuleInput): Promise<ModuleRow> {
    const id = genId("mod");
    const maxOrder = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(courseModules)
      .where(eq(courseModules.courseId, input.courseId));
    const sortOrder = (maxOrder[0]?.max ?? -1) + 1;

    const [row] = await db.insert(courseModules).values({
      id,
      courseId: input.courseId,
      slug: input.slug,
      title: input.title,
      subtitle: input.subtitle ?? null,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder,
      status: "draft",
    }).returning();

    return row!;
  },

  async updateModule(id: string, input: Partial<Omit<CreateModuleInput, "courseId">> & { status?: string; sortOrder?: number }): Promise<ModuleRow | null> {
    const [row] = await db.update(courseModules)
      .set({ ...input, updatedAt: new Date() } as never)
      .where(eq(courseModules.id, id))
      .returning();
    return row ?? null;
  },

  async deleteModule(id: string): Promise<boolean> {
    const result = await db.delete(courseModules).where(eq(courseModules.id, id)).returning({ id: courseModules.id });
    return result.length > 0;
  },

  async getModule(id: string): Promise<ModuleView | null> {
    const row = await db.select().from(courseModules).where(eq(courseModules.id, id)).limit(1);
    if (row.length === 0) return null;
    const mod = row[0]!;
    const lsns = await db.select().from(lessons)
      .where(eq(lessons.moduleId, mod.id))
      .orderBy(asc(lessons.sortOrder));
    return { ...mod, lessons: lsns, lessonCount: lsns.length };
  },

  // ═══════════════════════════════════════════
  // LESSON
  // ═══════════════════════════════════════════

  async createLesson(input: CreateLessonInput): Promise<LessonRow> {
    const id = genId("lsn");
    const maxOrder = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(lessons)
      .where(eq(lessons.moduleId, input.moduleId));
    const sortOrder = (maxOrder[0]?.max ?? -1) + 1;

    const [row] = await db.insert(lessons).values({
      id,
      moduleId: input.moduleId,
      slug: input.slug,
      title: input.title,
      summary: input.summary ?? null,
      kind: input.kind ?? "lesson",
      sortOrder,
      status: "draft",
      xpReward: input.xpReward ?? 10,
      estimatedMinutes: input.estimatedMinutes ?? null,
      jlptLevel: input.jlptLevel ?? null,
    }).returning();

    return row!;
  },

  async updateLesson(id: string, input: Partial<Omit<CreateLessonInput, "moduleId">> & { status?: string; sortOrder?: number }): Promise<LessonRow | null> {
    const [row] = await db.update(lessons)
      .set({ ...input, updatedAt: new Date() } as never)
      .where(eq(lessons.id, id))
      .returning();
    return row ?? null;
  },

  async deleteLesson(id: string): Promise<boolean> {
    const result = await db.delete(lessons).where(eq(lessons.id, id)).returning({ id: lessons.id });
    return result.length > 0;
  },

  async getLesson(id: string): Promise<LessonDetail | null> {
    const row = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
    if (row.length === 0) return null;
    const lesson = row[0]!;

    const [items, content] = await Promise.all([
      db.select().from(lessonItems)
        .where(eq(lessonItems.lessonId, lesson.id))
        .orderBy(asc(lessonItems.sortOrder)),
      db.select().from(learningContent)
        .where(and(
          eq(learningContent.targetType, "lesson"),
          eq(learningContent.targetId, lesson.id),
        ))
        .orderBy(asc(learningContent.sortOrder)),
    ]);

    return { ...lesson, items, itemCount: items.length, content };
  },

  // ═══════════════════════════════════════════
  // LESSON ITEM
  // ═══════════════════════════════════════════

  async addItem(input: CreateLessonItemInput): Promise<LessonItemRow> {
    const id = genId("itm");
    const maxOrder = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(lessonItems)
      .where(eq(lessonItems.lessonId, input.lessonId));
    const sortOrder = (maxOrder[0]?.max ?? -1) + 1;

    const [row] = await db.insert(lessonItems).values({
      id,
      lessonId: input.lessonId,
      type: input.type,
      sortOrder,
      payload: input.payload,
      exerciseType: input.exerciseType ?? null,
      knowledgeRef: input.knowledgeRef ?? null,
    }).returning();

    return row!;
  },

  async updateItem(id: string, input: { payload?: Record<string, unknown>; sortOrder?: number; type?: string; exerciseType?: string; knowledgeRef?: string }): Promise<LessonItemRow | null> {
    const [row] = await db.update(lessonItems)
      .set(input as never)
      .where(eq(lessonItems.id, id))
      .returning();
    return row ?? null;
  },

  async deleteItem(id: string): Promise<boolean> {
    const result = await db.delete(lessonItems).where(eq(lessonItems.id, id)).returning({ id: lessonItems.id });
    return result.length > 0;
  },

  async reorderItems(lessonId: string, itemIds: string[]): Promise<void> {
    for (let i = 0; i < itemIds.length; i++) {
      await db.update(lessonItems)
        .set({ sortOrder: i })
        .where(and(eq(lessonItems.id, itemIds[i]!), eq(lessonItems.lessonId, lessonId)));
    }
  },

  // ═══════════════════════════════════════════
  // PUBLISH WORKFLOW
  // ═══════════════════════════════════════════

  /** Publish a course and all its modules and lessons. */
  async publishCourse(courseId: string): Promise<{ course: number; modules: number; lessons: number }> {
    const [c] = await db.update(courses).set({ status: "published", updatedAt: new Date() }).where(eq(courses.id, courseId)).returning({ id: courses.id });
    if (!c) return { course: 0, modules: 0, lessons: 0 };

    const mods = await db.update(courseModules).set({ status: "published", updatedAt: new Date() }).where(eq(courseModules.courseId, courseId)).returning({ id: courseModules.id });

    let lessonCount = 0;
    for (const m of mods) {
      const lsns = await db.update(lessons).set({ status: "published", updatedAt: new Date() }).where(eq(lessons.moduleId, m.id)).returning({ id: lessons.id });
      lessonCount += lsns.length;
    }

    return { course: 1, modules: mods.length, lessons: lessonCount };
  },

  // ═══════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════

  async getCourseStats(courseId: string): Promise<{
    moduleCount: number;
    lessonCount: number;
    itemCount: number;
    totalXp: number;
    totalMinutes: number;
  }> {
    const mods = await db.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, courseId));
    const moduleIds = mods.map((m) => m.id);
    if (moduleIds.length === 0) return { moduleCount: 0, lessonCount: 0, itemCount: 0, totalXp: 0, totalMinutes: 0 };

    const lsns = await db.select({
      id: lessons.id,
      xp: lessons.xpReward,
      mins: lessons.estimatedMinutes,
    }).from(lessons).where(
      sql`${lessons.moduleId} IN (${sql.join(moduleIds.map((id) => sql`${id}`), sql`, `)})`,
    );

    const lessonIds = lsns.map((l) => l.id);
    let itemCount = 0;
    if (lessonIds.length > 0) {
      const ic = await db.select({ count: sql<number>`count(*)::int` }).from(lessonItems).where(
        sql`${lessonItems.lessonId} IN (${sql.join(lessonIds.map((id) => sql`${id}`), sql`, `)})`,
      );
      itemCount = ic[0]?.count ?? 0;
    }

    return {
      moduleCount: mods.length,
      lessonCount: lsns.length,
      itemCount,
      totalXp: lsns.reduce((sum, l) => sum + (l.xp ?? 0), 0),
      totalMinutes: lsns.reduce((sum, l) => sum + (l.mins ?? 0), 0),
    };
  },
};
