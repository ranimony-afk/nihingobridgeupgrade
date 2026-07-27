import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/downloads
 */
export async function GET() {
  const downloadItems = [
    { id: 1, title: "Hiragana Practice Workbook (PDF)", url: "https://cdn.nihongobridge.com/downloads/hiragana-workbook.pdf", size: "2.1 MB" },
    { id: 2, title: "JLPT N5 Grammar Cheat Sheet (PDF)", url: "https://cdn.nihongobridge.com/downloads/n5-grammar-cheatsheet.pdf", size: "0.9 MB" },
    { id: 3, title: "Daily Conversation Audio Pack (ZIP)", url: "https://cdn.nihongobridge.com/downloads/conversation-audio.zip", size: "18 MB" },
  ];

  return ok(downloadItems, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
