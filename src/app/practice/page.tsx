import { redirect } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { LessonRunner, type PlayExercise } from "@/components/LessonRunner";
import type { ExercisePayload } from "@/db/schema";
import { getPracticeDeck, getPublicLearner } from "@/lib/learner";

export const dynamic = "force-dynamic";

function asPlay(item: Record<string, unknown>): PlayExercise {
  if ("payload" in item && item.payload) {
    return {
      id: String(item.id),
      type: String(item.type),
      payload: item.payload as ExercisePayload,
    };
  }
  const options = (item.options as string[] | null) ?? undefined;
  return {
    id: String(item.id),
    cardId: String(item.id),
    type: String(item.type ?? "select"),
    payload: {
      prompt: String(item.prompt ?? "Recall this"),
      speak: (item.speak as string | null) ?? undefined,
      options,
      answer: String(item.answer ?? ""),
    },
  };
}

export default async function PracticePage() {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");
  const deck = await getPracticeDeck(learner.id);
  const exercises = deck.map((item) => asPlay(item as unknown as Record<string, unknown>));

  return (
    <AppFrame learner={learner} active="/practice">
      <div className="mb-4">
        <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#ce82ff]">Spaced review</p>
        <h1 className="text-3xl font-black">Practice what slipped.</h1>
        <p className="text-[#777]">Missed cards come back. Clean cards wait longer. Classic SRS, no flashcards tedium.</p>
      </div>
      <LessonRunner
        title="Smart review"
        hearts={learner.hearts}
        maxHearts={learner.maxHearts}
        mode="practice"
        exercises={exercises}
      />
    </AppFrame>
  );
}
