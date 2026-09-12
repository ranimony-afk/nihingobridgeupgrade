import { NextRequest, NextResponse } from "next/server";
import { LessonPlayer } from "@/services/learning/lesson-player";

export const dynamic = "force-dynamic";

/** Load a lesson for interactive play. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lesson = await LessonPlayer.load(id);
  if (!lesson) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Lesson not found" } },
      { status: 404 },
    );
  }

  // Strip answer keys from exercises before sending to client
  const safeItems = lesson.items.map((item) => {
    if (item.type === "exercise") {
      const { _answer, _accepted, ...safe } = item;
      return safe;
    }
    return item;
  });

  return NextResponse.json({
    success: true,
    data: { ...lesson, items: safeItems },
  });
}
