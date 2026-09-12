import { NextRequest, NextResponse } from "next/server";
import { GrammarLearning } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

/** Search grammar or list by JLPT level. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const query = p.get("q");
  const jlpt = p.get("jlpt") ? Number(p.get("jlpt")) : undefined;

  if (query) {
    const results = await GrammarLearning.search(query, { jlpt, limit: 20 });
    return NextResponse.json({ success: true, data: results, meta: { total: results.length } });
  }
  if (jlpt) {
    const results = await GrammarLearning.getByJlpt(jlpt);
    return NextResponse.json({ success: true, data: results, meta: { total: results.length, jlpt } });
  }

  // Default: N5 grammar
  const results = await GrammarLearning.getByJlpt(5);
  return NextResponse.json({ success: true, data: results, meta: { total: results.length, jlpt: 5 } });
}

/** Grammar actions: review, practice. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner", grammarId, correct, reviewType = "recognition", count = 8 } = body;

  switch (action) {
    case "review": {
      if (!grammarId || typeof correct !== "boolean") {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "grammarId and correct required" } },
          { status: 400 },
        );
      }
      const result = await GrammarLearning.review(learnerId, grammarId, correct, reviewType);
      return NextResponse.json({ success: true, data: result });
    }
    case "practice": {
      const items = await GrammarLearning.practice(learnerId, count);
      return NextResponse.json({ success: true, data: { items, total: items.length } });
    }
    default:
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } },
        { status: 400 },
      );
  }
}
