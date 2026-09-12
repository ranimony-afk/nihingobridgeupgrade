import { NextRequest, NextResponse } from "next/server";
import { CourseEngine } from "@/services/learning/course-engine";

export const dynamic = "force-dynamic";

/** Get course with modules and lessons. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const course = await CourseEngine.getCourse(id);
  if (!course) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Course not found" } },
      { status: 404 },
    );
  }
  const stats = await CourseEngine.getCourseStats(course.id);
  return NextResponse.json({ success: true, data: { ...course, stats } });
}

/** Update a course (admin). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const course = await CourseEngine.updateCourse(id, body);
  if (!course) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Course not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: course });
}

/** Delete a course (admin). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await CourseEngine.deleteCourse(id);
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Course not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: { deleted: true } });
}
