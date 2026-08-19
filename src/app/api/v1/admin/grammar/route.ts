import { getStaffSession } from "@/lib/audit/auth";
import { generateGrammarBatch, grammarStats, importGrammarCore } from "@/lib/grammar/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  return Response.json({ ok: true, data: await grammarStats() });
}

export async function POST(request: Request) {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const body = (await request.json()) as { action?: string; count?: number };
  if (body.action === "generate") {
    return Response.json({ ok: true, data: await generateGrammarBatch(body.count ?? 100) });
  }
  return Response.json({ ok: true, data: await importGrammarCore() });
}
