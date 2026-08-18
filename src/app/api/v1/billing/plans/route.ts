import { listActiveBillingPlans } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const plans = await listActiveBillingPlans();
  return Response.json(
    {
      plans: plans.map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        kind: plan.kind,
        interval: plan.interval,
        currency: plan.currency,
        amountMinor: plan.amountMinor,
        gstRateBps: plan.gstRateBps,
        premium: plan.premium,
        features: plan.features,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
