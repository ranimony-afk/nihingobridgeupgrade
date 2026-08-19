import { getStaffSession } from "@/lib/audit/auth";
import { enrichKanjiExplorer } from "@/lib/kanji/enrich";

export const dynamic = "force-dynamic";

export async function POST() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  return Response.json({ ok: true, data: await enrichKanjiExplorer() });
}
