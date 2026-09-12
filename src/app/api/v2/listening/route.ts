import { NextRequest, NextResponse } from "next/server";
import { ListeningService } from "@/services/learning/listening";

export const dynamic = "force-dynamic";

/** Generate a listening practice set. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const jlpt = p.get("jlpt") ? Number(p.get("jlpt")) : undefined;
  const count = Math.min(Number(p.get("count") ?? "5"), 20);

  const practiceSet = await ListeningService.generatePractice({ jlpt, count });

  return NextResponse.json({
    success: true,
    data: practiceSet,
  });
}

/** Listening actions: getAudio, gradeAll. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  switch (action) {
    case "audioForSentence": {
      const clip = await ListeningService.getAudioForSentence(body.sentenceId);
      if (!clip) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Sentence not found" } },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, data: clip });
    }

    case "audioForWord": {
      const clips = await ListeningService.getAudioForWord(body.entryId);
      return NextResponse.json({ success: true, data: clips, meta: { total: clips.length } });
    }

    case "dialogue": {
      // Build a sample dialogue
      const dialogue = ListeningService.buildDialogue(
        "dlg-restaurant",
        "At the Restaurant",
        "A customer orders food at a Japanese restaurant.",
        5,
        [
          { speaker: "Staff", japanese: "いらっしゃいませ！", reading: null, translation: "Welcome!", startTime: 0 },
          { speaker: "Customer", japanese: "すみません、メニューをください。", reading: null, translation: "Excuse me, may I have a menu please?", startTime: 2 },
          { speaker: "Staff", japanese: "はい、どうぞ。", reading: null, translation: "Yes, here you go.", startTime: 5 },
          { speaker: "Customer", japanese: "ラーメンをください。", reading: null, translation: "Ramen, please.", startTime: 8 },
          { speaker: "Staff", japanese: "かしこまりました。少々お待ちください。", reading: null, translation: "Understood. Please wait a moment.", startTime: 10 },
        ],
      );
      return NextResponse.json({ success: true, data: dialogue });
    }

    default:
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } },
        { status: 400 },
      );
  }
}
