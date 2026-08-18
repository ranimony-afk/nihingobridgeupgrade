import { createBillingPlan, listAllBillingPlans } from "@/lib/billing/service";
import { requirePermission } from "@/lib/auth/guard";
import { billingPlanKinds } from "@/lib/billing/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const planSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{3,64}$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(1_000),
  kind: z.enum(billingPlanKinds),
  interval: z.enum(["day", "week", "month", "year"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  amountMinor: z.number().int().min(0).max(100_000_000),
  gstRateBps: z.number().int().min(0).max(10_000),
  stripePriceId: z.string().trim().max(255).nullable().optional(),
  stripeProductId: z.string().trim().max(255).nullable().optional(),
  razorpayPlanId: z.string().trim().max(255).nullable().optional(),
  active: z.boolean().default(true),
  premium: z.boolean().default(true),
  features: z.array(z.string().trim().min(1).max(160)).max(24).default([]),
});

export async function GET(request: Request) {
  const identity = await requirePermission(request, "subscriptions:manage");
  if (!identity.ok) return identity.response;

  const plans = await listAllBillingPlans();
  return Response.json({ ok: true, plans }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const identity = await requirePermission(request, "subscriptions:manage");
  if (!identity.ok) return identity.response;

  const payload = planSchema.safeParse(await request.json());
  if (!payload.success) {
    return Response.json({ error: "The billing plan is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const plan = await createBillingPlan(payload.data);
  return Response.json({ ok: true, plan }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
