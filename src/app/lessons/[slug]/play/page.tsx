import Link from "next/link";
import { notFound } from "next/navigation";

import { LessonPlayer } from "@/components/learning/lesson-player";
import { getLesson } from "@/services/knowledge/content";
import { getLessonProgress } from "@/services/learning/progress";
import { readLearner } from "@/services/learning/session";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const lesson = await getLesson(decodeURIComponent(slug));
  return {
    title: lesson ? `Study: ${lesson.title} | NihongoBridge` : "Lesson player | NihongoBridge",
    description: lesson?.summary,
  };
}

export default async function LessonPlayerPage({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const lesson = await getLesson(decodeURIComponent(slug).trim());
  if (!lesson) notFound();

  const learner = await readLearner();
  const progress = learner ? await getLessonProgress(learner.id, lesson.slug) : null;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Link href="/courses" className="hover:text-slate-900">
          Courses
        </Link>
        <span>/</span>
        <Link
          href={`/courses/${encodeURIComponent(lesson.courseSlug)}`}
          className="hover:text-slate-900"
        >
          {lesson.courseTitle}
        </Link>
        <span>/</span>
        <Link href={`/lessons/${encodeURIComponent(lesson.slug)}`} className="hover:text-slate-900">
          {lesson.title}
        </Link>
        <span>/</span>
        <span className="text-slate-700">Study</span>
      </nav>

      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-violet-100 px-3 py-1 font-medium text-violet-700">
            {lesson.moduleTitle ? `${lesson.moduleTitle} · ` : ""}Lesson {lesson.position}
          </span>
          {lesson.jlptLevel ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              JLPT N{lesson.jlptLevel}
            </span>
          ) : null}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {lesson.estimatedMinutes} min · {lesson.sections.length} sections · {lesson.blockCount} blocks
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{lesson.title}</h1>
        {lesson.titleJa ? <p className="jp mt-1 text-lg text-slate-500">{lesson.titleJa}</p> : null}
        <p className="mt-3 max-w-3xl text-sm text-slate-700">{lesson.summary}</p>
      </header>

      {lesson.prerequisites.length > 0 ? (
        <section
          className="rounded-3xl border border-amber-200 bg-amber-50 p-4"
          data-testid="player-prerequisites"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-950">
            Recommended first
          </p>
          <ul className="mt-2 flex flex-wrap gap-3 text-sm text-amber-900">
            {lesson.prerequisites.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/lessons/${encodeURIComponent(item.slug)}/play`}
                  className="font-medium underline"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <LessonPlayer lesson={lesson} initialCompleted={progress?.completedSections ?? []} />

      {/*
        Server-rendered fallback: guarantees every section and knowledge link is
        present in the initial HTML for crawlers and no-JS clients.
      */}
      <noscript>
        <div className="space-y-4">
          {lesson.sections.map((section) => (
            <section key={section.id} className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              {section.summary ? (
                <p className="mt-2 text-sm text-slate-700">{section.summary}</p>
              ) : null}
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {section.blocks.map((block) => (
                  <li key={block.id}>
                    {block.reference ? (
                      <Link href={block.reference.href} className="underline">
                        {block.reference.label}
                      </Link>
                    ) : (
                      block.body
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </noscript>
    </div>
  );
}
