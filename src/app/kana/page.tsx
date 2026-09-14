"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers, Loader2, Plus, RefreshCw, Volume2, Zap, Check, Info } from "lucide-react";

interface KanaChartGroup {
  rowKey: string;
  rowLabel: string;
  category: string;
  hiragana: Array<{ id: string; character: string; romaji: string }>;
  katakana: Array<{ id: string; character: string; romaji: string }>;
}

interface ChartResponse {
  success: boolean;
  groups: KanaChartGroup[];
  total: number;
  sourceRef: string;
}

const CATEGORY_META: Record<string, { label: string; japanese: string; tone: string; hint: string }> = {
  gojuon: {
    label: "Base",
    japanese: "五十音",
    tone: "bg-indigo-100 text-indigo-700",
    hint: "The 46 foundational kana every learner starts with.",
  },
  dakuten: {
    label: "Dakuten",
    japanese: "濁音",
    tone: "bg-amber-100 text-amber-700",
    hint: "Add ゛ to unvoice→voice: か→が, さ→ざ, た→だ, は→ば.",
  },
  handakuten: {
    label: "Handakuten",
    japanese: "半濁音",
    tone: "bg-rose-100 text-rose-700",
    hint: "Add ゜ to the H row only: は→ぱ.",
  },
  yoon: {
    label: "Contracted",
    japanese: "拗音",
    tone: "bg-emerald-100 text-emerald-700",
    hint: "An -i kana plus a small ゃ/ゅ/ょ forms one mora (きゃ = kya).",
  },
};

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.85;
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith("ja"));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

export default function KanaChartPage() {
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [script, setScript] = useState<"both" | "hiragana" | "katakana">("both");
  const [category, setCategory] = useState<string>("all");
  const [showRomaji, setShowRomaji] = useState(true);
  const [quizMode, setQuizMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Quiz state
  const [prompt, setPrompt] = useState<{ character: string; romaji: string; id: string } | null>(null);
  const [choices, setChoices] = useState<Array<{ romaji: string; correct: boolean }>>([]);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (script !== "both") params.set("script", script);
      if (category !== "all") params.set("category", category);
      const res = await fetch(`/api/kana?${params.toString()}`);
      const json: ChartResponse = await res.json();
      if (json.success) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [script, category]);

  useEffect(() => {
    load();
  }, [load]);

  /** Pool of visible kana used by the quiz generator. */
  const pool = useMemo(() => {
    if (!data) return [];
    const cells = data.groups.flatMap((g) =>
      script === "both"
        ? [...g.hiragana.map((c) => ({ ...c, script: "hiragana" })), ...g.katakana.map((c) => ({ ...c, script: "katakana" }))]
        : script === "hiragana"
        ? g.hiragana.map((c) => ({ ...c, script: "hiragana" }))
        : g.katakana.map((c) => ({ ...c, script: "katakana" }))
    );
    return cells;
  }, [data, script]);

  const nextQuestion = useCallback(() => {
    if (pool.length < 4) return;
    const answer = pool[Math.floor(Math.random() * pool.length)];
    const distractors: typeof pool = [];
    while (distractors.length < 3) {
      const cand = pool[Math.floor(Math.random() * pool.length)];
      if (cand.romaji !== answer.romaji && !distractors.some((d) => d.romaji === cand.romaji)) {
        distractors.push(cand);
      }
    }
    setPrompt(answer);
    setChoices(
      [answer, ...distractors]
        .map((c) => ({ romaji: c.romaji, correct: c.romaji === answer.romaji }))
        .sort(() => Math.random() - 0.5)
    );
    setPicked(null);
  }, [pool]);

  useEffect(() => {
    if (quizMode) nextQuestion();
  }, [quizMode, nextQuestion]);

  const addToSrs = async (payload: Record<string, unknown>, label: string) => {
    setBusy(label);
    setNotice(null);
    try {
      const res = await fetch("/api/knowledge/srs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setNotice(
          json.created === false
            ? `Already in your deck (${json.deckId}).`
            : `Added to ${json.deckId} — study it under SRS Review.`
        );
      } else setNotice(json.error);
    } finally {
      setBusy(null);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Loading kana chart…</p>
      </div>
    );
  }

  const total = score.right + score.wrong;

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Knowledge Layer
              </span>
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Kana Charts
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              かな表 — Interactive Kana Chart
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {data.total} entries · {data.sourceRef} · click any kana for audio, mnemonic and SRS
              export
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setQuizMode(!quizMode)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-sm transition-colors ${
                quizMode
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Zap className="h-4 w-4 fill-current" /> {quizMode ? "Exit quiz" : "Quiz me"}
            </button>
            <button
              onClick={() => setShowRomaji(!showRomaji)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {showRomaji ? "Hide romaji" : "Show romaji"}
            </button>
            <Link
              href="/kanji"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Kanji Mind Tree
            </Link>
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900">
            {notice}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-1.5">
            {(["both", "hiragana", "katakana"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScript(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all ${
                  script === s
                    ? "bg-slate-900 text-white shadow-xs"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {s === "both" ? "Both scripts" : s === "hiragana" ? "ひらがな" : "カタカナ"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
            <button
              onClick={() => setCategory("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                category === "all"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              All groups
            </button>
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  category === key ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {meta.japanese}
              </button>
            ))}
          </div>

          <button
            onClick={load}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Quiz */}
        {quizMode && prompt && (
          <div className="rounded-3xl border-2 border-red-200 bg-white p-6 shadow-lg shadow-red-100/50">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900">What is the reading?</h3>
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-emerald-700">
                  ✓ {score.right}
                </span>
                <span className="rounded-lg bg-rose-100 px-2.5 py-1 text-rose-700">
                  ✗ {score.wrong}
                </span>
                {total > 0 && (
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">
                    {Math.round((score.right / total) * 100)}%
                  </span>
                )}
              </div>
            </div>

            <div className="py-8 text-center">
              <button
                onClick={() => speak(prompt.character)}
                className="font-japanese text-7xl font-bold text-slate-950 transition-transform hover:scale-105"
              >
                {prompt.character}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {choices.map((c) => {
                const isPicked = picked === c.romaji;
                const state = !picked
                  ? "border-slate-200 bg-white hover:border-slate-400"
                  : c.correct
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : isPicked
                  ? "border-rose-500 bg-rose-50 text-rose-900"
                  : "border-slate-200 bg-white opacity-50";
                return (
                  <button
                    key={c.romaji}
                    onClick={() => {
                      if (picked) return;
                      setPicked(c.romaji);
                      setScore((s) =>
                        c.correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }
                      );
                      speak(prompt.character);
                      setTimeout(nextQuestion, 1100);
                    }}
                    className={`rounded-2xl border-2 py-3.5 text-sm font-bold transition-all ${state}`}
                  >
                    {c.romaji}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={nextQuestion}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Skip
              </button>
              <button
                onClick={() =>
                  addToSrs(
                    { target: "kana-row", rowKey: prompt.id.split("-").slice(2).join("-") || "a", script: script === "katakana" ? "katakana" : "hiragana" },
                    "row"
                  )
                }
                disabled={busy !== null}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add this row to SRS
              </button>
            </div>
          </div>
        )}

        {/* Group legend */}
        {category === "all" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-300"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>
                    {meta.japanese}
                  </span>
                  <strong className="text-xs text-slate-900">{meta.label}</strong>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{meta.hint}</p>
              </button>
            ))}
          </div>
        )}

        {/* The chart */}
        <div className="space-y-3">
          {data.groups.map((group) => {
            const meta = CATEGORY_META[group.category];
            return (
              <div
                key={group.rowKey}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>
                      {meta.japanese}
                    </span>
                    <strong className="text-xs font-bold text-slate-900">{group.rowLabel}</strong>
                  </div>
                  <button
                    onClick={() =>
                      addToSrs(
                        {
                          target: "kana-row",
                          rowKey: group.rowKey,
                          script: script === "katakana" ? "katakana" : "hiragana",
                        },
                        `row-${group.rowKey}`
                      )
                    }
                    disabled={busy !== null}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busy === `row-${group.rowKey}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Add row to SRS
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(script === "katakana"
                    ? group.katakana
                    : script === "hiragana"
                    ? group.hiragana
                    : [
                        ...group.hiragana.map((c) => ({ ...c, s: "hiragana" as const })),
                        ...group.katakana.map((c) => ({ ...c, s: "katakana" as const })),
                      ]
                  ).map((cell) => {
                    const cellScript =
                      "s" in cell ? (cell as { s: "hiragana" | "katakana" }).s : script === "katakana" ? "katakana" : "hiragana";
                    const fullId = `${cellScript === "hiragana" ? "hira" : "kata"}-${cell.romaji}-${group.rowKey}`;
                    const isSelected = selected === fullId;

                    return (
                      <button
                        key={fullId}
                        onClick={() => {
                          setSelected(isSelected ? null : fullId);
                          speak(cell.character);
                        }}
                        className={`group relative flex h-[74px] w-[74px] flex-col items-center justify-center rounded-2xl border-2 transition-all ${
                          isSelected
                            ? "border-red-500 bg-red-50 ring-2 ring-red-200"
                            : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-japanese text-3xl font-bold leading-none text-slate-900">
                          {cell.character}
                        </span>
                        {showRomaji && (
                          <span className="mt-1 text-[10px] font-semibold text-slate-500">
                            {cell.romaji}
                          </span>
                        )}
                        <Volume2 className="absolute right-1 top-1 h-2.5 w-2.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    );
                  })}
                </div>

                {/* Expanded detail for the selected kana */}
                {selected && (
                  <SelectedDetail
                    kanaId={selected}
                    busy={busy}
                    onAdd={(payload, label) => addToSrs(payload, label)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {data.groups.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <Info className="mx-auto mb-2 h-9 w-9 text-slate-300" />
            <p className="text-sm font-bold text-slate-800">No kana match these filters</p>
          </div>
        )}
      </div>
    </main>
  );
}

/* ============================================================
 * Selected kana detail + SRS export
 * ============================================================ */
function SelectedDetail({
  kanaId,
  busy,
  onAdd,
}: {
  kanaId: string;
  busy: string | null;
  onAdd: (payload: Record<string, unknown>, label: string) => void;
}) {
  const [entry, setEntry] = useState<{
    character: string;
    romaji: string;
    script: string;
    category: string;
    rowKey: string;
    rowLabel: string;
    mnemonic: string | null;
    baseCharacter: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/kana?q=${encodeURIComponent(kanaId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const match = (j.results ?? []).find((r: { id: string }) => r.id === kanaId);
        setEntry(match ?? null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [kanaId]);

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 p-4">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        <span className="text-xs text-slate-500">Loading kana details…</span>
      </div>
    );
  }

  if (!entry) return null;

  return (
    <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
            <span className="font-japanese text-5xl font-bold text-slate-900">{entry.character}</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                {entry.script}
              </span>
              <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200">
                {entry.category}
              </span>
              <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                row {entry.rowLabel}
              </span>
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">romaji: {entry.romaji}</p>
            {entry.baseCharacter && (
              <p className="mt-0.5 text-[11px] text-slate-600">
                Derived from{" "}
                <span className="font-japanese font-bold text-slate-900">{entry.baseCharacter}</span>{" "}
                plus a diacritic.
              </p>
            )}
            {entry.mnemonic && (
              <p className="mt-1.5 max-w-md text-[11px] italic leading-relaxed text-slate-600">
                “{entry.mnemonic}”
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => onAdd({ target: "kana", kanaId }, `kana-${kanaId}`)}
          disabled={busy !== null}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 disabled:opacity-50"
        >
          {busy === `kana-${kanaId}` ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Add to SRS
        </button>
      </div>
    </div>
  );
}
