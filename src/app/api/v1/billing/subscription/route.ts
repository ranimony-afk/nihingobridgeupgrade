import { cancelSubscription, resumeSubscription } from "@/lib/billing/service";
import { getIdentity } from "@/lib/identity/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const body = (await request.json()) as { action?: string };
  if (body.action === "cancel") {
    const result = await cancelSubscription(identity.id);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true, data: { endsAt: result.endsAt } });
  }
  if (body.action === "resume") {
    const result = await resumeSubscription(identity.id);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true, data: { endsAt: result.endsAt } });
  }
  return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
