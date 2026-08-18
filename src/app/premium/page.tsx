import Link from "next/link";
import { getIdentity } from "@/lib/identity/request";
import { planAllows } from "@/lib/identity/rbac";

export const dynamic = "force-dynamic";

const LESSONS = [
  { title: "Keigo at the ryokan", blurb: "Honorifics that actually get you a later checkout." },
  { title: "Pitch accent drills", blurb: "Minimal pairs with listen-and-repeat." },
  { title: "JLPT N4 reading pack", blurb: "Timed passages with furigana toggles." },
];

export default async function PremiumPage() {
  const me = await getIdentity();
  const unlocked = Boolean(me && (planAllows(me.plan, "plus") || me.role === "admin" || me.role === "super_admin"));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ce82ff]">Premium</p>
      <h1 className="text-3xl font-black">Locked path</h1>
      <p className="mt-2 text-[#777]">
        Free curriculum on /learn stays open. These extras need Plus. Middleware already bounced free accounts.
      </p>
      <div className="mt-6 grid gap-4">
        {LESSONS.map((lesson) => (
          <article key={lesson.title} className="card p-5">
            <h2 className="text-xl font-black">{lesson.title}</h2>
            <p className="text-[#777]">{lesson.blurb}</p>
            <p className="mt-2 text-sm font-extrabold text-[#58cc02]">{unlocked ? "Unlocked" : "Locked"}</p>
          </article>
        ))}
      </div>
      {!unlocked ? (
        <Link href="/billing" className="press mt-6 inline-block bg-[#ffc800] px-4 py-2 text-[#3c3c3c]">
          Open billing portal
        </Link>
      ) : null}
    </main>
  );
}
