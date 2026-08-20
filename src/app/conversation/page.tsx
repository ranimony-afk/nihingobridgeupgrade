import nextDynamic from "next/dynamic";

/** The tutor chat is interactive-only; defer it so the page shell paints first. */
const TutorLab = nextDynamic(() => import("@/components/TutorLab").then((mod) => mod.TutorLab), {
  loading: () => <p className="text-[#777]">Loading tutor…</p>,
});
import { tutorProvider } from "@/lib/tutor/provider";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function ConversationPage() {
  await seedReady();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ce82ff]">AI tutor</p>
      <h1 className="text-3xl font-black">Conversation lab</h1>
      <p className="mt-2 text-[#777]">
        Streaming roleplay with corrections, grammar/vocabulary detection, adaptive level, and shadowing scores.
        Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) for live models; otherwise a local sensei answers.
      </p>
      <div className="mt-6">
        <TutorLab provider={tutorProvider()} />
      </div>
    </main>
  );
}
