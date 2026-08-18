"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { media } from "@/lib/media";
import { speakJapanese } from "@/lib/speech";

export function StoryPlayer({
  storyId,
  title,
  cover,
  lines,
  quiz,
}: {
  storyId: string;
  title: string;
  cover: string;
  lines: { ja: string; romaji: string; en: string }[];
  quiz: { prompt: string; options: string[]; answer: string }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [showEn, setShowEn] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ xp: number; score: number } | null>(null);

  const reading = step < lines.length;
  const line = reading ? lines[step] : null;
  const question = !reading ? quiz[step - lines.length] : null;

  async function finish(nextAnswers: string[]) {
    const score = Math.round(
      (quiz.filter((item, index) => nextAnswers[index] === item.answer).length / quiz.length) * 100,
    );
    setBusy(true);
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "completeStory", storyId, score }),
    });
    const data = (await response.json()) as { xp?: number };
    setDone({ xp: data.xp ?? 15, score });
    setBusy(false);
  }

  function next() {
    if (reading) {
      setStep((value) => value + 1);
      setShowEn(false);
      return;
    }
    if (!picked) return;
    const nextAnswers = [...answers, picked];
    setAnswers(nextAnswers);
    setPicked("");
    if (step - lines.length + 1 >= quiz.length) {
      void finish(nextAnswers);
      return;
    }
    setStep((value) => value + 1);
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <img src={media.mochiCelebrate} alt="" className="mx-auto h-40 w-40 object-contain" />
        <h1 className="text-3xl font-black text-[#58cc02]">Story complete</h1>
        <p className="mt-2 font-bold text-[#777]">
          {done.score}% on the quiz · +{done.xp} XP
        </p>
        <button className="press mt-6 bg-[#58cc02] px-6 py-3 text-white" onClick={() => router.push("/stories")}>
          More stories
        </button>
      </div>
    );
  }

  return (
    <article className="card overflow-hidden">
      <img src={cover} alt="" className="h-56 w-full object-cover" />
      <div className="p-6">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ff9600]">Story</p>
        <h1 className="text-3xl font-black">{title}</h1>
        <div className="progress-bar mt-4">
          <span style={{ width: `${(step / (lines.length + quiz.length)) * 100}%` }} />
        </div>

        {line ? (
          <div className="mt-6">
            <button
              type="button"
              className="ja text-left text-3xl font-black leading-snug"
              onClick={() => speakJapanese(line.ja)}
            >
              {line.ja}
            </button>
            <p className="mt-2 font-bold text-[#1cb0f6]">{line.romaji}</p>
            {showEn ? <p className="mt-3 text-lg text-[#777]">{line.en}</p> : null}
            <div className="mt-6 flex gap-3">
              <button className="press bg-[#ddf4ff] px-4 py-3 text-[#1cb0f6]" onClick={() => speakJapanese(line.ja)}>
                🔊 Hear it
              </button>
              <button className="press bg-white px-4 py-3" onClick={() => setShowEn(true)}>
                Show English
              </button>
              <button className="press ml-auto bg-[#58cc02] px-4 py-3 text-white" onClick={next}>
                Next
              </button>
            </div>
          </div>
        ) : null}

        {question ? (
          <div className="mt-6">
            <p className="text-xl font-black">{question.prompt}</p>
            <div className="mt-4 grid gap-2">
              {question.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPicked(option)}
                  className={`press px-4 py-3 text-left ${
                    picked === option ? "bg-[#ddf4ff] text-[#1cb0f6]" : "bg-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button className="press mt-4 w-full bg-[#58cc02] py-3 text-white" disabled={!picked || busy} onClick={next}>
              {step - lines.length + 1 >= quiz.length ? "Finish" : "Check"}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
