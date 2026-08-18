import { getAdminBillingOverview } from "@/lib/billing/service";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requirePermission(request, "subscriptions:manage");
  if (!identity.ok) return identity.response;
  const overview = await getAdminBillingOverview();
  return Response.json({ ok: true, ...overview }, { headers: { "Cache-Control": "no-store" } });
}
