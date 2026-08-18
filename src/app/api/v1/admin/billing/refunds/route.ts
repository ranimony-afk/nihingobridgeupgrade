import { requestRefund, BillingError } from "@/lib/billing/service";
import { requirePermission } from "@/lib/auth/guard";
import { reportException } from "@/lib/observability";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amountMinor: z.number().int().min(1).optional(),
  reason: z.string().trim().min(2).max(255).optional(),
});

export async function POST(request: Request) {
  const identity = await requirePermission(request, "subscriptions:manage");
  if (!identity.ok) return identity.response;

  try {
    const payload = refundSchema.safeParse(await request.json());
    if (!payload.success) {
      return Response.json({ error: "The refund request is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const refund = await requestRefund({
      ...payload.data,
      actorUserId: identity.identity.user.id,
    });
    return Response.json({ ok: true, refund }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BillingError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    reportException(error, { route: "/api/v1/admin/billing/refunds", method: "POST" }, "Admin refund request failed");
    return Response.json({ error: "Refund processing is temporarily unavailable.", code: "REFUND_UNAVAILABLE" }, { status: 503 });
  }
}
