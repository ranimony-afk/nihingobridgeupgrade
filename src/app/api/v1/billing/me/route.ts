import { billingSnapshot } from "@/lib/billing/service";
import { getIdentity } from "@/lib/identity/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const data = await billingSnapshot(identity.id);
  return Response.json({ ok: true, data: { ...data, plan: identity.plan } });
}
