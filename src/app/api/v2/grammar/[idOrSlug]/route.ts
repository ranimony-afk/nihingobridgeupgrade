import { NextRequest, NextResponse } from "next/server";
import { GrammarLearning } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ idOrSlug: string }> },
) {
  const { idOrSlug } = await params;
  const learnerId = request.nextUrl.searchParams.get("learnerId") ?? undefined;
  const decoded = decodeURIComponent(idOrSlug);

  const pattern = await GrammarLearning.get(decoded, learnerId);
  if (!pattern) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Grammar pattern not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: pattern });
}
