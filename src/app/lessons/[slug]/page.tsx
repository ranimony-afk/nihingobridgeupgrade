import Link from "next/link";
import { notFound } from "next/navigation";

import { getLesson } from "@/services/knowledge/content";

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
      </header>

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Objectives</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {lesson.objectives.map((objective) => (
              <li key={objective} className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-600">✓</span>
                <span>{objective}</span>
              </li>
            ))}
          </ul>
        </aside>
        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Lesson</h2>
            <p className="text-xs text-slate-500">
              {lesson.structure.sectionCount} sections · {lesson.structure.vocabularyCount} words ·{" "}
              {lesson.structure.sentenceCount} sentences
            </p>
          </div>

          {lesson.sections.length === 0 ? (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
              {lesson.content ?? lesson.summary}
            </p>
          ) : (
            <div className="mt-4 space-y-5" data-testid="lesson-sections">
              {lesson.sections.map((section) => (
                <section key={section.id}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        section.kind === "practice"
                          ? "bg-violet-100 text-violet-700"
                          : section.kind === "example"
                            ? "bg-amber-100 text-amber-700"
                            : section.kind === "note"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {section.kind}
                    </span>
                    <h3 className="text-base font-semibold text-slate-900">{section.heading}</h3>
                    {section.headingJa ? (
                      <span className="jp text-sm text-slate-500">{section.headingJa}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-700">
                    {section.body}
                  </p>
                  {section.examples.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {section.examples.map((example) => (
                        <li key={example} className="jp text-base text-slate-900">
                          {example}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            <Link href="/grammar/explorer" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-900">
              Explore grammar
            </Link>
            <Link href="/search?q=Japanese" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-900">
              Search supporting knowledge
            </Link>
          </div>
        </article>
      </section>

      {lesson.knowledge.vocabulary.length > 0 || lesson.knowledge.sentences.length > 0 ? (
        <section className="grid gap-4 lg:grid-cols-2" data-testid="lesson-content-links">
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Vocabulary in this lesson</h2>
            <ul className="mt-3 grid gap-2">
              {lesson.knowledge.vocabulary.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/dictionary?q=${encodeURIComponent(entry.kanjiText)}`}
                    className="block rounded-xl border border-slate-200 px-3 py-2 hover:border-rose-500"
                  >
                    <span className="jp text-sm text-slate-900">{entry.kanjiText}</span>
                    {entry.kanaText ? (
                      <span className="jp ml-2 text-xs text-slate-500">{entry.kanaText}</span>
                    ) : null}
                    <span className="block truncate text-xs text-slate-500">
                      {entry.meanings.slice(0, 2).join("; ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Example sentences</h2>
            <ul className="mt-3 space-y-2">
              {lesson.knowledge.sentences.map((sentence) => (
                <li key={sentence.id}>
                  <Link
                    href={`/sentences/${sentence.id}`}
                    className="block rounded-xl border border-slate-200 px-3 py-2 hover:border-amber-500"
                  >
                    <span className="jp block text-sm text-slate-900">{sentence.japanese}</span>
                    <span className="block text-xs text-slate-500">{sentence.english}</span>
                    {sentence.grammarTitle ? (
                      <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {sentence.grammarTitle}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

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
