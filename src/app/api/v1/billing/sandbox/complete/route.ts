import { fulfillCheckout, recordWebhook } from "@/lib/billing/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await seedReady();
  const body = (await request.json().catch(() => ({}))) as { checkout?: string };
  const url = new URL(request.url);
  const checkoutId = body.checkout || url.searchParams.get("checkout") || "";
  if (!checkoutId) return Response.json({ ok: false, error: "checkout required" }, { status: 400 });
  await recordWebhook("sandbox", "checkout.paid", { checkoutId });
  const result = await fulfillCheckout(checkoutId, "sandbox");
  return Response.json({ ok: true, data: result });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const checkoutId = url.searchParams.get("checkout") || "";
  if (!checkoutId) return Response.redirect(new URL("/billing?error=missing", request.url));
  await seedReady();
  await fulfillCheckout(checkoutId, "sandbox");
  return Response.redirect(new URL(`/billing/success?checkout=${checkoutId}`, request.url));
}
