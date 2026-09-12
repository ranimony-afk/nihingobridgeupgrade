import { NextResponse } from "next/server";
import { DictionaryService } from "@/services/knowledge/dictionary";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entry = await DictionaryService.getById(id);

  if (!entry) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Entry not found" } },
      { status: 404 },
    );
  }

  // Fetch examples and conjugations in parallel
  const [examples, conjugations] = await Promise.all([
    DictionaryService.getExamples(id),
    DictionaryService.getConjugations(id),
  ]);

  return NextResponse.json({
    success: true,
    data: { ...entry, examples, conjugations },
  });
}
