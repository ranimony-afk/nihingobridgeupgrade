import Link from "next/link";
import { getPublicLearner } from "@/lib/learner";
import { media } from "@/lib/media";

export const dynamic = "force-dynamic";

const features = [
  { icon: "🔥", title: "Daily streaks", copy: "Study once a day and watch the flame climb. Freeze it if life happens." },
  { icon: "❤️", title: "Hearts", copy: "Five lives per run. Miss a prompt, lose a heart. Refill with gems or time." },
  { icon: "🗺️", title: "Skill path", copy: "A winding path from hiragana to JLPT N5 particles, with treasure chests." },
  { icon: "🎧", title: "Listen & speak", copy: "Native Japanese audio via the Web Speech API on every card." },
  { icon: "📖", title: "Stories", copy: "Illustrated scenes — ramen shops, the Yamanote, cherry picnics." },
  { icon: "🏆", title: "Leagues", copy: "Weekly XP puts you in Seedling, Bronze, Silver, Gold, or Sakura." },
];

export default async function HomePage() {
  const learner = await getPublicLearner();

  return (
    <div className="min-h-screen bg-[#111827] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-black">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#58cc02]">NB</span>
          Nihongo Bridge
        </div>
        <div className="flex gap-3">
          <Link href="/dictionary" className="press bg-white/10 px-4 py-2 text-sm text-white">
            Dictionary
          </Link>
          <Link href="/login" className="press bg-white/10 px-4 py-2 text-sm text-white">
            Log in
          </Link>
          <Link href="/audit" className="press bg-white/10 px-4 py-2 text-sm text-white">
            Architecture
          </Link>
          <Link href={learner ? "/learn" : "/onboarding"} className="press bg-[#58cc02] px-4 py-2 text-sm text-[#113b00]">
            {learner ? "Continue" : "Start free"}
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[#58cc02]">Japanese, the playful way</p>
          <h1 className="mt-3 text-5xl font-black leading-[0.95] sm:text-7xl">
            Learn Japanese like a game.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/75">
            Nihongo Bridge borrows Duolingo&apos;s best loops — streaks, hearts, XP, leagues, and a winding lesson
            path — then teaches real Japanese with Mochi the tanuki as your sensei.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={learner ? "/learn" : "/onboarding"} className="press bg-[#58cc02] px-6 py-4 text-[#113b00]">
              {learner ? "Back to the path" : "Start learning free"}
            </Link>
            <Link href="/kana" className="press bg-white/10 px-6 py-4 text-white">
              Peek the kana chart
            </Link>
          </div>
          <div className="mt-8 flex gap-6 text-sm font-extrabold uppercase tracking-widest text-white/60">
            <span>Hiragana</span>
            <span>Katakana</span>
            <span>JLPT N5</span>
            <span>Stories</span>
          </div>
        </div>
        <div className="relative">
          <img
            src={media.tokyoNight}
            alt="Tokyo neon streets at night"
            className="h-[460px] w-full rounded-[36px] object-cover shadow-2xl"
          />
          <img
            src={media.mochiWave}
            alt="Mochi the tanuki waving"
            className="floaty absolute -bottom-8 -left-4 h-44 w-44 object-contain drop-shadow-2xl sm:-left-10"
          />
          <div className="absolute right-4 top-4 rounded-2xl bg-white px-4 py-3 text-[#3c3c3c] shadow-xl">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#777]">Daily goal</p>
            <p className="text-2xl font-black text-[#58cc02]">20 XP</p>
          </div>
        </div>
      </section>

      <section className="bg-[#f7f7f7] py-16 text-[#3c3c3c]">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="card p-6">
              <div className="text-3xl">{feature.icon}</div>
              <h2 className="mt-3 text-xl font-black">{feature.title}</h2>
              <p className="mt-2 text-[#777]">{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden">
        <img src={media.fuji} alt="Mount Fuji and cherry blossoms" className="h-[420px] w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/20" />
        <div className="absolute inset-0 mx-auto flex max-w-6xl flex-col justify-center px-6">
          <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#ffc800]">From kana to conversation</p>
          <h2 className="mt-2 max-w-xl text-4xl font-black">A path that feels like play, built for real Japanese.</h2>
          <Link href={learner ? "/learn" : "/onboarding"} className="press mt-6 w-fit bg-[#ffc800] px-6 py-3 text-[#3c3c3c]">
            Meet Mochi
          </Link>
        </div>
      </section>
    </div>
  );
}
