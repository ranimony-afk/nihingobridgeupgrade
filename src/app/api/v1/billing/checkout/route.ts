import { createCheckout } from "@/lib/billing/service";
import { createRazorpayOrder, createStripeSession } from "@/lib/billing/providers";
import { getIdentity } from "@/lib/identity/request";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await seedReady();
  const identity = await getIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const body = (await request.json()) as { planId?: string; provider?: "stripe" | "razorpay" | "sandbox"; coupon?: string };
  const provider = body.provider ?? "sandbox";
  try {
    const checkout = await createCheckout({
      userId: identity.id,
      planId: body.planId ?? "",
      provider,
      coupon: body.coupon,
    });
    if (provider === "stripe") {
      const session = await createStripeSession({
        checkoutId: checkout.id,
        email: identity.email,
        name: checkout.plan.name,
        amount: checkout.quote.total,
        currency: checkout.quote.currency,
      });
      return Response.json({ ok: true, data: { checkoutId: checkout.id, quote: checkout.quote, url: session?.url, providerRef: session?.id } });
    }
    if (provider === "razorpay") {
      const order = await createRazorpayOrder({
        checkoutId: checkout.id,
        amount: checkout.quote.total,
        currency: checkout.quote.currency,
      });
      return Response.json({ ok: true, data: { checkoutId: checkout.id, quote: checkout.quote, razorpay: order } });
    }
    return Response.json({
      ok: true,
      data: {
        checkoutId: checkout.id,
        quote: checkout.quote,
        sandboxUrl: `/api/v1/billing/sandbox/complete?checkout=${checkout.id}`,
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Checkout failed" }, { status: 400 });
  }
}
