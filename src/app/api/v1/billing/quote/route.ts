import { quoteCheckout } from "@/lib/billing/service";
import { getIdentity } from "@/lib/identity/request";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await seedReady();
  const identity = await getIdentity(request);
  const body = (await request.json()) as { planId?: string; coupon?: string };
  try {
    const result = await quoteCheckout({
      planId: body.planId ?? "",
      coupon: body.coupon,
      userId: identity?.id,
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Quote failed" }, { status: 400 });
  }
}
