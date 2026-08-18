import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, billingCoupons, billingPlans, systemSettings } from "@/db/schema";
import { uid } from "@/lib/utils";
import { COUPONS, PLANS } from "./service";

export async function ensureBillingSeed() {
  for (const plan of PLANS) {
    await db.insert(billingPlans).values({ ...plan, active: true }).onConflictDoNothing();
  }
  for (const coupon of COUPONS) {
    await db
      .insert(billingCoupons)
      .values({
        id: coupon.id,
        code: coupon.code,
        kind: coupon.kind,
        percentOff: coupon.percentOff,
        amountOff: coupon.amountOff,
        active: true,
        redeemed: 0,
      })
      .onConflictDoNothing();
  }
  const marked = await db.select().from(systemSettings).where(eq(systemSettings.key, "phase4_billing"));
  if (marked.length === 0) {
    await db.insert(systemSettings).values({ key: "phase4_billing", value: "1" });
    await db.insert(auditEvents).values({
      id: uid("aev"),
      findingId: null,
      actorId: "system",
      action: "phase4",
      detail: "Billing catalog seeded (plans, coupons, GST)",
    });
  }
}
