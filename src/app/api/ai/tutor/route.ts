import { NextRequest, NextResponse } from "next/server";
import { TutorChat, type TutorContext } from "@/services/ai/tutor-chat";

export const dynamic = "force-dynamic";

/** GET: List conversations, get conversation, stats, quick actions. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const learnerId = p.get("learnerId") ?? "demo-learner";
  const view = p.get("view");
  const convId = p.get("conversationId");

  if (view === "quickActions") {
    return NextResponse.json({ success: true, data: TutorChat.getQuickActions() });
  }
  if (view === "stats") {
    return NextResponse.json({ success: true, data: TutorChat.getStats(learnerId) });
  }
  if (convId) {
    const conv = TutorChat.getConversation(convId);
    if (!conv) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }, { status: 404 });
    return NextResponse.json({ success: true, data: conv });
  }

  const convs = TutorChat.listConversations(learnerId);
  return NextResponse.json({ success: true, data: convs, meta: { total: convs.length } });
}

/** POST: Start conversation, send message, delete. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner" } = body;

  try {
    switch (action) {
      case "start": {
        const context: TutorContext = body.context ?? { currentLevel: "N5", recentMistakes: [], languagePreference: "en" };
        const result = await TutorChat.startConversation(
          learnerId, context,
          body.topicRef ?? undefined,
          body.message ?? undefined,
        );
        return NextResponse.json({ success: true, data: result }, { status: 201 });
      }
      case "send": {
        if (!body.conversationId || !body.message) {
          return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "conversationId and message required" } }, { status: 400 });
        }
        const result = await TutorChat.sendMessage({ conversationId: body.conversationId, message: body.message, learnerId });
        return NextResponse.json({ success: true, data: result });
      }
      case "delete": {
        const deleted = TutorChat.deleteConversation(body.conversationId);
        return NextResponse.json({ success: true, data: { deleted } });
      }
      default:
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) } }, { status: 500 });
  }
}
