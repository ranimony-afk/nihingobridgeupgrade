"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { media } from "@/lib/media";

type PathLesson = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  sortOrder: number;
  locked: boolean;
  completed: boolean;
  crowns: number;
  unitId: string;
};

type PathUnit = {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  icon: string;
  lessons: PathLesson[];
};

type PathChest = {
  id: string;
  afterIndex: number;
  gems: number;
  title: string;
  claimed: boolean;
  unlocked: boolean;
};

const offsets = [0, 72, 118, 72, 0, -72, -118, -72];

export function PathBoard({
  units,
  chests,
}: {
  units: PathUnit[];
  chests: PathChest[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const current = units.flatMap((unit) => unit.lessons).find((lesson) => !lesson.completed && !lesson.locked);

  async function claim(chestId: string) {
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claimChest", chestId }),
    });
    const data = (await response.json()) as { ok?: boolean; gems?: number; error?: string };
    if (data.ok) {
      setMessage(`+${data.gems} gems from the chest!`);
      router.refresh();
    } else {
      setMessage(data.error ?? "Chest is locked");
    }
  }

  let node = 0;

  return (
    <div className="relative mx-auto max-w-md pb-10">
      {message ? (
        <div className="mb-4 rounded-2xl bg-[#fff2d0] px-4 py-3 text-center font-extrabold text-[#d68b00]">
          {message}
        </div>
      ) : null}

      {units.map((unit) => (
        <section key={unit.id} className="mb-4">
          <div
            className="mb-8 flex items-center justify-between rounded-[28px] px-5 py-4 text-white shadow-[0_8px_0_rgba(0,0,0,0.12)]"
            style={{ background: unit.color }}
          >
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] opacity-80">Unit</p>
              <h2 className="text-2xl font-black">{unit.title}</h2>
              <p className="text-sm font-bold opacity-90">{unit.subtitle}</p>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 text-2xl font-black">
              {unit.icon}
            </div>
          </div>

          <div className="relative">
            {unit.lessons.map((lesson) => {
              const offset = offsets[node % offsets.length];
              node += 1;
              const isCurrent = current?.id === lesson.id;
              const chest = chests.find((item) => item.afterIndex === lesson.sortOrder);
              return (
                <div key={lesson.id}>
                  <div className="relative mb-8 flex flex-col items-center" style={{ transform: `translateX(${offset}px)` }}>
                    {isCurrent ? (
                      <div className="mb-2 rounded-xl bg-[#1cb0f6] px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow-[0_4px_0_#1899d6]">
                        Start
                      </div>
                    ) : null}
                    {lesson.locked ? (
                      <div className="grid h-[74px] w-[74px] place-items-center rounded-full border-4 border-[#e5e5e5] bg-[#f0f0f0] text-2xl text-[#afafaf]">
                        🔒
                      </div>
                    ) : (
                      <Link
                        href={`/learn/${lesson.slug}`}
                        className={`grid h-[74px] w-[74px] place-items-center rounded-full border-4 text-2xl shadow-[0_8px_0_rgba(0,0,0,0.12)] ${
                          lesson.completed
                            ? "border-[#ffc800] bg-[#fff2d0] text-[#d68b00]"
                            : isCurrent
                              ? "path-pulse border-[#58cc02] bg-[#58cc02] text-white"
                              : "border-[#1cb0f6] bg-white text-[#1cb0f6]"
                        }`}
                        title={lesson.title}
                      >
                        {lesson.completed ? "👑".repeat(Math.max(1, lesson.crowns)).slice(0, 1) : "★"}
                      </Link>
                    )}
                    <p className="mt-2 max-w-32 text-center text-sm font-extrabold">{lesson.title}</p>
                  </div>

                  {chest ? (
                    <div className="mb-8 flex flex-col items-center" style={{ transform: `translateX(${offsets[node % offsets.length]}px)` }}>
                      <button
                        type="button"
                        disabled={!chest.unlocked || chest.claimed}
                        onClick={() => claim(chest.id)}
                        className="relative"
                      >
                        <img
                          src={media.chest}
                          alt={chest.title}
                          className={`h-16 w-16 object-contain ${chest.claimed ? "opacity-40 grayscale" : ""}`}
                        />
                      </button>
                      <p className="text-xs font-extrabold text-[#d68b00]">
                        {chest.claimed ? "Opened" : `${chest.gems} gems`}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
