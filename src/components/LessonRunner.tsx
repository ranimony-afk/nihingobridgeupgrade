"use client";

import { Img } from "@/components/Img";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExercisePayload } from "@/db/schema";
import { media } from "@/lib/media";
import { speakJapanese, tone } from "@/lib/speech";
import { answersMatch } from "@/lib/utils";

export type PlayExercise = {
  id: string;
  type: string;
  payload: ExercisePayload;
  cardId?: string;
};

type Feedback = {
  correct: boolean;
  explanation?: string | null;
  answer?: string | string[];
};

export function LessonRunner({
  title,
  lessonId,
  exercises,
  hearts: initialHearts,
  maxHearts,
  mode,
}: {
  title: string;
  lessonId?: string;
  exercises: PlayExercise[];
  hearts: number;
  maxHearts: number;
  mode: "lesson" | "practice" | "story";
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [hearts, setHearts] = useState(initialHearts);
  const [selected, setSelected] = useState<string>("");
  const [typed, setTyped] = useState("");
  const [tiles, setTiles] = useState<string[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [pickedLeft, setPickedLeft] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState<{ xp: number; gems?: number; accuracy?: number } | null>(null);

  const current = exercises[index];
  const progress = exercises.length ? Math.round((index / exercises.length) * 100) : 0;

  const pairState = useMemo(() => {
    if (!current || current.type !== "match" || !current.payload.pairs) return null;
    const left = current.payload.pairs.map((pair) => pair.left);
    const right = [...current.payload.pairs.map((pair) => pair.right)].sort();
    return { left, right };
  }, [current]);

  function resetLocal() {
    setSelected("");
    setTyped("");
    setTiles([]);
    setMatches({});
    setPickedLeft(null);
    setFeedback(null);
  }

  function currentAnswer(): string | string[] {
    if (!current) return "";
    if (current.type === "tiles") return tiles;
    if (current.type === "match") {
      return Object.entries(matches).map(([left, right]) => `${left}=${right}`);
    }
    if (current.type === "translate") return typed;
    return selected;
  }

  function canCheck() {
    if (!current) return false;
    if (current.type === "translate") return typed.trim().length > 0;
    if (current.type === "tiles") return tiles.length > 0;
    if (current.type === "match") {
      return current.payload.pairs?.every((pair) => matches[pair.left]);
    }
    return Boolean(selected);
  }

  async function check() {
    if (!current || !canCheck() || busy || feedback) return;
    setBusy(true);

    const given = currentAnswer();
    const expected = current.payload.answer;
    let correct = false;
    if (current.type === "match" && current.payload.pairs) {
      correct = current.payload.pairs.every((pair) => matches[pair.left] === pair.right);
    } else if (current.type === "tiles" && Array.isArray(expected)) {
      correct = Array.isArray(given) && expected.join(" ") === given.join(" ");
    } else if (typeof expected === "string") {
      correct = answersMatch(expected, String(given)) || (current.payload.accepted ?? []).some((item) => answersMatch(item, String(given)));
    } else {
      correct = Array.isArray(given) && expected.every((item, idx) => answersMatch(item, given[idx] ?? ""));
    }

    if (current.cardId) {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reviewResult", cardId: current.cardId, correct }),
      });
      const data = (await response.json()) as { hearts?: number };
      if (typeof data.hearts === "number") setHearts(data.hearts);
    } else if (mode !== "story") {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", exerciseId: current.id, answer: given }),
      });
      const data = (await response.json()) as { correct?: boolean; hearts?: number; explanation?: string | null; answer?: string | string[] };
      correct = Boolean(data.correct);
      if (typeof data.hearts === "number") setHearts(data.hearts);
      setFeedback({
        correct,
        explanation: data.explanation,
        answer: data.answer,
      });
      tone(correct);
      if (correct) setCorrectCount((value) => value + 1);
      else {
        setShake(true);
        setTimeout(() => setShake(false), 350);
      }
      setBusy(false);
      return;
    }

    setFeedback({
      correct,
      explanation: current.payload.explanation,
      answer: current.payload.answer,
    });
    tone(correct);
    if (correct) setCorrectCount((value) => value + 1);
    else {
      setShake(true);
      setTimeout(() => setShake(false), 350);
    }
    setBusy(false);
  }

  async function next() {
    if (index + 1 < exercises.length) {
      setIndex((value) => value + 1);
      resetLocal();
      return;
    }

    setBusy(true);
    if (mode === "lesson" && lessonId) {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "completeLesson",
          lessonId,
          correct: correctCount + (feedback?.correct ? 0 : 0),
          total: exercises.length,
        }),
      });
      const data = (await response.json()) as { xp?: number; gems?: number; accuracy?: number };
      setDone({ xp: data.xp ?? 10, gems: data.gems ?? 6, accuracy: data.accuracy ?? Math.round((correctCount / exercises.length) * 100) });
    } else if (mode === "practice") {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "completePractice", reviews: exercises.length, xp: 8 }),
      });
      const data = (await response.json()) as { xp?: number };
      setDone({ xp: data.xp ?? 8, accuracy: Math.round((correctCount / exercises.length) * 100) });
    } else {
      setDone({ xp: 0, accuracy: Math.round((correctCount / exercises.length) * 100) });
    }
    setBusy(false);
  }

  function pickMatch(side: "left" | "right", value: string) {
    if (feedback) return;
    if (side === "left") {
      setPickedLeft(value);
      return;
    }
    if (!pickedLeft) return;
    setMatches((currentMatches) => ({ ...currentMatches, [pickedLeft]: value }));
    setPickedLeft(null);
  }

  if (!current && !done) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="font-extrabold">Nothing to review yet.</p>
        <button className="press mt-4 bg-[#58cc02] px-5 py-3 text-white" onClick={() => router.push("/learn")}>
          Back to path
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <Img src={media.mochiCelebrate} alt="Mochi celebrating" className="floaty mx-auto h-48 w-48 object-contain"  width={640} height={480} />
        <h1 className="mt-2 text-4xl font-black text-[#58cc02]">Lesson complete!</h1>
        <p className="mt-2 text-[#777]">Mochi is proud. Keep the streak warm.</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Reward label="XP" value={`+${done.xp}`} color="#ffc800" />
          <Reward label="Accuracy" value={`${done.accuracy ?? 0}%`} color="#1cb0f6" />
          <Reward label="Gems" value={`+${done.gems ?? 0}`} color="#ce82ff" />
        </div>
        <button className="press mt-8 w-full bg-[#58cc02] px-6 py-4 text-white" onClick={() => router.push("/learn")}>
          Continue
        </button>
      </div>
    );
  }

  if (hearts <= 0 && !feedback) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <Img src={media.mochiThink} alt="Mochi thinking" className="mx-auto h-36 w-36 object-contain"  width={640} height={480} />
        <h1 className="text-3xl font-black text-[#ff4b4b]">Out of hearts</h1>
        <p className="mt-2 text-[#777]">Refill in the shop, or wait a little. Hearts return every 4 hours.</p>
        <div className="mt-6 flex gap-3">
          <button className="press flex-1 bg-[#1cb0f6] px-4 py-3 text-white" onClick={() => router.push("/shop")}>
            Go to shop
          </button>
          <button className="press flex-1 bg-white px-4 py-3" onClick={() => router.push("/learn")}>
            Leave
          </button>
        </div>
      </div>
    );
  }

  const bank = (current.payload.tiles ?? []).filter((tile) => tiles.filter((item) => item === tile).length < (current.payload.tiles ?? []).filter((item) => item === tile).length || !tiles.includes(tile));
  const remainingTiles = (current.payload.tiles ?? []).filter((tile, tileIndex) => {
    const used = tiles.filter((item) => item === tile).length;
    const before = (current.payload.tiles ?? []).slice(0, tileIndex).filter((item) => item === tile).length;
    return before >= used;
  });

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-2xl flex-col">
      <div className="flex items-center gap-3">
        <button className="text-2xl text-[#afafaf]" onClick={() => router.push("/learn")} aria-label="Close">
          ×
        </button>
        <div className="progress-bar flex-1">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-1 font-black text-[#ff4b4b]">
          ❤️ {hearts}/{maxHearts}
        </div>
      </div>

      <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.16em] text-[#afafaf]">{title}</p>
      <div className={`mt-4 flex items-start gap-3 ${shake ? "shake" : ""}`}>
        <Img src={media.mochiThink} alt="" className="hidden h-20 w-20 object-contain sm:block"  width={640} height={480} />
        <div className="card flex-1 p-5">
          <p className="text-xl font-black">{current.payload.prompt}</p>
          {current.payload.promptJa ? (
            <p className="ja mt-2 text-3xl font-black">{current.payload.promptJa}</p>
          ) : null}
          {current.payload.speak ? (
            <button
              className="press mt-3 bg-[#ddf4ff] px-4 py-2 text-[#1cb0f6]"
              onClick={() => speakJapanese(current.payload.speak ?? "")}
              type="button"
            >
              🔊 Listen
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex-1">
        {(current.type === "select" || current.type === "listen" || current.type === "fill") && (
          <div className="grid gap-3">
            {(current.payload.options ?? []).map((option) => {
              const on = selected === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelected(option)}
                  className={`press w-full bg-white px-4 py-4 text-left text-lg font-extrabold ${
                    on ? "border-[#1cb0f6] bg-[#ddf4ff] text-[#1cb0f6]" : ""
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {current.type === "translate" && (
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={current.payload.hint ?? "Type your answer"}
            className="w-full rounded-2xl border-2 border-[#e5e5e5] px-4 py-4 text-lg font-bold outline-none focus:border-[#1cb0f6]"
          />
        )}

        {current.type === "tiles" && (
          <div>
            <div className="mb-4 flex min-h-16 flex-wrap gap-2 rounded-2xl border-2 border-dashed border-[#e5e5e5] p-3">
              {tiles.map((tile, tileIndex) => (
                <button
                  key={`${tile}-${tileIndex}`}
                  className="press bg-[#ddf4ff] px-3 py-2 text-[#1cb0f6]"
                  onClick={() => setTiles((list) => list.filter((_, idx) => idx !== tileIndex))}
                  type="button"
                >
                  {tile}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {remainingTiles.map((tile, tileIndex) => (
                <button
                  key={`${tile}-bank-${tileIndex}`}
                  className="press bg-white px-3 py-2"
                  onClick={() => setTiles((list) => [...list, tile])}
                  type="button"
                >
                  {tile}
                </button>
              ))}
            </div>
          </div>
        )}

        {current.type === "match" && pairState && (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              {pairState.left.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => pickMatch("left", item)}
                  className={`press px-3 py-3 ${
                    matches[item]
                      ? "bg-[#d7ffb8] text-[#58a700]"
                      : pickedLeft === item
                        ? "bg-[#ddf4ff] text-[#1cb0f6]"
                        : "bg-white"
                  }`}
                >
                  <span className="ja text-xl font-black">{item}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-2">
              {pairState.right.map((item) => {
                const used = Object.values(matches).includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    disabled={used}
                    onClick={() => pickMatch("right", item)}
                    className={`press px-3 py-3 ${used ? "bg-[#d7ffb8] text-[#58a700]" : "bg-white"}`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        {feedback ? (
          <div
            className={`rounded-3xl p-5 ${
              feedback.correct ? "bg-[#d7ffb8] text-[#58a700]" : "bg-[#ffdfe0] text-[#ea2b2b]"
            }`}
          >
            <p className="text-xl font-black">{feedback.correct ? "Nice!" : "Not quite"}</p>
            <p className="mt-1 font-bold">
              {feedback.explanation ||
                (Array.isArray(feedback.answer) ? feedback.answer.join(" ") : feedback.answer)}
            </p>
            <button className="press mt-4 w-full bg-white px-4 py-3 text-current" onClick={next} type="button">
              Continue
            </button>
          </div>
        ) : (
          <button
            className="press w-full bg-[#58cc02] px-4 py-4 text-white"
            disabled={!canCheck() || busy}
            onClick={check}
            type="button"
          >
            Check
          </button>
        )}
      </div>
      <p className="sr-only">{bank.length}</p>
    </div>
  );
}

function Reward({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border-2 border-[#e5e5e5] p-3">
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#afafaf]">{label}</p>
      <p className="text-xl font-black" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
