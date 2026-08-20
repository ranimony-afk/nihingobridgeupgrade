import { getInvoice } from "@/lib/billing/service";
import { getStaffSession } from "@/lib/audit/auth";
import { getIdentity } from "@/lib/identity/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  const identity = await getIdentity(request);
  const staff = await getStaffSession();
  if (!staff && identity?.id !== invoice.invoice.userId) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  return Response.json({ ok: true, data: invoice });
}
