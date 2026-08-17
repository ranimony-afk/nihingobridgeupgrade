import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/notifications
 */
export async function GET() {
  const notifications = [
    { id: 1, title: "🔥 Daily Streak Alert", message: "Don't lose your 8-day streak! Study 5 minutes today.", time: "1h ago" },
    { id: 2, title: "⚡ Weekly League Update", message: "You are currently #1 in the Sapphire League!", time: "4h ago" },
    { id: 3, title: "🎴 New Deck Available", message: "JLPT N5 Core Vocabulary deck is ready for review.", time: "1d ago" },
  ];

  return ok(notifications, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
