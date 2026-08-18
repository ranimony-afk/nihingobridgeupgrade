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
    payload?: { payment?: { entity?: { notes?: { checkoutId?: string } } } };
  };
  await recordWebhook("razorpay", event.event ?? "unknown", event as Record<string, unknown>);
  const checkoutId = event.payload?.payment?.entity?.notes?.checkoutId;
  if (checkoutId && event.event === "payment.captured") {
    await fulfillCheckout(checkoutId, "razorpay");
  }
  return Response.json({ ok: true });
}
