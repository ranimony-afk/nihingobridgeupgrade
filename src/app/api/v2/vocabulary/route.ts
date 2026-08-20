import { NextRequest, NextResponse } from "next/server";
import { VocabularyLearning } from "@/services/learning/vocabulary-learning";

export const dynamic = "force-dynamic";

/** Get vocabulary progress + stats for a learner. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const learnerId = p.get("learnerId") ?? "demo-learner";
  const mastery = p.get("mastery") as "introduced" | "practicing" | "familiar" | "mastered" | undefined;
  const bookmarkedOnly = p.get("bookmarked") === "true";
  const page = Number(p.get("page") ?? "1");
  const pageSize = Math.min(Number(p.get("pageSize") ?? "50"), 100);

  const result = await VocabularyLearning.getAll(learnerId, { mastery, bookmarkedOnly, page, pageSize });
  return NextResponse.json({ success: true, data: result });
}

/** Vocabulary actions: learn, markKnown, favorite, review. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner", entryId, correct } = body;

  if (!entryId) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "entryId required" } },
      { status: 400 },
    );
  }

  switch (action) {
    case "learn": {
      const result = await VocabularyLearning.learn(learnerId, entryId);
      return NextResponse.json({ success: true, data: result });
    }
    case "markKnown": {
      const result = await VocabularyLearning.markKnown(learnerId, entryId);
      return NextResponse.json({ success: true, data: result });
    }
    case "favorite": {
      const result = await VocabularyLearning.toggleFavorite(learnerId, entryId);
      return NextResponse.json({ success: true, data: result });
    }
    case "review": {
      if (typeof correct !== "boolean") {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "correct (boolean) required for review" } },
          { status: 400 },
        );
      }
      const result = await VocabularyLearning.review(learnerId, entryId, correct);
      return NextResponse.json({ success: true, data: result });
    }
    case "practice": {
      const count = body.count ?? 10;
      const result = await VocabularyLearning.practice(learnerId, count);
      return NextResponse.json({ success: true, data: result });
    }
    default:
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}. Use: learn, markKnown, favorite, review, practice` } },
        { status: 400 },
      );
  }
}
