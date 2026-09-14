import Link from "next/link";
import { notFound } from "next/navigation";

import { ExerciseRunner } from "@/components/learning/exercise-runner";
import { getLesson } from "@/services/knowledge/content";
import { getLessonExercises } from "@/services/learning/exercise-engine";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const lesson = await getLesson(decodeURIComponent(slug));
  return {
    title: lesson ? `Practice: ${lesson.title} | NihongoBridge` : "Practice | NihongoBridge",
    description: lesson?.summary,
  };
}

export default async function LessonPracticePage({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug).trim();
  const [lesson, set] = await Promise.all([getLesson(decoded), getLessonExercises(decoded)]);
  if (!lesson || !set) notFound();

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Link href="/courses" className="hover:text-slate-900">
          Courses
        </Link>
        <span>/</span>
        <Link href={`/courses/${encodeURIComponent(lesson.courseSlug)}`} className="hover:text-slate-900">
          {lesson.courseTitle}
        </Link>
        <span>/</span>
        <Link href={`/lessons/${encodeURIComponent(lesson.slug)}`} className="hover:text-slate-900">
          {lesson.title}
        </Link>
        <span>/</span>
        <span className="text-slate-700">Practice</span>
      </nav>

      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-cyan-100 px-3 py-1 font-medium text-cyan-700">Practice</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {set.exercises.length} exercises · {set.totalPoints} points
          </span>
          {lesson.jlptLevel ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              JLPT N{lesson.jlptLevel}
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
          {lesson.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-700">
          Exercises are generated from the grammar, kanji, vocabulary and corpus sentences taught in
          this lesson.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/lessons/${encodeURIComponent(lesson.slug)}/play`}
            className="rounded-full border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:border-slate-900"
          >
            ▶ Study the lesson first
          </Link>
        </div>
      </header>

      <ExerciseRunner
        lessonSlug={lesson.slug}
        exercises={set.exercises}
        totalPoints={set.totalPoints}
      />
    </div>
  );
}
