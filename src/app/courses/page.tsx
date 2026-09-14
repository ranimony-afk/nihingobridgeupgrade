import Link from "next/link";

import { getCourseCatalog } from "@/services/knowledge/content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Courses | NihongoBridge",
  description: "Japanese learning paths connected to NihongoBridge knowledge.",
};

export default async function CoursesPage() {
  const courses = await getCourseCatalog();
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Courses</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Structured paths that connect grammar, dictionary, kanji and sentence knowledge. Search
          courses and lessons from the unified Search page.
        </p>
        <Link
          href="/search?types=course,lesson&q=Japanese"
          className="mt-4 inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:border-slate-900"
        >
          Search learning content →
        </Link>
      </header>

      {courses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          The learning catalogue has not been provisioned yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${encodeURIComponent(course.slug)}`}
              className="rounded-3xl border border-slate-200 bg-white p-6 transition hover:border-sky-500 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                  {course.jlptLevel ? `JLPT N${course.jlptLevel}` : course.difficulty}
                </span>
                <span className="text-xs text-slate-400">{course.lessonCount} lessons</span>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">{course.title}</h2>
              {course.titleJa ? <p className="jp mt-1 text-sm text-slate-500">{course.titleJa}</p> : null}
              <p className="mt-3 text-sm text-slate-600">{course.summary}</p>
              <p className="mt-4 text-xs text-slate-400">
                {course.estimatedMinutes} min · {course.difficulty}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
