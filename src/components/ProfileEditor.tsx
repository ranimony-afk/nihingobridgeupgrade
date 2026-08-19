"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileEditor({ name, dailyGoalXp }: { name: string; dailyGoalXp: number }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [goal, setGoal] = useState(dailyGoalXp);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateProfile", name: value, dailyGoalXp: goal }),
    });
    const data = (await response.json()) as { ok?: boolean };
    setNote(data.ok ? "Saved" : "Could not save");
    router.refresh();
  }

  return (
    <div className="mt-5 text-left">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-2xl border-2 border-[#e5e5e5] px-3 py-2 font-bold outline-none focus:border-[#58cc02]"
      />
      <div className="mt-2 grid grid-cols-4 gap-1">
        {[10, 20, 30, 50].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setGoal(item)}
            className={`press px-2 py-2 text-xs ${goal === item ? "bg-[#d7ffb8] text-[#58a700]" : "bg-white"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <button type="button" className="press mt-3 w-full bg-[#3c3c3c] py-2 text-white" onClick={save}>
        Update profile
      </button>
      {note ? <p className="mt-2 text-sm font-bold text-[#58a700]">{note}</p> : null}
    </div>
  );
}
