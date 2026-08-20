import { NextRequest, NextResponse } from "next/server";
import { QuizEngine, type QuestionSeed } from "@/services/learning/quiz-engine";
import { db } from "@/db";
import { dictionaryEntries, dictionarySenses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Generate a quiz from dictionary/kanji data.
 * GET /api/v2/quiz/generate?jlpt=5&count=5&type=mixed
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const jlpt = Number(p.get("jlpt") ?? "5");
  const count = Math.min(Number(p.get("count") ?? "5"), 20);

  // Fetch entries to build questions from
  const entries = await db.select().from(dictionaryEntries)
    .where(eq(dictionaryEntries.jlptLevel, jlpt))
    .orderBy(asc(dictionaryEntries.frequencyRank))
    .limit(count);

  const seeds: QuestionSeed[] = [];
  for (const entry of entries) {
    const senses = await db.select().from(dictionarySenses)
      .where(eq(dictionarySenses.entryId, entry.id))
      .orderBy(asc(dictionarySenses.position))
      .limit(2);
    const meanings = senses.flatMap((s) => {
      const g = s.glosses as Record<string, string[]>;
      return g.en ?? [];
    }).slice(0, 3);

    seeds.push({
      target: entry.headword,
      reading: entry.reading,
      meanings,
      pos: entry.pos ?? undefined,
      knowledgeRef: entry.id,
      jlpt: entry.jlptLevel ?? undefined,
    });
  }

  const questions = QuizEngine.generateMixed(seeds, 1);
  const rendered = questions.map((q) => QuizEngine.render(q));

  return NextResponse.json({
    success: true,
    data: {
      questions: rendered,
      totalQuestions: rendered.length,
      // Store full questions server-side for grading (in production, use session/cache)
      _gradeKey: Buffer.from(JSON.stringify(questions)).toString("base64"),
    },
  });
}

/** Grade submitted answers. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { _gradeKey, answers } = body;

  if (!_gradeKey || !answers) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "_gradeKey and answers required" } },
      { status: 400 },
    );
  }

  const questions = JSON.parse(Buffer.from(_gradeKey, "base64").toString());
  const result = QuizEngine.gradeAll(questions, answers);

  return NextResponse.json({ success: true, data: result });
}
