import Link from "next/link";
import { notFound } from "next/navigation";

import { getCourse } from "@/services/knowledge/content";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const course = await getCourse(decodeURIComponent(slug));
  return {
    title: course ? `${course.title} | NihongoBridge` : "Course | NihongoBridge",
    description: course?.summary,
  };
}

export default async function CoursePage({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const course = await getCourse(decodeURIComponent(slug).trim());
  if (!course) notFound();

  return (
    <div className="space-y-8">
      <nav className="text-xs text-slate-500">
        <Link href="/courses" className="hover:text-slate-900">Courses</Link>
        <span className="px-1">/</span>
        <span>{course.title}</span>
      </nav>

      <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">
            {course.jlptLevel ? `JLPT N${course.jlptLevel}` : "Course"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{course.difficulty}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {course.lessonCount} lessons · {course.estimatedMinutes} min
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{course.title}</h1>
        {course.titleJa ? <p className="jp mt-1 text-lg text-slate-500">{course.titleJa}</p> : null}
        <p className="mt-4 max-w-3xl text-base text-slate-700">{course.summary}</p>
        {course.description ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{course.description}</p>
        ) : null}
        {course.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {course.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {course.prerequisites.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-950">Before you begin</h2>
          <ul className="mt-2 space-y-2 text-sm text-amber-900">
            {course.prerequisites.map((item) => (
              <li key={item.slug} className="flex flex-wrap items-center gap-2">
                <Link href={`/courses/${encodeURIComponent(item.slug)}`} className="font-medium underline">
                  {item.title}
                </Link>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] uppercase">
                  {item.required ? "required" : "recommended"}
                </span>
                {item.note ? <span className="text-xs">{item.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4" data-testid="course-outline">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Course outline</h2>
          <p className="mt-1 text-xs text-slate-500">
            {course.modules.length} modules · {course.lessonCount} lessons · {course.estimatedMinutes} minutes
          </p>
        </div>
        {course.modules.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            Module architecture has not been provisioned yet.
          </p>
        ) : (
          course.modules.map((module) => (
            <article key={module.id} className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                    Module {module.position}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{module.title}</h3>
                  {module.titleJa ? <p className="jp text-sm text-slate-500">{module.titleJa}</p> : null}
                  {module.summary ? <p className="mt-2 text-sm text-slate-600">{module.summary}</p> : null}
                </div>
                <span className="text-xs text-slate-400">
                  {module.lessons.length} lessons · {module.estimatedMinutes} min
                </span>
              </div>
              <ol className="mt-4 space-y-2">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link
                      href={`/lessons/${encodeURIComponent(lesson.slug)}`}
                      className="flex items-start gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-violet-500"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                        {lesson.position}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-900">{lesson.title}</span>
                        {lesson.titleJa ? <span className="jp block text-xs text-slate-500">{lesson.titleJa}</span> : null}
                        <span className="mt-1 block text-sm text-slate-600">{lesson.summary}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{lesson.estimatedMinutes} min</span>
                    </Link>
                    <Link
                      href={`/lessons/${encodeURIComponent(lesson.slug)}/play`}
                      className="mt-1 inline-block text-xs font-medium text-violet-700 hover:underline"
                    >
                      ▶ Study this lesson
                    </Link>
                  </li>
                ))}
              </ol>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
