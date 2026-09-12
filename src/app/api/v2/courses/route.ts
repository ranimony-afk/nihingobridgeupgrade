import { NextRequest, NextResponse } from "next/server";
import { CourseEngine } from "@/services/learning/course-engine";

export const dynamic = "force-dynamic";

/** List courses (public: published only; admin: all statuses). */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const result = await CourseEngine.listCourses({
    status: (p.get("status") as "draft" | "published") ?? "published",
    level: p.get("level") ?? undefined,
    jlpt: p.get("jlpt") ? Number(p.get("jlpt")) : undefined,
    page: Number(p.get("page") ?? "1"),
    pageSize: Math.min(Number(p.get("pageSize") ?? "20"), 100),
  });

  return NextResponse.json({
    success: true,
    data: result.courses,
    meta: { page: result.page, pageSize: result.pageSize, total: result.total },
  });
}

/** Create a new course (admin). */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const course = await CourseEngine.createCourse(body);
  return NextResponse.json({ success: true, data: course }, { status: 201 });
}
