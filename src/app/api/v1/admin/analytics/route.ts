import { getStaffSession } from "@/lib/audit/auth";
import {
  analyticsOverview,
  funnelAnalytics,
  learningAnalytics,
  productAnalytics,
  retentionAnalytics,
  revenueAnalytics,
} from "@/lib/analytics/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** Analytics expose revenue and learner behaviour, so staff only. */
export async function GET(request: Request) {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });

  const url = new URL(request.url);
  const section = url.searchParams.get("section");
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 365);

  if (section === "learning") return Response.json({ ok: true, data: await learningAnalytics(days) });
  if (section === "revenue") return Response.json({ ok: true, data: await revenueAnalytics() });
  if (section === "funnel") return Response.json({ ok: true, data: await funnelAnalytics() });
  if (section === "retention") return Response.json({ ok: true, data: await retentionAnalytics() });
  if (section === "product") return Response.json({ ok: true, data: await productAnalytics() });

  return Response.json({ ok: true, data: await analyticsOverview() });
}
