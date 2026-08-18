import { redirect } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { KanaBoard } from "@/components/KanaBoard";
import { getPublicLearner } from "@/lib/learner";

export const dynamic = "force-dynamic";

export default async function KanaPage() {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");

  return (
    <AppFrame learner={learner} active="/kana">
      <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#1cb0f6]">Reference</p>
      <h1 className="text-3xl font-black">Tap a character. Hear it. Remember it.</h1>
      <p className="mt-1 max-w-2xl text-[#777]">
        The full gojūon charts. Use them as a warm-up before a lesson, or as a quiet review when hearts are low.
      </p>
      <KanaBoard />
    </AppFrame>
  );
}
