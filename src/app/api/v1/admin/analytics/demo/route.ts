import { getStaffSession } from "@/lib/audit/auth";
import { hasRealActivity, seedDemoAnalytics } from "@/lib/analytics/demo";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  return Response.json({ ok: true, data: { hasRealActivity: await hasRealActivity() } });
}

/** Explicit, staff-only. Never runs automatically over real traffic. */
export async function POST(request: Request) {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const result = await seedDemoAnalytics(body.force === true);
  return Response.json({ ok: true, data: result });
}
