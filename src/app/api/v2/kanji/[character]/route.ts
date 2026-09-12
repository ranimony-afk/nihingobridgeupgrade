import { NextRequest, NextResponse } from "next/server";
import { KanjiLearning } from "@/services/knowledge/kanji";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ character: string }> },
) {
  const { character } = await params;
  const learnerId = request.nextUrl.searchParams.get("learnerId") ?? undefined;

  const decoded = decodeURIComponent(character);
  const kanji = await KanjiLearning.getByCharacter(decoded, learnerId);

  if (!kanji) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: `Kanji "${decoded}" not found` } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: kanji });
}
