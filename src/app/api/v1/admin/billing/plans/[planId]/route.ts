import { updateBillingPlan } from "@/lib/billing/service";
import { requirePermission } from "@/lib/auth/guard";
import { billingPlanKinds } from "@/lib/billing/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().min(2).max(1_000).optional(),
  kind: z.enum(billingPlanKinds).optional(),
  interval: z.enum(["day", "week", "month", "year"]).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  amountMinor: z.number().int().min(0).max(100_000_000).optional(),
  gstRateBps: z.number().int().min(0).max(10_000).optional(),
  stripePriceId: z.string().trim().max(255).nullable().optional(),
  stripeProductId: z.string().trim().max(255).nullable().optional(),
  razorpayPlanId: z.string().trim().max(255).nullable().optional(),
  active: z.boolean().optional(),
  premium: z.boolean().optional(),
  features: z.array(z.string().trim().min(1).max(160)).max(24).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ planId: string }> }) {
  const identity = await requirePermission(request, "subscriptions:manage");
  if (!identity.ok) return identity.response;

  const payload = updateSchema.safeParse(await request.json());
  if (!payload.success) {
    return Response.json({ error: "The billing plan update is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { planId } = await context.params;
  const plan = await updateBillingPlan(planId, payload.data);
  if (!plan) return Response.json({ error: "Billing plan not found.", code: "NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true, plan }, { headers: { "Cache-Control": "no-store" } });
}
