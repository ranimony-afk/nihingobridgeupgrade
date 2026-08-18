import { hashToken } from "@/lib/auth/crypto";
import { verifyRazorpayWebhookSignature } from "@/lib/billing/razorpay";
import { processRazorpayWebhook } from "@/lib/billing/webhooks";
import { reportException } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) return Response.json({ error: "Missing Razorpay signature." }, { status: 400 });

  const rawBody = await request.text();
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid Razorpay webhook signature." }, { status: 400 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const eventType = typeof payload.event === "string" ? payload.event : "unknown";
    const providerEventId = request.headers.get("x-razorpay-event-id") ?? hashToken(rawBody);
    await processRazorpayWebhook({ providerEventId, eventType, payload });
    return Response.json({ received: true });
  } catch (error) {
    reportException(error, { route: "/api/v1/billing/webhooks/razorpay" }, "Razorpay webhook processing failed");
    return Response.json({ error: "Razorpay webhook processing failed." }, { status: 500 });
  }
}
