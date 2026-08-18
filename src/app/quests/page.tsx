import { redirect } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { getPublicLearner } from "@/lib/learner";
import { media } from "@/lib/media";

export const dynamic = "force-dynamic";

export default async function QuestsPage() {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");

  const dailies = [
    {
      title: "Complete a lesson",
      current: learner.lessonsCompleted,
      goal: 1,
      reward: "10 XP",
    },
    {
      title: `Earn ${learner.dailyGoalXp} XP`,
      current: learner.todayXp,
      goal: learner.dailyGoalXp,
      reward: "5 gems",
    },
    {
      title: "Review 5 cards",
      current: learner.reviewsToday,
      goal: 5,
      reward: "Streak love",
    },
  ];

  const weeklies = [
    { title: "Finish 5 lessons", current: Math.min(5, learner.lessonsCompleted + 2), goal: 5, reward: "40 XP" },
    { title: "Earn 150 weekly XP", current: learner.weeklyXp, goal: 150, reward: "League boost" },
    { title: "Keep the flame", current: Math.min(learner.streak, 7), goal: 7, reward: "Freeze token" },
  ];

  return (
    <AppFrame learner={learner} active="/quests">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#ffc800]">Quests</p>
          <h1 className="text-3xl font-black">Little missions. Big XP.</h1>
          <section className="card mt-5 p-5">
            <h2 className="text-xl font-black">Daily</h2>
            <div className="mt-4 grid gap-4">
              {dailies.map((quest) => (
                <QuestRow key={quest.title} {...quest} />
              ))}
            </div>
          </section>
          <section className="card mt-5 p-5">
            <h2 className="text-xl font-black">This week</h2>
            <div className="mt-4 grid gap-4">
              {weeklies.map((quest) => (
                <QuestRow key={quest.title} {...quest} />
              ))}
            </div>
          </section>
        </div>
        <aside className="card overflow-hidden">
          <img src={media.tokyoAlley} alt="Japanese nightlife alley" className="h-48 w-full object-cover" />
          <div className="p-5">
            <img src={media.badge} alt="Sakura badge" className="mb-3 h-20 w-20 object-contain" />
            <h2 className="text-2xl font-black">Sakura League awaits</h2>
            <p className="mt-2 text-[#777]">
              Clear dailies to climb from Seedling into Sakura. Weekly XP resets every Monday.
            </p>
          </div>
        </aside>
      </div>
    </AppFrame>
  );
}

function QuestRow({
  title,
  current,
  goal,
  reward,
}: {
  title: string;
  current: number;
  goal: number;
  reward: string;
}) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-extrabold">{title}</p>
        <span className="rounded-full bg-[#fff2d0] px-2 py-1 text-xs font-black text-[#d68b00]">{reward}</span>
      </div>
      <div className="progress-bar mt-2">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs font-bold text-[#777]">
        {Math.min(current, goal)} / {goal}
      </p>
    </div>
  );
}
