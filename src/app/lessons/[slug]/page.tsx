import Link from "next/link";
import { notFound } from "next/navigation";

import { getLesson } from "@/services/knowledge/content";
import type { LessonBlock } from "@/types/content";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const lesson = await getLesson(decodeURIComponent(slug));
  return {
    title: lesson ? `${lesson.title} | NihongoBridge` : "Lesson | NihongoBridge",
    description: lesson?.summary,
  };
}

export default async function LessonPage({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const lesson = await getLesson(decodeURIComponent(slug).trim());
  if (!lesson) notFound();

  return (
    <div className="space-y-8">
      <nav className="text-xs text-slate-500">
        <Link href="/courses" className="hover:text-slate-900">Courses</Link>
        <span className="px-1">/</span>
        <Link href={`/courses/${encodeURIComponent(lesson.courseSlug)}`} className="hover:text-slate-900">
          {lesson.courseTitle}
        </Link>
        <span className="px-1">/</span>
        <span>{lesson.title}</span>
      </nav>

      <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
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
            {lesson.estimatedMinutes} minutes
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{lesson.title}</h1>
        {lesson.titleJa ? <p className="jp mt-1 text-lg text-slate-500">{lesson.titleJa}</p> : null}
        <p className="mt-4 max-w-3xl text-base text-slate-700">{lesson.summary}</p>
        <Link
          href={`/lessons/${encodeURIComponent(lesson.slug)}/play`}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-violet-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-800"
          data-testid="start-player"
        >
          ▶ Start studying
          <span className="text-xs opacity-80">
            {lesson.sections.length} sections · {lesson.estimatedMinutes} min
          </span>
        </Link>
        <Link
          href={`/lessons/${encodeURIComponent(lesson.slug)}/practice`}
          className="mt-5 ml-2 inline-flex items-center gap-2 rounded-full border border-cyan-300 bg-cyan-50 px-5 py-2.5 text-sm font-medium text-cyan-800 transition hover:border-cyan-600"
          data-testid="start-practice"
        >
          ✎ Practice exercises
        </Link>
      </header>

      {lesson.prerequisites.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5" data-testid="lesson-prerequisites">
          <h2 className="text-sm font-semibold text-amber-950">Complete first</h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm text-amber-900">
            {lesson.prerequisites.map((item) => (
              <li key={item.slug}>
                <Link href={`/lessons/${encodeURIComponent(item.slug)}`} className="font-medium underline">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Objectives</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {lesson.objectives.map((objective) => (
                <li key={objective} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600">✓</span>
                  <span>{objective}</span>
                </li>
              ))}
            </ul>
          </div>
          {lesson.sections.length > 0 ? (
            <nav className="rounded-3xl border border-slate-200 bg-white p-6" data-testid="lesson-outline">
              <h2 className="text-sm font-semibold text-slate-900">In this lesson</h2>
              <ol className="mt-3 space-y-1.5 text-sm">
                {lesson.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.key}`} className="flex justify-between gap-2 text-slate-600 hover:text-violet-700">
                      <span>{section.title}</span>
                      <span className="text-xs text-slate-400">{section.blocks.length}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
        </aside>

        <div className="space-y-4" data-testid="lesson-sections">
          {lesson.sections.length === 0 ? (
            <article className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">Lesson overview</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
                {lesson.content ?? lesson.summary}
              </p>
            </article>
          ) : (
            lesson.sections.map((section) => (
              <article
                key={section.id}
                id={section.key}
                className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-6"
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                      {section.kind}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">{section.title}</h2>
                    {section.titleJa ? <p className="jp text-sm text-slate-500">{section.titleJa}</p> : null}
                  </div>
                  <span className="text-xs text-slate-400">{section.blocks.length} blocks</span>
                </header>
                <div className="mt-4 space-y-3">
                  {section.blocks.map((block) => (
                    <LessonBlockView key={block.id} block={block} />
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {lesson.knowledge.grammar.length > 0 || lesson.knowledge.kanji.length > 0 ? (
        <section className="grid gap-4 lg:grid-cols-2" data-testid="lesson-knowledge">
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Grammar in this lesson</h2>
            <div className="mt-3 grid gap-2">
              {lesson.knowledge.grammar.map((grammar) => (
                <Link
                  key={grammar.slug}
                  href={`/grammar/${encodeURIComponent(grammar.slug)}`}
                  className="rounded-xl border border-slate-200 px-3 py-2 hover:border-emerald-500"
                >
                  <span className="jp block text-sm text-slate-900">{grammar.title}</span>
                  {grammar.titleEn ? <span className="block text-xs text-slate-500">{grammar.titleEn}</span> : null}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Kanji in this lesson</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {lesson.knowledge.kanji.map((kanji) => (
                <Link
                  key={kanji.literal}
                  href={`/kanji/${encodeURIComponent(kanji.literal)}`}
                  title={kanji.meanings.slice(0, 3).join(", ")}
                  className="jp-glyph rounded-xl border border-slate-200 px-3 py-2 text-2xl text-slate-800 hover:border-indigo-500"
                >
                  {kanji.literal}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <nav className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 text-sm">
        {lesson.previous ? (
          <Link href={`/lessons/${encodeURIComponent(lesson.previous.slug)}`} className="text-slate-700 hover:text-violet-700">
            ← {lesson.previous.title}
          </Link>
        ) : <span className="text-xs text-slate-400">First lesson</span>}
        <Link href={`/courses/${encodeURIComponent(lesson.courseSlug)}`} className="text-xs text-slate-500 hover:text-slate-900">
          Course outline
        </Link>
        {lesson.next ? (
          <Link href={`/lessons/${encodeURIComponent(lesson.next.slug)}`} className="text-slate-700 hover:text-violet-700">
            {lesson.next.title} →
          </Link>
        ) : <span className="text-xs text-slate-400">Final lesson</span>}
      </nav>
    </div>
  );
}

const CALLOUT_STYLE: Record<string, string> = {
  tip: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-rose-200 bg-rose-50 text-rose-900",
  checkpoint: "border-violet-200 bg-violet-50 text-violet-900",
};

const REFERENCE_CHIP: Record<string, string> = {
  grammar: "bg-emerald-100 text-emerald-700",
  kanji: "bg-indigo-100 text-indigo-700",
  vocabulary: "bg-rose-100 text-rose-700",
  sentence: "bg-amber-100 text-amber-700",
};

/** Renders one lesson block. Reference blocks always link to canonical detail. */
function LessonBlockView({ block }: { block: LessonBlock }) {
  if (block.reference) {
    const chip = REFERENCE_CHIP[block.reference.kind] ?? "bg-slate-100 text-slate-600";
    const isGlyph = block.reference.kind === "kanji";
    return (
      <Link
        href={block.reference.href}
        className="flex items-start gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-violet-500"
      >
        <span
          className={`jp${isGlyph ? "-glyph" : ""} grid min-h-12 min-w-12 shrink-0 place-items-center rounded-xl bg-slate-50 px-3 text-slate-900 ${
            isGlyph ? "text-3xl" : "text-lg"
          }`}
        >
          {block.reference.label.slice(0, isGlyph ? 1 : 14)}
        </span>
        <span className="min-w-0 flex-1">
          {!isGlyph ? (
            <span className="jp block text-base text-slate-900">{block.reference.label}</span>
          ) : null}
          {block.reference.secondary ? (
            <span className="jp mt-0.5 block text-sm text-slate-600">{block.reference.secondary}</span>
          ) : null}
          {block.reference.description ? (
            <span className="mt-1 block text-xs text-slate-500">{block.reference.description}</span>
          ) : null}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${chip}`}>
          {block.reference.kind}
        </span>
      </Link>
    );
  }

  if (block.kind === "objective") {
    return (
      <p className="flex items-start gap-2 text-sm text-slate-700">
        <span className="mt-0.5 text-violet-600">•</span>
        <span>{block.body}</span>
      </p>
    );
  }

  if (block.kind === "tip" || block.kind === "warning" || block.kind === "checkpoint") {
    return (
      <div className={`rounded-2xl border px-4 py-3 ${CALLOUT_STYLE[block.kind]}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide">
          {block.title ?? block.kind}
        </p>
        <p className="mt-1 text-sm">{block.body}</p>
      </div>
    );
  }

  return <p className="max-w-3xl text-sm leading-relaxed text-slate-700">{block.body}</p>;
}
