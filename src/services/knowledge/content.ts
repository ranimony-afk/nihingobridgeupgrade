import "server-only";

import {
  getCourseBySlug,
  getLessonBySlug,
  getSentenceById,
  listCourses,
} from "@/repositories/content";

export async function getSentence(id: number) {
  try {
    return await getSentenceById(id);
  } catch {
    return null;
  }
}

export async function getCourseCatalog() {
  try {
    return await listCourses();
  } catch {
    return [];
  }
}

export async function getCourse(slug: string) {
  try {
    return await getCourseBySlug(slug);
  } catch {
    return null;
  }
}

export async function getLesson(slug: string) {
  try {
    return await getLessonBySlug(slug);
  } catch {
    return null;
  }
}
