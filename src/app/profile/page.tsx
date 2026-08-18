import { redirect } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { ProfileEditor } from "@/components/ProfileEditor";
import { getProfileExtras, getPublicLearner } from "@/lib/learner";
import { media } from "@/lib/media";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");
  const extras = await getProfileExtras(learner.id);
  const maxWeek = Math.max(10, ...extras.week.map((day) => day.xp));

  return (
    <AppFrame learner={learner} active="/profile">
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="card p-5 text-center">
          <img src={learner.avatarSrc} alt="" className="mx-auto h-32 w-32 object-contain" />
          <h1 className="text-2xl font-black">{learner.name}</h1>
          <p className="font-bold text-[#777]">
            Level {learner.level} · {learner.league.emoji} {learner.league.name}
          </p>
          <div className="progress-bar mt-3">
            <span style={{ width: `${learner.xpIntoLevel}%` }} />
          </div>
          <p className="mt-2 text-sm font-bold text-[#777]">{learner.xpIntoLevel}/100 XP to next level</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <Stat label="XP" value={learner.xp} />
            <Stat label="Streak" value={learner.streak} />
            <Stat label="Best" value={learner.longestStreak} />
          </div>
          <ProfileEditor name={learner.name} dailyGoalXp={learner.dailyGoalXp} />
        </aside>

        <div className="space-y-5">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">This week</h2>
              <img src={media.badge} alt="" className="h-10 w-10 object-contain" />
            </div>
            <div className="mt-4 flex h-40 items-end gap-2">
              {extras.week.map((day) => (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-lg bg-[#58cc02]"
                    style={{ height: `${Math.max(8, (day.xp / maxWeek) * 140)}px` }}
                    title={`${day.xp} XP`}
                  />
                  <span className="text-[10px] font-extrabold uppercase text-[#777]">
                    {day.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-xl font-black">Achievements</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {extras.achievements.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border-2 px-4 py-3 ${
                    item.unlocked ? "border-[#ffc800] bg-[#fff2d0]" : "border-[#e5e5e5] opacity-60"
                  }`}
                >
                  <p className="text-2xl">{item.icon}</p>
                  <p className="font-black">{item.title}</p>
                  <p className="text-sm text-[#777]">{item.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppFrame>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#f7f7f7] py-2">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#777]">{label}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
