import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicLearner } from "@/lib/learner";

const nav = [
  { href: "/learn", label: "Learn", icon: "🗺️" },
  { href: "/practice", label: "Practice", icon: "🎯" },
  { href: "/stories", label: "Stories", icon: "📖" },
  { href: "/kana", label: "Kana", icon: "あ" },
  { href: "/quests", label: "Quests", icon: "🏅" },
  { href: "/leaderboard", label: "Leagues", icon: "🏆" },
  { href: "/shop", label: "Shop", icon: "💎" },
  { href: "/profile", label: "Profile", icon: "🦊" },
  { href: "/account", label: "Account", icon: "🔐" },
];

const mobileNav = [
  { href: "/learn", label: "Learn", icon: "🗺️" },
  { href: "/practice", label: "Practice", icon: "🎯" },
  { href: "/stories", label: "Stories", icon: "📖" },
  { href: "/leaderboard", label: "Leagues", icon: "🏆" },
  { href: "/profile", label: "Profile", icon: "🦊" },
];

export function AppFrame({
  learner,
  active,
  children,
}: {
  learner: PublicLearner;
  active: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r-2 border-[#e5e5e5] bg-white px-4 py-6 lg:flex lg:flex-col">
        <Link href="/learn" className="mb-8 flex items-center gap-2 px-2">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#58cc02] text-lg font-black text-white">
            NB
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#58cc02]">Nihongo</p>
            <p className="text-lg font-black leading-none">Bridge</p>
          </div>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => {
            const on = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-extrabold uppercase tracking-wide ${
                  on ? "bg-[#ddf4ff] text-[#1cb0f6]" : "text-[#777] hover:bg-[#f7f7f7]"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="rounded-2xl bg-[#f7f7f7] p-3">
          <p className="text-xs font-bold uppercase tracking-widest text-[#777]">Today</p>
          <p className="mt-1 text-sm font-extrabold">
            {learner.todayXp}/{learner.dailyGoalXp} XP
          </p>
          <div className="progress-bar mt-2">
            <span style={{ width: `${Math.min(100, (learner.todayXp / learner.dailyGoalXp) * 100)}%` }} />
          </div>
        </div>
      </aside>

      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-2 border-[#e5e5e5] bg-white/90 px-4 py-3 backdrop-blur">
          <Link href="/" className="font-black text-[#58cc02] lg:hidden">
            日本語
          </Link>
          <div className="ml-auto flex items-center gap-2 text-sm font-extrabold">
            <Stat href="/quests" pill="#fff2d0" text="#d68b00" icon="🔥" value={learner.streak} />
            <Stat href="/shop" pill="#ddf4ff" text="#1cb0f6" icon="💎" value={learner.gems} />
            <Stat
              href="/shop"
              pill="#ffdfe0"
              text="#ff4b4b"
              icon="❤️"
              value={`${learner.hearts}/${learner.maxHearts}`}
            />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-28 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t-2 border-[#e5e5e5] bg-white px-1 py-2 lg:hidden">
        {mobileNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 text-[10px] font-extrabold uppercase ${
              active === item.href ? "text-[#1cb0f6]" : "text-[#777]"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Stat({
  href,
  pill,
  text,
  icon,
  value,
}: {
  href: string;
  pill: string;
  text: string;
  icon: string;
  value: string | number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 rounded-full px-3 py-1.5"
      style={{ background: pill, color: text }}
    >
      <span>{icon}</span>
      <span>{value}</span>
    </Link>
  );
}
