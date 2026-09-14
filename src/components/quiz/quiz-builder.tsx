"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Quiz builder.
 *
 * Starts a run by POSTing the filters to `/api/quiz/runs`. The server samples
 * the bank, freezes the order and the clock, and returns questions without
 * answers — so the composition of a quiz is never guessable from the client.
 */

const SKILLS = [
  { value: "kanji", label: "Kanji" },
  { value: "vocabulary", label: "Vocabulary" },
  { value: "grammar", label: "Grammar" },
  { value: "reading", label: "Reading" },
];

const LEVELS = [
  { value: "", label: "All levels" },
  { value: "5", label: "N5" },
  { value: "4", label: "N4" },
  { value: "3", label: "N3" },
  { value: "2", label: "N2" },
  { value: "1", label: "N1" },
];

const LENGTHS = [5, 10, 20, 30, 50];

export function QuizBuilder({ bankTotals }: { bankTotals: number }) {
  const router = useRouter();
  const [skills, setSkills] = useState<string[]>([]);
  const [level, setLevel] = useState("");
  const [limit, setLimit] = useState(10);
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(10);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSkill = (value: string) =>
    setSkills((previous) =>
      previous.includes(value) ? previous.filter((entry) => entry !== value) : [...previous, value],
    );

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/quiz/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "quiz",
          title: title.trim() || undefined,
          jlpt: level ? Number(level) : null,
          skills,
          limit,
          timeLimitSeconds: timed ? minutes * 60 : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "Could not start the quiz.");
        return;
      }
      router.push(`/quiz/${payload.data.run.publicId}`);
    } catch {
      setError("Network error — the quiz was not started.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white p-6"
      data-testid="quiz-builder"
    >
      <h2 className="text-lg font-semibold text-slate-900">Build a quiz</h2>
      <p className="mt-1 text-sm text-slate-600">
        Questions are sampled from {bankTotals.toLocaleString()} bank items. The order and the
        clock are frozen server-side when the run starts.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Skills
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SKILLS.map((skill) => {
              const active = skills.includes(skill.value);
              return (
                <button
                  key={skill.value}
                  type="button"
                  onClick={() => toggleSkill(skill.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {skill.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Level
            </label>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {LEVELS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Length
            </label>
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {LENGTHS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry} questions
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Name (optional)
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Morning drill"
              maxLength={120}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={timed}
              onChange={(event) => setTimed(event.target.checked)}
              className="h-4 w-4"
            />
            Timed
          </label>
          {timed ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="text-slate-500">Minutes</span>
              <input
                type="number"
                min={1}
                max={120}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
                className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="ml-auto rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            data-testid="quiz-start"
          >
            {busy ? "Starting…" : "Start quiz →"}
          </button>
        </div>

        {error ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
