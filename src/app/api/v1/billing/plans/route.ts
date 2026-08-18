import { listPlans } from "@/lib/billing/service";
import { razorpayConfigured, stripeConfigured } from "@/lib/billing/providers";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const plans = await listPlans();
  return Response.json({
    ok: true,
    data: {
      plans,
      providers: { stripe: stripeConfigured(), razorpay: razorpayConfigured(), sandbox: true },
    },
  });
}
