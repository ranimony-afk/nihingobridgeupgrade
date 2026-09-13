import Link from "next/link";

import { readLearner } from "@/services/learning/session";
import { getDashboard } from "@/services/learning/progress";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your progress | NihongoBridge",
  description: "Course and lesson progress, exercise accuracy and points.",
};

const EMPTY = {
  courses: [],
  lessons: [],
  totals: { lessonsStarted: 0, lessonsCompleted: 0, attempts: 0, correct: 0, points: 0, accuracy: 0 },
};

export default async function DashboardPage() {
  const learner = await readLearner();
  const dashboard = learner ? await getDashboard(learner.id) : EMPTY;
  const { totals } = dashboard;

  return (
    <div className="space-y-8" data-testid="dashboard">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Your progress</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Progress is recorded as you study lessons and answer exercises. Scores come from
            server-side grading.
          </p>
        </div>
        <Link
          href="/courses"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-900"
        >
          Browse courses →
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Lessons started", value: totals.lessonsStarted },
          { label: "Lessons completed", value: totals.lessonsCompleted },
          { label: "Exercise attempts", value: totals.attempts },
          { label: "Accuracy", value: `${totals.accuracy}%` },
          { label: "Points earned", value: totals.points },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6" data-testid="dashboard-courses">
        <h2 className="text-lg font-semibold text-slate-900">Courses</h2>
        {dashboard.courses.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No course progress yet.{" "}
            <Link href="/courses" className="underline">
              Start a course
            </Link>{" "}
            to begin tracking.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {dashboard.courses.map((course) => (
              <li key={course.courseSlug}>
                <Link
                  href={`/courses/${encodeURIComponent(course.courseSlug)}`}
                  className="block rounded-2xl border border-slate-200 p-4 transition hover:border-sky-500"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{course.courseTitle}</span>
                    <span className="text-xs text-slate-500">
                      {course.lessonsCompleted}/{course.lessonsTotal} lessons · {course.percent}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${course.status === "completed" ? "bg-emerald-500" : "bg-sky-500"}`}
                      style={{ width: `${course.percent}%` }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6" data-testid="dashboard-lessons">
        <h2 className="text-lg font-semibold text-slate-900">Recent lessons</h2>
        {dashboard.lessons.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No lesson activity recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {dashboard.lessons.map((lesson) => (
              <li key={lesson.lessonSlug} className="flex flex-wrap items-center gap-3 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    lesson.status === "completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {lesson.status === "completed" ? "completed" : "in progress"}
                </span>
                <Link
                  href={`/lessons/${encodeURIComponent(lesson.lessonSlug)}`}
                  className="font-medium text-slate-800 hover:text-violet-700"
                >
                  {lesson.lessonTitle}
                </Link>
                <span className="text-xs text-slate-400">{lesson.courseTitle}</span>
                <span className="ml-auto text-xs text-slate-500">
                  {lesson.sectionsDone}/{lesson.sectionsTotal} sections
                  {lesson.attempts > 0 ? ` · best ${lesson.bestPercent}%` : ""}
                </span>
                <Link
                  href={`/lessons/${encodeURIComponent(lesson.lessonSlug)}/practice`}
                  className="text-xs font-medium text-cyan-700 hover:underline"
                >
                  practice
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-[11px] text-slate-400">
        {learner
          ? "Progress is tied to an anonymous learner profile on this device. Sign-in arrives with the accounts phase."
          : "Start a lesson to create your learner profile."}
      </p>
    </div>
  );
}
