import { NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { db } from "@/db";
import { questions as questionsTable, jlptTests as jlptTestsTable } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await TestService.ensureSeeded();

    const qCount = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(questionsTable);
    const tCount = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(jlptTestsTable);

    return NextResponse.json({
      success: true,
      message: "Database seeded successfully",
      stats: {
        questions: qCount[0]?.count ?? 0,
        tests: tCount[0]?.count ?? 0,
      },
    });
  } catch (error: any) {
    console.error("POST /api/quiz/seed error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to seed" },
      { status: 500 }
    );
  }
}
