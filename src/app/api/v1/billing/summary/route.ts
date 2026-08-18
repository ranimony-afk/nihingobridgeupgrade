import { getBillingSummary } from "@/lib/billing/service";
import { requireIdentity } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const summary = await getBillingSummary(identity.identity.user.id);
  return Response.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
}
