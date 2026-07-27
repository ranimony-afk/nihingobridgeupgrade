/**
 * Shared Learning Management System (LMS) Domain Logic
 */

export interface LessonSummary {
  id: number;
  slug: string;
  title: string;
  body: string;
  durationMinutes: number;
}

export interface ModuleSummary {
  id: number;
  title: string;
  position: number;
  lessons: LessonSummary[];
}

export function calculateCourseDuration(modules: ModuleSummary[]): number {
  return modules.reduce((acc, m) => {
    return acc + m.lessons.reduce((lAcc, l) => lAcc + (l.durationMinutes || 0), 0);
  }, 0);
}
