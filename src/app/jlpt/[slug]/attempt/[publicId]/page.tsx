import { notFound } from "next/navigation";

import { AssessmentRunner } from "@/components/quiz/assessment-runner";
import { readLearner } from "@/services/learning/session";
import { getAttempt, submitAttempt } from "@/services/jlpt/tests";

export const dynamic = "force-dynamic";

/** A timed JLPT attempt. Expired attempts are scored on first read. */
export default async function JlptAttemptPage({
  params,
}: {
  params: Promise<{ slug: string; publicId: string }>;
}) {
  const { slug, publicId } = await params;
  const learner = await readLearner();
  if (!learner) notFound();

  let detail = await getAttempt(publicId, learner.id);
  if (detail && detail.run.status === "in_progress" && detail.run.expiresAt) {
    if (new Date(detail.run.expiresAt).getTime() <= Date.now()) {
      detail = (await submitAttempt({ publicId, userId: learner.id })) ?? detail;
    }
  }
  if (!detail || detail.run.jlptSlug !== slug) notFound();

  return (
    <AssessmentRunner
      initial={detail}
      exitHref={`/jlpt/${encodeURIComponent(slug)}`}
      exitLabel="Back to the test"
    />
  );
}
