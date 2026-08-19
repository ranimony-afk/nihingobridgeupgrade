"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { media } from "@/lib/media";

const goals = [
  { xp: 10, label: "Casual", copy: "5 minutes" },
  { xp: 20, label: "Regular", copy: "10 minutes" },
  { xp: 30, label: "Serious", copy: "15 minutes" },
  { xp: 50, label: "Intense", copy: "20 minutes" },
];

const levels = [
  { id: "beginner", label: "Brand new", copy: "I am starting from zero." },
  { id: "kana", label: "I know some kana", copy: "Hiragana looks familiar." },
  { id: "words", label: "I know a few phrases", copy: "Konnichiwa is easy." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dailyGoalXp, setDailyGoalXp] = useState(20);
  const [levelHint, setLevelHint] = useState("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "onboard",
        name: name || "Traveler",
        dailyGoalXp,
        levelHint,
      }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!data.ok) {
      setError(data.error ?? "Could not start");
      return;
    }
    router.push("/learn");
    router.refresh();
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-8 px-6 py-10 lg:grid-cols-2">
      <div>
        <img src={media.mochiWave} alt="Mochi waving" className="floaty mx-auto h-56 w-56 object-contain" />
        <div className="overflow-hidden rounded-[32px]">
          <img src={media.torii} alt="Fushimi Inari torii gates" className="h-64 w-full object-cover" />
        </div>
      </div>
      <section className="card p-8">
        <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">Welcome</p>
        <h1 className="mt-2 text-4xl font-black">What should Mochi call you?</h1>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          className="mt-5 w-full rounded-2xl border-2 border-[#e5e5e5] px-4 py-3 text-lg font-bold outline-none focus:border-[#58cc02]"
        />

        <p className="mt-6 text-sm font-extrabold uppercase tracking-widest text-[#777]">Daily goal</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {goals.map((goal) => (
            <button
              key={goal.xp}
              type="button"
              onClick={() => setDailyGoalXp(goal.xp)}
              className={`press px-3 py-3 text-left ${
                dailyGoalXp === goal.xp ? "bg-[#ddf4ff] text-[#1cb0f6]" : "bg-white"
              }`}
            >
              <span className="block text-lg">{goal.label}</span>
              <span className="text-xs text-[#777]">
                {goal.xp} XP · {goal.copy}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-sm font-extrabold uppercase tracking-widest text-[#777]">Starting point</p>
        <div className="mt-2 grid gap-2">
          {levels.map((level) => (
            <button
              key={level.id}
              type="button"
              onClick={() => setLevelHint(level.id)}
              className={`press px-3 py-3 text-left ${
                levelHint === level.id ? "bg-[#d7ffb8] text-[#58a700]" : "bg-white"
              }`}
            >
              <span className="block font-black">{level.label}</span>
              <span className="text-sm text-[#777]">{level.copy}</span>
            </button>
          ))}
        </div>

        {error ? <p className="mt-4 font-bold text-[#ff4b4b]">{error}</p> : null}
        <button className="press mt-6 w-full bg-[#58cc02] py-4 text-white" disabled={busy} onClick={start} type="button">
          {busy ? "Opening the gate…" : "Start the path"}
        </button>
      </section>
    </main>
  );
}
