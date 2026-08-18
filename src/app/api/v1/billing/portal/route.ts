import { BillingError, createBillingPortal } from "@/lib/billing/service";
import { requireIdentity } from "@/lib/auth/guard";
import { reportException } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  try {
    const portal = await createBillingPortal(identity.identity.user);
    return Response.json({ ok: true, url: portal.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BillingError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    reportException(error, { route: "/api/v1/billing/portal", method: "POST" }, "Billing portal creation failed");
    return Response.json({ error: "Billing portal is temporarily unavailable.", code: "BILLING_UNAVAILABLE" }, { status: 503 });
  }
}
