import { notFound, redirect } from "next/navigation";
import { getPublicLearner, getStoriesFor } from "@/lib/learner";
import { StoryPlayer } from "@/components/StoryPlayer";

export const dynamic = "force-dynamic";

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");
  const { slug } = await params;
  const stories = await getStoriesFor(learner.id);
  const story = stories.find((item) => item.slug === slug);
  if (!story) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6">
      <StoryPlayer
        storyId={story.id}
        title={story.title}
        cover={story.cover}
        lines={story.lines}
        quiz={story.quiz}
      />
    </main>
  );
}
