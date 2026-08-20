import { Img } from "@/components/Img";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { PathBoard } from "@/components/PathBoard";
import { getLearnPath, getPublicLearner } from "@/lib/learner";
import { media } from "@/lib/media";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");
  const path = await getLearnPath(learner.id);
  const goalPct = Math.min(100, Math.round((learner.todayXp / learner.dailyGoalXp) * 100));

  return (
    <AppFrame learner={learner} active="/learn">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#58cc02]">Today&apos;s path</p>
              <h1 className="text-3xl font-black">Keep going, {learner.name}.</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-extrabold uppercase tracking-widest">
                <Link href="/kana" className="rounded-full bg-[#ddf4ff] px-3 py-1 text-[#1cb0f6]">
                  Kana chart
                </Link>
                <Link href="/quests" className="rounded-full bg-[#fff2d0] px-3 py-1 text-[#d68b00]">
                  Quests
                </Link>
                <Link href="/shop" className="rounded-full bg-[#f0e5ff] px-3 py-1 text-[#ce82ff]">
                  Shop
                </Link>
              </div>
            </div>
            <Img src={learner.avatarSrc} alt="" className="h-16 w-16 object-contain"  width={640} height={480} />
          </div>
          <PathBoard units={path.units} chests={path.chests} />
        </div>
        <aside className="space-y-4">
          <div className="card overflow-hidden">
            <Img src={media.cherryPath} alt="Cherry blossom path in Japan" className="h-32 w-full object-cover"  width={640} height={480} />
            <div className="p-4">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#777]">Daily goal</p>
              <p className="text-2xl font-black">
                {learner.todayXp} / {learner.dailyGoalXp} XP
              </p>
              <div className="progress-bar mt-2">
                <span style={{ width: `${goalPct}%` }} />
              </div>
              <p className="mt-2 text-sm font-bold text-[#777]">
                {goalPct >= 100 ? "Goal crushed. Mochi is dancing." : "A short lesson still counts."}
              </p>
            </div>
          </div>
          <div className="card p-4">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#777]">League</p>
            <p className="text-xl font-black">
              {learner.league.emoji} {learner.league.name}
            </p>
            <p className="text-sm font-bold text-[#777]">{learner.weeklyXp} XP this week</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#777]">Hearts</p>
            <p className="text-xl font-black text-[#ff4b4b]">
              {"❤️".repeat(learner.hearts)}
              {"🖤".repeat(Math.max(0, learner.maxHearts - learner.hearts))}
            </p>
            <p className="mt-1 text-sm text-[#777]">One heart returns every 4 hours.</p>
          </div>
        </aside>
      </div>
    </AppFrame>
  );
}
