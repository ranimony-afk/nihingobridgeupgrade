import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingPlans } from "@/db/schema";

const createdPlanIds: string[] = [];

afterEach(async () => {
  for (const id of createdPlanIds.splice(0)) {
    await db.delete(billingPlans).where(eq(billingPlans.id, id));
  }
});

describe("billing catalog database integration", () => {
  it("persists active premium plans in minor currency units", async () => {
    const code = `TEST_${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const [plan] = await db
      .insert(billingPlans)
      .values({
        code,
        name: "Test Plus",
        description: "Database integration plan",
        kind: "subscription",
        interval: "month",
        currency: "INR",
        amountMinor: 79900,
        gstRateBps: 1800,
        premium: true,
        features: ["Integration coverage"],
      })
      .returning();
    createdPlanIds.push(plan.id);

    const [stored] = await db.select().from(billingPlans).where(eq(billingPlans.id, plan.id)).limit(1);
    expect(stored?.amountMinor).toBe(79900);
    expect(stored?.features).toEqual(["Integration coverage"]);
    expect(stored?.active).toBe(true);
  });
});
