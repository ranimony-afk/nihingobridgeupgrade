import { db } from "@/db";
import { nihongoQuizzes } from "@/db/schema";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/mock-tests
 */
export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.select().from(nihongoQuizzes);
    const mockExam = {
      examTitle: "JLPT N5 Full Mock Exam 2026",
      durationMinutes: 30,
      totalQuestions: rows.length,
      questions: rows,
    };

    return ok(mockExam, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
