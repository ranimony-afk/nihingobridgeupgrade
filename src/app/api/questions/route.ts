import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { db } from "@/db";
import { questions as questionsTable } from "@/db/schema";
import { JLPTLevel, QuestionCategory, QuestionSection } from "@/types/quiz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get("level") as JLPTLevel | null;
    const section = searchParams.get("section") as QuestionSection | null;
    const category = searchParams.get("category") as QuestionCategory | null;
    const mondaiNumber = searchParams.get("mondaiNumber")
      ? parseInt(searchParams.get("mondaiNumber")!, 10)
      : undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const tag = searchParams.get("tag") || undefined;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : 50;
    const offset = searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!, 10)
      : 0;

    const data = await TestService.queryQuestions({
      level: level || undefined,
      section: section || undefined,
      category: category || undefined,
      mondaiNumber,
      keyword,
      tag,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      total: data.total,
      questions: data.questions,
    });
  } catch (error: any) {
    console.error("GET /api/questions error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch questions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id = `q-${Date.now()}`,
      jlptLevel = "N5",
      section,
      category,
      mondaiNumber = 1,
      mondaiTitle = "問題１",
      questionType = "multiple_choice",
      prompt,
      promptFurigana,
      promptTranslation,
      passage,
      passageFurigana,
      passageTranslation,
      audioScript,
      audioUrl,
      options,
      starOrderParts,
      correctAnswer,
      explanation,
      explanationBreakdown,
      difficulty = 3,
      tags = [],
    } = body;

    if (!prompt || !options || !correctAnswer || !explanation) {
      return NextResponse.json(
        { success: false, error: "Missing required question fields" },
        { status: 400 }
      );
    }

    await db.insert(questionsTable).values({
      id,
      jlptLevel,
      section: section || "vocab",
      category: category || "contextual_use",
      mondaiNumber,
      mondaiTitle,
      questionType,
      prompt,
      promptFurigana: promptFurigana || null,
      promptTranslation,
      passage: passage || null,
      passageFurigana: passageFurigana || null,
      passageTranslation: passageTranslation || null,
      audioScript: audioScript || null,
      audioUrl: audioUrl || null,
      options,
      starOrderParts: starOrderParts || null,
      correctAnswer,
      explanation,
      explanationBreakdown: explanationBreakdown || null,
      difficulty,
      tags,
      isActive: true,
    });

    return NextResponse.json({
      success: true,
      message: "Question created successfully",
      id,
    });
  } catch (error: any) {
    console.error("POST /api/questions error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create question" },
      { status: 500 }
    );
  }
}
