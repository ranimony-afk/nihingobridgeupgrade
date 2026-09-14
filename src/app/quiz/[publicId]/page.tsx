import { notFound } from "next/navigation";

import { AssessmentRunner } from "@/components/quiz/assessment-runner";
import { readLearner } from "@/services/learning/session";
import { finalizeRun, getRun } from "@/services/quiz/run-engine";

export const dynamic = "force-dynamic";

/** Resumes a quiz: unanswered items stay open, answered ones keep their grade. */
export default async function QuizRunPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const learner = await readLearner();
  if (!learner) notFound();

  let detail = await getRun(publicId, learner.id);
  /* A run whose clock ran out is scored on first read so the learner is never
   * locked out of their own result. */
  if (detail && detail.run.status === "in_progress" && detail.run.expiresAt) {
    if (new Date(detail.run.expiresAt).getTime() <= Date.now()) {
      detail = (await finalizeRun({ publicId, userId: learner.id })) ?? detail;
    }
  }
  if (!detail || detail.run.kind !== "quiz") notFound();

  return (
    <AssessmentRunner
      initial={detail}
      exitHref="/quiz"
      exitLabel="Back to quizzes"
    />
  );
}
