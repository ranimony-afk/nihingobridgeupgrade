import { fulfillCheckout, recordWebhook } from "@/lib/billing/service";
import { verifyRazorpaySignature } from "@/lib/billing/providers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (process.env.RAZORPAY_WEBHOOK_SECRET && !verifyRazorpaySignature(raw, signature)) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; notes?: { checkoutId?: string } } } };
  };
  const entity = event.payload?.payment?.entity;
  const recorded = await recordWebhook(
    "razorpay",
    event.event ?? "unknown",
    event as Record<string, unknown>,
    request.headers.get("x-razorpay-event-id") ?? entity?.id,
  );
  if (recorded.duplicate) return Response.json({ ok: true, duplicate: true });

  const checkoutId = entity?.notes?.checkoutId;
  if (checkoutId && event.event === "payment.captured") {
    await fulfillCheckout(checkoutId, "razorpay");
  }
  return Response.json({ ok: true });
}
