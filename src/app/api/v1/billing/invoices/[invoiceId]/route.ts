import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { billingInvoices } from "@/db/schema";
import { requireIdentity } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const { invoiceId } = await context.params;
  const [invoice] = await db
    .select()
    .from(billingInvoices)
    .where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.userId, identity.identity.user.id)))
    .limit(1);

  if (!invoice) {
    return Response.json({ error: "Invoice was not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  return Response.json({ ok: true, invoice }, { headers: { "Cache-Control": "no-store" } });
}
