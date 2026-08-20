import { fulfillCheckout, recordWebhook } from "@/lib/billing/service";
import { verifyStripeSignature } from "@/lib/billing/providers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (process.env.STRIPE_WEBHOOK_SECRET && !verifyStripeSignature(raw, signature)) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as {
    id?: string;
    type?: string;
    data?: { object?: { metadata?: { checkoutId?: string } } };
  };
  const recorded = await recordWebhook(
    "stripe",
    event.type ?? "unknown",
    event as Record<string, unknown>,
    event.id,
  );
  if (recorded.duplicate) return Response.json({ ok: true, duplicate: true });

  const checkoutId = event.data?.object?.metadata?.checkoutId;
  if (checkoutId && event.type === "checkout.session.completed") {
    await fulfillCheckout(checkoutId, "stripe");
  }
  return Response.json({ ok: true });
}
