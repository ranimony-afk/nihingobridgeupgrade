import { getStaffSession } from "@/lib/audit/auth";
import { enrichDictionary } from "@/lib/dict/enrich";

export const dynamic = "force-dynamic";

export async function POST() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const data = await enrichDictionary();
  return Response.json({ ok: true, data });
}
