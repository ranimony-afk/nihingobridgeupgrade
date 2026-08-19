import { Img } from "@/components/Img";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { getLeaderboard, getPublicLearner } from "@/lib/learner";
import { leagueFromWeeklyXp } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");
  const board = await getLeaderboard();
  const league = learner.league;

  return (
    <AppFrame learner={learner} active="/leaderboard">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-extrabold uppercase tracking-[0.16em]" style={{ color: league.color }}>
          {league.emoji} {league.name} league
        </p>
        <h1 className="text-3xl font-black">This week&apos;s climb</h1>
        <p className="mt-1 text-[#777]">Weekly XP decides promotion. Bots keep the board lively until friends arrive.</p>
        <div className="card mt-5 divide-y-2 divide-[#f0f0f0] overflow-hidden">
          {board.map((row, index) => {
            const mine = row.id === learner.id;
            const rowLeague = leagueFromWeeklyXp(row.weeklyXp);
            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 px-4 py-3 ${mine ? "bg-[#ddf4ff]" : "bg-white"}`}
              >
                <div className="w-8 text-center text-lg font-black text-[#777]">{index + 1}</div>
                <Img src={row.avatarSrc} alt="" className="h-12 w-12 object-contain"  width={640} height={480} />
                <div className="flex-1">
                  <p className="font-black">
                    {row.name} {mine ? <span className="text-[#1cb0f6]">· you</span> : null}
                  </p>
                  <p className="text-xs font-bold text-[#777]">
                    {rowLeague.emoji} {rowLeague.name} · {row.streak} day streak
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-[#ffc800]">{row.weeklyXp} XP</p>
                  <p className="text-xs text-[#777]">{row.xp} total</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppFrame>
  );
}
