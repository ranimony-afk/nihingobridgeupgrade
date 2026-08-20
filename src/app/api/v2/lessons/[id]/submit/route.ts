import { NextRequest, NextResponse } from "next/server";
import { LessonPlayer } from "@/services/learning/lesson-player";

export const dynamic = "force-dynamic";

/** Submit exercise answers for grading. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const answers = body.answers as Record<string, unknown> | undefined;

  if (!answers || typeof answers !== "object") {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "answers object required" } },
      { status: 400 },
    );
  }

  const result = await LessonPlayer.grade(id, answers);
  if (!result) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Lesson not found or has no exercises" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: result });
}
