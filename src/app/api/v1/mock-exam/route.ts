import { db } from "@/db";
import { nihongoQuizzes, jlptExamSessions, users, auditLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/mock-exam?jlptLevel=N5&randomize=true
 * POST /api/v1/mock-exam { jlptLevel, answers: { [qId]: optionIdx }, timeSpentSeconds, userEmail? }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const jlptLevel = url.searchParams.get("jlptLevel") ?? "N5";
    const randomize = url.searchParams.get("randomize") === "true";

    const filters = [eq(nihongoQuizzes.category, "mock_exam")];
    if (jlptLevel && jlptLevel !== "all") {
      filters.push(eq(nihongoQuizzes.jlptLevel, jlptLevel));
    }

    let rows = await db.select().from(nihongoQuizzes).where(and(...filters));
    if (rows.length === 0) {
      // Fallback to all mock quizzes if level specific query is empty
      rows = await db.select().from(nihongoQuizzes);
    }

    if (randomize) {
      rows = [...rows].sort(() => Math.random() - 0.5);
    }

    const durationMinutes = jlptLevel === "N1" || jlptLevel === "N2" ? 45 : 30;

    return ok({
      jlptLevel,
      examTitle: `Official JLPT ${jlptLevel} Simulator Mock Exam 2026`,
      totalQuestions: rows.length,
      durationMinutes,
      durationSeconds: durationMinutes * 60,
      questions: rows,
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      jlptLevel?: string;
      answers?: Record<string, number>;
      timeSpentSeconds?: number;
      userEmail?: string;
    };

    const jlptLevel = body.jlptLevel ?? "N5";
    const answers = body.answers ?? {};
    const email = (body.userEmail ?? "learner@nihongobridge.com").trim().toLowerCase();

    // Fetch questions
    const questions = await db.select().from(nihongoQuizzes);

    let totalScore = 0;
    let vocabScore = 0;
    let grammarScore = 0;
    let readingScore = 0;
    const incorrectAnswers: Array<{ question: string; chosen: string; correct: string; explanation: string }> = [];

    questions.forEach((q) => {
      const chosenIdx = answers[String(q.id)];
      const isCorrect = chosenIdx === q.correctIndex;
      const points = isCorrect ? 25 : 0;

      if (isCorrect) {
        totalScore += points;
        if (q.sectionType === "vocabulary") vocabScore += points;
        else if (q.sectionType === "grammar") grammarScore += points;
        else readingScore += points;
      } else {
        const chosenText = chosenIdx !== undefined && q.options[chosenIdx] ? q.options[chosenIdx] : "Unanswered";
        const correctText = q.options[q.correctIndex] ?? "Correct Option";
        incorrectAnswers.push({
          question: q.question,
          chosen: chosenText,
          correct: correctText,
          explanation: q.explanation ?? "Review the grammar/vocabulary rule.",
        });
      }
    });

    const maxScore = Math.max(100, questions.length * 25);
    const percentage = Math.round((totalScore / maxScore) * 100);
    const passed = percentage >= 60;
    const certificateCode = passed ? `CERT-JLPT-${jlptLevel}-${Math.random().toString(36).substring(2, 8).toUpperCase()}` : null;

    // Ensure user exists
    let userId: number | null = null;
    const userRow = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (userRow.length > 0) {
      userId = userRow[0].id;
    }

    const inserted = await db
      .insert(jlptExamSessions)
      .values({
        userId,
        jlptLevel,
        totalScore,
        maxScore,
        passed,
        vocabScore,
        grammarScore,
        readingScore,
        certificateCode,
        incorrectAnswers,
      })
      .returning();

    await db.insert(auditLogs).values({
      action: "submit_mock_exam",
      entityType: "jlpt_exam",
      entityId: inserted[0].id,
      details: { jlptLevel, totalScore, passed, certificateCode },
    });

    return ok({
      examSessionId: inserted[0].id,
      jlptLevel,
      totalScore,
      maxScore,
      percentage,
      passed,
      vocabScore,
      grammarScore,
      readingScore,
      certificateCode,
      incorrectAnswers,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
