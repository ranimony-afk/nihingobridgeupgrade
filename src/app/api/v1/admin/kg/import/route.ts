import { getStaffSession } from "@/lib/audit/auth";
import { importCoreCorpus, importSimulated } from "@/lib/kg/import";
import { graphStats } from "@/lib/kg/search";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  return Response.json({ ok: true, data: await graphStats() });
}

export async function POST(request: Request) {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const body = (await request.json()) as { source?: string; limit?: number };
  if (body.source === "simulate") {
    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
    const result = await importSimulated(limit);
    return Response.json({ ok: true, data: result });
  }
  const counts = await importCoreCorpus();
  return Response.json({ ok: true, data: counts });
}
