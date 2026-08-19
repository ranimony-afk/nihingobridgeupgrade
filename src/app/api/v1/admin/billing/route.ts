import { getStaffSession } from "@/lib/audit/auth";
import { adminBilling, refundInvoice } from "@/lib/billing/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  return Response.json({ ok: true, data: await adminBilling() });
}

export async function POST(request: Request) {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const body = (await request.json()) as { action?: string; invoiceId?: string; reason?: string };
  if (body.action === "refund" && body.invoiceId) {
    const result = await refundInvoice(body.invoiceId, body.reason ?? "admin refund");
    return Response.json({ ok: true, data: result });
  }
  return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
