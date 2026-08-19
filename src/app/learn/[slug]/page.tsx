import { notFound, redirect } from "next/navigation";
import { LessonRunner } from "@/components/LessonRunner";
import { getLearnPath, getLessonBundle, getPublicLearner } from "@/lib/learner";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");
  const { slug } = await params;
  const bundle = await getLessonBundle(slug);
  if (!bundle) notFound();

  const path = await getLearnPath(learner.id);
  const node = path.lessons.find((lesson) => lesson.slug === slug);
  if (node?.locked) redirect("/learn");

  return (
    <main className="min-h-screen px-4 py-6">
      <LessonRunner
        title={`${bundle.unit?.title ?? "Lesson"} · ${bundle.lesson.title}`}
        lessonId={bundle.lesson.id}
        hearts={learner.hearts}
        maxHearts={learner.maxHearts}
        mode="lesson"
        exercises={bundle.exercises.map((item) => ({
          id: item.id,
          type: item.type,
          payload: item.payload,
        }))}
      />
    </main>
  );
}
