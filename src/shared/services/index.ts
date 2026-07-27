/**
 * Consolidated Shared Services Layer (Phase 3 Enterprise Headless CMS)
 */

import { db } from "@/db";
import {
  brands,
  courses,
  modules,
  lessons,
  pages,
  contentSections,
  brandSettings,
  contentVersions,
  auditLogs,
} from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { getBrand, listBrands } from "@/lib/brands";

export const BrandService = {
  getStaticConfig: getBrand,
  listStaticConfigs: listBrands,

  async getAll() {
    return db.select().from(brands);
  },

  async getBySlug(slug: string) {
    const rows = await db.select().from(brands).where(eq(brands.slug, slug)).limit(1);
    return rows[0] ?? null;
  },
};

export const CourseService = {
  async getPublished(brandId?: number, locale = "en") {
    const filters = [eq(courses.status, "published"), eq(courses.locale, locale)];
    if (brandId) filters.push(eq(courses.brandId, brandId));
    return db.select().from(courses).where(and(...filters));
  },

  async getWithModules(brandId: number, slug: string, locale = "en") {
    const courseRows = await db
      .select()
      .from(courses)
      .where(and(eq(courses.brandId, brandId), eq(courses.slug, slug), eq(courses.locale, locale)))
      .limit(1);
    if (courseRows.length === 0) return null;

    const course = courseRows[0];
    const modRows = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, course.id))
      .orderBy(asc(modules.position));

    const modulesWithLessons = await Promise.all(
      modRows.map(async (m) => {
        const lessonRows = await db
          .select()
          .from(lessons)
          .where(eq(lessons.moduleId, m.id))
          .orderBy(asc(lessons.position));
        return { ...m, lessons: lessonRows };
      }),
    );

    return { ...course, modules: modulesWithLessons };
  },
};

export const PageService = {
  async getPublished(brandId: number, slug: string, locale = "en") {
    const rows = await db
      .select()
      .from(pages)
      .where(
        and(
          eq(pages.brandId, brandId),
          eq(pages.slug, slug),
          eq(pages.locale, locale),
          eq(pages.status, "published"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },
};

export const CmsService = {
  async getSections(brandId: number, pageSlug = "home", locale = "en") {
    return db
      .select()
      .from(contentSections)
      .where(
        and(
          eq(contentSections.brandId, brandId),
          eq(contentSections.pageSlug, pageSlug),
          eq(contentSections.locale, locale),
          eq(contentSections.status, "published"),
        ),
      )
      .orderBy(asc(contentSections.position));
  },

  async getAllSections(brandId: number, pageSlug = "home", locale = "en") {
    return db
      .select()
      .from(contentSections)
      .where(
        and(
          eq(contentSections.brandId, brandId),
          eq(contentSections.pageSlug, pageSlug),
          eq(contentSections.locale, locale),
        ),
      )
      .orderBy(asc(contentSections.position));
  },

  async listPages(brandId: number, locale = "en") {
    const rows = await db
      .select({ pageSlug: contentSections.pageSlug })
      .from(contentSections)
      .where(and(eq(contentSections.brandId, brandId), eq(contentSections.locale, locale)));
    return Array.from(new Set(rows.map((r) => r.pageSlug)));
  },

  async getSectionById(id: number) {
    const rows = await db.select().from(contentSections).where(eq(contentSections.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async getSettings(brandId: number, category: string) {
    const rows = await db
      .select()
      .from(brandSettings)
      .where(and(eq(brandSettings.brandId, brandId), eq(brandSettings.category, category)))
      .limit(1);
    return rows[0]?.data ?? null;
  },

  async getVersionHistory(entityType: string, entityId: number) {
    return db
      .select()
      .from(contentVersions)
      .where(and(eq(contentVersions.entityType, entityType), eq(contentVersions.entityId, entityId)))
      .orderBy(desc(contentVersions.createdAt));
  },

  async getAuditLogs(limit = 50) {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  },
};
