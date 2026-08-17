import Link from "next/link";
import { db } from "@/db";
import { nihongoQuizzes, jlptExamSessions } from "@/db/schema";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";
import { desc } from "drizzle-orm";
import { MockExamClient } from "./MockExamClient";

export const dynamic = "force-dynamic";

export default async function JlptMockExamPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  await ensureSeed();
  const { level = "N5" } = await searchParams;
  const cfg = getBrand("nihongo")!;
  const questions = await db.select().from(nihongoQuizzes);
  const sessions = await db
    .select()
    .from(jlptExamSessions)
    .orderBy(desc(jlptExamSessions.completedAt))
    .limit(20);

  return (
    <main
      className="min-h-screen px-6 py-10"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <BrandHeader brand={cfg} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: cfg.theme.primary }}>
              Official JLPT Practice Exam Simulator ⏱
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Complete timed mock exam with countdown timer, pause &amp; resume controls, question flagging, section scoring, and verified certificate generation.
            </p>
          </div>
        </div>

        <MockExamClient
          initialQuestions={questions as never}
          defaultLevel={level}
          initialSessions={sessions as never}
        />
      </div>
    </main>
  );
}
