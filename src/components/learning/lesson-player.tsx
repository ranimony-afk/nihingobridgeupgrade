"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LessonBlock, LessonOutlineDetail, LessonSection } from "@/types/content";

const SECTION_ACCENT: Record<string, { chip: string; bar: string; label: string }> = {
  concept: { chip: "bg-slate-100 text-slate-700", bar: "bg-slate-500", label: "Concept" },
  grammar: { chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", label: "Grammar" },
  kanji: { chip: "bg-indigo-100 text-indigo-700", bar: "bg-indigo-500", label: "Kanji" },
  vocabulary: { chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500", label: "Vocabulary" },
  examples: { chip: "bg-amber-100 text-amber-700", bar: "bg-amber-500", label: "Examples" },
  practice: { chip: "bg-cyan-100 text-cyan-700", bar: "bg-cyan-500", label: "Practice" },
  summary: { chip: "bg-violet-100 text-violet-700", bar: "bg-violet-500", label: "Review" },
};

const REFERENCE_CHIP: Record<string, string> = {
  grammar: "bg-emerald-100 text-emerald-700",
  kanji: "bg-indigo-100 text-indigo-700",
  vocabulary: "bg-rose-100 text-rose-700",
  sentence: "bg-amber-100 text-amber-700",
};

const CALLOUT: Record<string, string> = {
  tip: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-rose-200 bg-rose-50 text-rose-900",
  checkpoint: "border-violet-200 bg-violet-50 text-violet-900",
};

interface PlayerState {
  index: number;
  completed: string[];
  updatedAt: number;
}

/**
 * Interactive lesson player.
 *
 * Steps through the canonical `lesson_sections` produced in phase 09.2. Section
 * content is never invented here: every block is rendered from the server
 * payload, and knowledge blocks always link to their canonical detail route.
 *
 * Progress is intentionally client-side only (localStorage). Server-side
 * progress requires authentication and is deferred to a later phase; the key is
 * versioned so a future migration to user-owned progress is unambiguous.
 */
export function LessonPlayer({
  lesson,
  initialCompleted = [],
}: {
  lesson: LessonOutlineDetail;
  initialCompleted?: string[];
}) {
  const sections = lesson.sections;
  const storageKey = `nb.player.v1.${lesson.slug}`;

  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set(initialCompleted));
  const [restored, setRestored] = useState(false);
  const [finished, setFinished] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Restore prior position after mount (never during render).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as PlayerState;
          const keys = new Set(sections.map((section) => section.key));
          const validCompleted = (parsed.completed ?? []).filter((key) => keys.has(key));
          setCompleted(new Set(validCompleted));
          if (Number.isInteger(parsed.index)) {
            setIndex(Math.min(Math.max(parsed.index, 0), Math.max(sections.length - 1, 0)));
          }
        }
      } catch {
        // Corrupt or unavailable storage must never block the lesson.
      }
      setRestored(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [storageKey, sections]);

  // Persist after the user has actually interacted.
  useEffect(() => {
    if (!restored) return;
    try {
      const state: PlayerState = {
        index,
        completed: [...completed],
        updatedAt: Date.now(),
      };
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Private browsing / quota errors are non-fatal.
    }
  }, [restored, index, completed, storageKey]);

  const current = sections[index] ?? null;
  const total = sections.length;
  const completedCount = completed.size;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  const goTo = useCallback(
    (next: number) => {
      setFinished(false);
      setIndex(Math.min(Math.max(next, 0), Math.max(total - 1, 0)));
      headingRef.current?.focus();
    },
    [total],
  );

  const completeCurrent = useCallback(() => {
    if (!current) return;
    setCompleted((previous) => {
      const next = new Set(previous);
      next.add(current.key);
      return next;
    });
    // Durable progress: recorded server-side against the learner profile.
    void fetch(`/api/progress/lesson/${encodeURIComponent(lesson.slug)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sectionKey: current.key }),
    }).catch(() => undefined);
    if (index < total - 1) goTo(index + 1);
    else setFinished(true);
  }, [current, index, total, goTo, lesson.slug]);

  // Keyboard navigation for desk study.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        completeCurrent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo, completeCurrent]);

  const reset = () => {
    setCompleted(new Set());
    setFinished(false);
    setIndex(0);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  };

  const referenceCount = useMemo(
    () => (current ? current.blocks.filter((block) => block.reference).length : 0),
    [current],
  );

  if (total === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        This lesson has no player sections yet. Run the lesson architecture pipeline.
      </div>
    );
  }

  const accent = current ? SECTION_ACCENT[current.kind] ?? SECTION_ACCENT.concept : SECTION_ACCENT.concept;

  return (
    <div className="space-y-4" data-testid="lesson-player">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">
              Step <strong className="text-slate-800">{index + 1}</strong> of {total} ·{" "}
              {completedCount} completed
            </p>
            <div className="mt-2 h-2 w-64 max-w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${accent.bar}`}
                style={{ width: `${percent}%` }}
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Lesson progress"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-400"
            >
              Restart
            </button>
            <Link
              href={`/lessons/${encodeURIComponent(lesson.slug)}`}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-900"
            >
              Read full lesson
            </Link>
          </div>
        </div>

        <ol className="mt-4 flex flex-wrap gap-1.5" data-testid="player-steps">
          {sections.map((section, sectionIndex) => {
            const isCurrent = sectionIndex === index;
            const isDone = completed.has(section.key);
            return (
              <li key={section.key}>
                <button
                  type="button"
                  onClick={() => goTo(sectionIndex)}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    isCurrent
                      ? "border-slate-900 bg-slate-900 text-white"
                      : isDone
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"
                  }`}
                >
                  {isDone && !isCurrent ? "✓ " : ""}
                  {section.title}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {finished ? (
        <section
          className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center"
          data-testid="player-complete"
        >
          <p className="text-4xl">🎉</p>
          <h2 className="mt-3 text-xl font-semibold text-emerald-950">Lesson complete</h2>
          <p className="mt-2 text-sm text-emerald-900">
            You worked through all {total} sections of {lesson.title}.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {lesson.next ? (
              <Link
                href={`/lessons/${encodeURIComponent(lesson.next.slug)}/play`}
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
              >
                Next lesson: {lesson.next.title} →
              </Link>
            ) : (
              <Link
                href={`/courses/${encodeURIComponent(lesson.courseSlug)}`}
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
              >
                Back to {lesson.courseTitle}
              </Link>
            )}
            <Link
              href="/dashboard"
              className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 transition hover:border-emerald-600"
            >
              View progress
            </Link>
            <Link
              href={`/lessons/${encodeURIComponent(lesson.slug)}/practice`}
              className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 transition hover:border-emerald-600"
            >
              ✎ Practice this lesson
            </Link>
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-emerald-300 px-4 py-2 text-sm text-emerald-900 transition hover:border-emerald-600"
            >
              Study again
            </button>
          </div>
        </section>
      ) : current ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6" data-testid="player-section">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${accent.chip}`}>
                {accent.label}
              </span>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 outline-none"
              >
                {current.title}
              </h2>
              {current.titleJa ? <p className="jp text-sm text-slate-500">{current.titleJa}</p> : null}
            </div>
            <span className="text-xs text-slate-400">
              {current.blocks.length} blocks
              {referenceCount > 0 ? ` · ${referenceCount} linked` : ""}
            </span>
          </header>

          {current.summary ? (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-700">{current.summary}</p>
          ) : null}

          <div className="mt-5 space-y-3">
            {current.blocks.map((block) => (
              <PlayerBlock key={block.id} block={block} />
            ))}
          </div>

          {current.kind === "practice" ? (
            <Link
              href={`/lessons/${encodeURIComponent(lesson.slug)}/practice`}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-800"
              data-testid="player-practice-cta"
            >
              ✎ Open practice exercises
            </Link>
          ) : null}
        </section>
      ) : null}

      {!finished ? (
        <nav className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:border-slate-900 disabled:opacity-40"
          >
            ← Previous
          </button>
          <p className="hidden text-[11px] text-slate-400 sm:block">
            Keyboard: ← previous · → next · Enter to mark complete
          </p>
          <button
            type="button"
            onClick={completeCurrent}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            {index === total - 1 ? "Finish lesson" : "Mark complete & continue →"}
          </button>
        </nav>
      ) : null}

      <p className="text-center text-[11px] text-slate-400">
        Progress is saved to your learner profile. Sign-in arrives with the accounts phase.
      </p>
    </div>
  );
}

function PlayerBlock({ block }: { block: LessonBlock }) {
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
      <div className={`rounded-2xl border px-4 py-3 ${CALLOUT[block.kind]}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide">{block.title ?? block.kind}</p>
        <p className="mt-1 text-sm">{block.body}</p>
      </div>
    );
  }

  return <p className="max-w-3xl text-base leading-relaxed text-slate-700">{block.body}</p>;
}

export type { LessonSection };
