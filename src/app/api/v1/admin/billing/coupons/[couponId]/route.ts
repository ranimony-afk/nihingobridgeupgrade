import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingCoupons } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().trim().min(2).max(160).optional(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ couponId: string }> }) {
  const identity = await requirePermission(request, "subscriptions:manage");
  if (!identity.ok) return identity.response;
  const payload = updateSchema.safeParse(await request.json());
  if (!payload.success) return Response.json({ error: "The coupon update is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });

  const { couponId } = await context.params;
  const { expiresAt, ...couponPatch } = payload.data;
  const [coupon] = await db
    .update(billingCoupons)
    .set({
      ...couponPatch,
      ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(billingCoupons.id, couponId))
    .returning();
  if (!coupon) return Response.json({ error: "Coupon not found.", code: "NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true, coupon }, { headers: { "Cache-Control": "no-store" } });
}
