import { desc } from "drizzle-orm";
import { db } from "@/db";
import { billingCoupons } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,64}$/),
    name: z.string().trim().min(2).max(160),
    active: z.boolean().default(true),
    percentOffBps: z.number().int().min(1).max(10_000).nullable().optional(),
    amountOffMinor: z.number().int().min(1).max(100_000_000).nullable().optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    billingPlanId: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.percentOffBps) === Boolean(value.amountOffMinor)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["percentOffBps"],
        message: "Provide exactly one percentage or fixed discount.",
      });
    }
    if (value.amountOffMinor && !value.currency) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currency"],
        message: "Fixed discounts require a currency.",
      });
    }
  });

export async function GET(request: Request) {
  const identity = await requirePermission(request, "subscriptions:manage");
  if (!identity.ok) return identity.response;
  const coupons = await db.select().from(billingCoupons).orderBy(desc(billingCoupons.createdAt));
  return Response.json({ ok: true, coupons }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const identity = await requirePermission(request, "subscriptions:manage");
  if (!identity.ok) return identity.response;
  const payload = couponSchema.safeParse(await request.json());
  if (!payload.success) {
    return Response.json({ error: "The coupon is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const [coupon] = await db
    .insert(billingCoupons)
    .values({
      ...payload.data,
      percentOffBps: payload.data.percentOffBps ?? null,
      amountOffMinor: payload.data.amountOffMinor ?? null,
      currency: payload.data.currency ?? null,
      maxRedemptions: payload.data.maxRedemptions ?? null,
      startsAt: payload.data.startsAt ? new Date(payload.data.startsAt) : null,
      expiresAt: payload.data.expiresAt ? new Date(payload.data.expiresAt) : null,
      billingPlanId: payload.data.billingPlanId ?? null,
    })
    .returning();
  return Response.json({ ok: true, coupon }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
