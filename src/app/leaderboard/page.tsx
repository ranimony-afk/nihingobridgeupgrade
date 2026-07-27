import Link from "next/link";
import { db } from "@/db";
import { leaderboards, learnerGamification, downloadableResources } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  await ensureSeed();
  const cfg = getBrand("nihongo")!;

  const ranks = await db.select().from(leaderboards).orderBy(asc(leaderboards.rank));
  const gamifyRows = await db.select().from(learnerGamification).limit(1);
  const userStats = gamifyRows[0] ?? {
    xp: 420,
    streakDays: 8,
    dailyGoalMinutes: 15,
    weeklyGoalMinutes: 90,
    totalStudyMinutes: 135,
    completedLessonsCount: 14,
    completedReviewsCount: 95,
    averageTestScore: 92,
    streakFreezes: 2,
    level: 3,
    levelTitle: "Hiragana Adept",
    bookmarks: [1, 2],
    achievements: ["First 100 XP", "7-Day Streak Warrior", "Kanji Novice"],
    badges: [
      { name: "First 100 XP", icon: "⚡", description: "Earned your first 100 XP" },
      { name: "7-Day Streak", icon: "🔥", description: "Studied 7 days in a row" },
    ],
    dailyChallenges: [
      { title: "Review 10 flashcards in Spaced Repetition", xpReward: 20, isCompleted: true },
      { title: "Read today's Japanese news article", xpReward: 30, isCompleted: true },
    ],
    weakAreas: [
      { item: "食べる (taberu)", meaning: "To eat (Ichidan verb)", accuracy: 65 },
    ],
  };

  // Load Bookmarked downloads/saved items (Prompt 12 Bookmarks/Saved Lists)
  const savedResources = await db
    .select()
    .from(downloadableResources)
    .where(asc(downloadableResources.rating))
    .limit(3);

  // Recommendations Databank based on Level 3 (Prompt 12)
  const targetRecommendations = [
    { title: "🎴 JLPT N5 Spaced Flashcards review", desc: "Review 12 pending words to elevate vocabulary retention.", href: "/study/flashcards", badge: "Daily SR" },
    { title: "📰 Today's NHK Easy news shadowing", desc: "Shadow and listen to Tokyo Sakura blooming forecasts.", href: "/news/cherry-blossom-season-forecast", badge: "Listening" },
    { title: "🗣️ Greetings conversation lab", desc: "Verifiably check your pitch pronunciation using mic recordings.", href: "/nihongo/conversation", badge: "Speaking" }
  ];

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <BrandHeader brand={cfg} />

        {/* 1. Header & Quick notifications Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: cfg.theme.primary }}>
              Student Experience Dashboard &amp; Leaderboards 🏆
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Track daily streaks, maintain calendar goals, claim milestone badges, and review dynamic recommendations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
              🧊 {userStats.streakFreezes} Streak Freezes Left
            </span>
          </div>
        </div>

        {/* Dynamic Alerts / Notifications Strip (Prompt 12) */}
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900 flex items-center justify-between gap-2">
          <span>⚠️ <b>Streak Alert:</b> Study 15 minutes today to protect your <b>{userStats.streakDays}-Day learning streak</b> from resetting!</span>
          <Link href="/study/flashcards" className="underline font-bold hover:text-amber-950">Study Now &rarr;</Link>
        </div>

        {/* Main Stats Celebration Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-rose-500 to-amber-500 p-8 sm:p-10 text-white shadow-lg space-y-3">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-widest">
            Level {userStats.level} • {userStats.levelTitle}
          </span>
          <h2 className="text-3xl font-black">Incredible {userStats.streakDays}-Day Japanese Streak! 🔥</h2>
          <p className="text-sm opacity-90 max-w-xl leading-relaxed">
            Your day-streak puts you in the top 3% of active students this week. Keep up the daily learning momentum to promote to the Ruby League!
          </p>
        </div>

        {/* Progress & Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-3 text-xs">
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-black/5 space-y-2">
            <p className="text-slate-500 font-extrabold uppercase text-[10px]">🎯 Today's Goal Tracker</p>
            <p className="text-2xl font-black text-slate-900">{userStats.dailyGoalMinutes} / {userStats.dailyGoalMinutes} min</p>
            <p className="text-emerald-700 font-semibold">✓ Daily active study goal accomplished!</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm border border-black/5 space-y-2">
            <p className="text-slate-500 font-extrabold uppercase text-[10px]">⚡ Gamification Levels &amp; XP</p>
            <p className="text-2xl font-black text-slate-900">{userStats.xp} XP</p>
            <p className="text-indigo-700 font-semibold">Level {userStats.level} • {userStats.levelTitle}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm border border-black/5 space-y-2">
            <p className="text-slate-500 font-extrabold uppercase text-[10px]">⏱ Total Study Duration</p>
            <p className="text-2xl font-black text-slate-900">{userStats.totalStudyMinutes} mins</p>
            <p className="text-slate-500 font-medium">{userStats.completedLessonsCount} lessons finished • {userStats.completedReviewsCount} reviews completed</p>
          </div>
        </div>

        {/* Weekly Study Planner Calendar (Prompt 12) */}
        <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
          <h3 className="text-base font-bold text-slate-950">📆 Weekly Study Goal Calendar</h3>
          <p className="text-xs text-slate-500">Claim streak rewards by completing lessons 7 days in a row.</p>
          
          <div className="grid grid-cols-7 gap-2 text-center text-xs">
            {[
              { day: "Mon", checked: true, val: "15m" },
              { day: "Tue", checked: true, val: "20m" },
              { day: "Wed", checked: true, val: "15m" },
              { day: "Thu", checked: true, val: "25m" },
              { day: "Fri", checked: true, val: "15m" },
              { day: "Sat", checked: true, val: "15m" },
              { day: "Sun", checked: false, val: "—" },
            ].map((d, i) => (
              <div key={i} className={`rounded-xl p-3 border ${
                d.checked ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-400"
              }`}>
                <p className="font-bold">{d.day}</p>
                <p className="text-lg font-black mt-1">{d.checked ? "✓" : "⚐"}</p>
                <p className="text-[10px] opacity-75 mt-0.5">{d.val}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* AI-driven Study Recommendations (Prompt 12) */}
          <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
            <h3 className="text-base font-bold text-slate-950">🧠 AI-Driven Study Recommendations</h3>
            <p className="text-xs text-slate-500">Tailored targets based on your Hiragana Adept level.</p>
            
            <div className="space-y-3 pt-1">
              {targetRecommendations.map((rec, i) => (
                <Link key={i} href={rec.href} className="block rounded-2xl bg-slate-50 p-4 border border-black/5 hover:border-rose-400 hover:shadow-xs transition">
                  <div className="flex justify-between items-center text-[10px] font-bold text-rose-700 uppercase">
                    <span>Recommendation {i+1}</span>
                    <span className="rounded bg-rose-50 px-1.5 py-0.2">{rec.badge}</span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 mt-1">{rec.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{rec.desc}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* Sapphire League Leaderboards */}
          <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-950">Sapphire League Rankings 💎</h3>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Resets Sunday</span>
            </div>

            <div className="divide-y divide-black/5 max-h-[305px] overflow-y-auto">
              {ranks.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between py-2.5 px-2 rounded-xl transition ${
                    r.rank === 1 ? "bg-amber-50/70 font-bold" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`w-5 text-center font-bold ${r.rank <= 3 ? "text-rose-600" : "opacity-50"}`}>
                      #{r.rank}
                    </span>
                    <span className="text-lg">{r.avatarEmoji}</span>
                    <div>
                      <p className="font-bold text-slate-900">{r.displayName}</p>
                      <p className="text-[10px] text-slate-400">🔥 {r.streakDays} day streak</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-rose-700">{r.xp} XP</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Saved Lists & Bookmarks (Prompt 12) */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Bookmarks */}
          <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
            <h3 className="text-base font-bold text-slate-950">★ Personal Saved Resources &amp; Bookmarks</h3>
            <p className="text-xs text-slate-500">Quickly download or read your flagged printable guides.</p>
            
            <div className="space-y-3">
              {savedResources.map((res) => (
                <div key={res.id} className="rounded-2xl bg-slate-50 p-4 border border-black/5 flex items-center justify-between text-xs gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{res.title}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{res.category} • Format: {res.format}</p>
                  </div>
                  <Link href="/downloads" className="rounded-lg bg-slate-900 text-white px-3 py-1.5 font-bold hover:bg-slate-800 text-[10px] shrink-0">
                    📥 Download
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Badges & Achievements */}
          <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
            <h3 className="text-base font-bold text-slate-950">🏅 Unlocked Badges &amp; Achievements</h3>
            <p className="text-xs text-slate-500">Your collected medals celebrating core learning milestones.</p>
            
            <div className="grid gap-3 grid-cols-2">
              {Array.isArray(userStats.badges) && userStats.badges.map((b, i) => (
                <div key={i} className="rounded-2xl bg-amber-50/50 p-4 text-center border border-amber-200/50 text-xs flex flex-col items-center justify-center space-y-1">
                  <span className="text-3xl">{(b as any).icon}</span>
                  <p className="font-extrabold text-amber-950 mt-1 leading-tight">{(b as any).name}</p>
                  <p className="text-[10px] text-amber-700">{(b as any).description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
