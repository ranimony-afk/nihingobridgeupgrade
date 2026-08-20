import { Img } from "@/components/Img";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { getPublicLearner, getStoriesFor } from "@/lib/learner";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");
  const stories = await getStoriesFor(learner.id);

  return (
    <AppFrame learner={learner} active="/stories">
      <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#ff9600]">Stories</p>
      <h1 className="text-3xl font-black">Tiny scenes. Real Japanese.</h1>
      <p className="mt-1 max-w-2xl text-[#777]">
        Read, tap to hear, then answer two questions. Stories award XP and keep your streak honest.
      </p>
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {stories.map((story) => (
          <Link key={story.id} href={`/stories/${story.slug}`} className="card overflow-hidden">
            <Img src={story.cover} alt="" className="h-40 w-full object-cover"  width={640} height={480} />
            <div className="p-4">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-widest text-[#777]">
                <span>{story.level}</span>
                <span>{story.minutes} min</span>
              </div>
              <h2 className="mt-2 text-xl font-black">{story.title}</h2>
              <p className="mt-1 text-sm text-[#777]">{story.teaser}</p>
              <p className="mt-3 text-sm font-extrabold text-[#58cc02]">
                {story.completed ? `Done · ${story.score}%` : "Read story"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </AppFrame>
  );
}
