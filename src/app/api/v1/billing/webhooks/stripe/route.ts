import { fulfillCheckout, recordWebhook } from "@/lib/billing/service";
import { verifyStripeSignature } from "@/lib/billing/providers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (process.env.STRIPE_WEBHOOK_SECRET && !verifyStripeSignature(raw, signature)) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as { type?: string; data?: { object?: { metadata?: { checkoutId?: string } } } };
  await recordWebhook("stripe", event.type ?? "unknown", event as Record<string, unknown>);
  const checkoutId = event.data?.object?.metadata?.checkoutId;
  if (checkoutId && event.type === "checkout.session.completed") {
    await fulfillCheckout(checkoutId, "stripe");
  }
  return Response.json({ ok: true });
}
