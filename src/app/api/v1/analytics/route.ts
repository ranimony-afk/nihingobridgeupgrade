import { getStaffSession } from "@/lib/audit/auth";
import { eventCounts, listEvents, trackEvent } from "@/lib/infra/analytics";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; path?: string; meta?: Record<string, string | number | boolean | null> };
  if (!body.name) return Response.json({ ok: false, error: "name required" }, { status: 400 });
  await trackEvent({
    name: body.name,
    path: body.path,
    meta: body.meta,
  });
  return Response.json({ ok: true });
}

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const [events, summary] = await Promise.all([listEvents(40), eventCounts()]);
  return Response.json({ ok: true, data: { events, summary } });
}
