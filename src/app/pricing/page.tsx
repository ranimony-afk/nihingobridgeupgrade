import { PricingClient } from "@/components/billing/pricing-client";
import { listActiveBillingPlans } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

type PricingPageProps = { searchParams: Promise<{ locked?: string }> };

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const [plans, params] = await Promise.all([listActiveBillingPlans(), searchParams]);

  return <PricingClient plans={plans} locked={params.locked === "1"} />;
}
