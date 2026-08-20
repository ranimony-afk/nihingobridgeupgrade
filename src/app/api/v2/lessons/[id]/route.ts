import { NextRequest, NextResponse } from "next/server";
import { CourseEngine } from "@/services/learning/course-engine";

export const dynamic = "force-dynamic";

/** Get lesson with all items and content. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lesson = await CourseEngine.getLesson(id);
  if (!lesson) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Lesson not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: lesson });
}
