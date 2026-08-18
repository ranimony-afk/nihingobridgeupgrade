import { constructStripeEvent } from "@/lib/billing/stripe";
import { processStripeWebhook } from "@/lib/billing/webhooks";
import { reportException } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });

  const rawBody = await request.text();
  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (error) {
    reportException(error, { route: "/api/v1/billing/webhooks/stripe" }, "Stripe webhook signature verification failed");
    return Response.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  try {
    await processStripeWebhook(event);
    return Response.json({ received: true });
  } catch (error) {
    reportException(error, { route: "/api/v1/billing/webhooks/stripe", eventType: event.type }, "Stripe webhook processing failed");
    return Response.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}
