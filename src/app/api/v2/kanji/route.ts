import { NextRequest, NextResponse } from "next/server";
import { KanjiLearning } from "@/services/knowledge/kanji";

export const dynamic = "force-dynamic";

/** Search kanji or list by JLPT/grade, or run practice/review actions. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const query = p.get("q");
  const jlpt = p.get("jlpt") ? Number(p.get("jlpt")) : undefined;

  if (query) {
    const results = await KanjiLearning.search(query, { jlpt, limit: 30 });
    return NextResponse.json({ success: true, data: results, meta: { total: results.length } });
  }

  if (jlpt) {
    const results = await KanjiLearning.getByJlpt(jlpt);
    return NextResponse.json({ success: true, data: results, meta: { total: results.length, jlpt } });
  }

  // Default: list radicals
  const radicals = await KanjiLearning.listRadicals();
  return NextResponse.json({ success: true, data: radicals, meta: { total: radicals.length, type: "radicals" } });
}

/** Kanji learning actions: review, practice. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner", kanjiId, correct, reviewType = "meaning", count = 10 } = body;

  switch (action) {
    case "review": {
      if (!kanjiId || typeof correct !== "boolean") {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "kanjiId and correct required" } },
          { status: 400 },
        );
      }
      const result = await KanjiLearning.review(learnerId, kanjiId, correct, reviewType);
      return NextResponse.json({ success: true, data: result });
    }
    case "practice": {
      const items = await KanjiLearning.practice(learnerId, count);
      return NextResponse.json({ success: true, data: { items, total: items.length } });
    }
    default:
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } },
        { status: 400 },
      );
  }
}
