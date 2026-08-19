import { getStaffSession } from "@/lib/audit/auth";
import {
  affiliateStats,
  createAffiliate,
  listAffiliates,
  payoutAffiliate,
  setAffiliateStatus,
} from "@/lib/billing/affiliate";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (id) return Response.json({ ok: true, data: await affiliateStats(id) });
  return Response.json({ ok: true, data: await listAffiliates() });
}

export async function POST(request: Request) {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });

  const body = (await request.json()) as {
    action?: string;
    id?: string;
    code?: string;
    name?: string;
    email?: string;
    discountPercent?: number;
    commissionPercent?: number;
    reference?: string;
    status?: string;
  };

  if (body.action === "create") {
    const result = await createAffiliate({
      code: body.code ?? "",
      name: body.name ?? "Partner",
      email: body.email ?? "partner@example.com",
      discountPercent: body.discountPercent,
      commissionPercent: body.commissionPercent,
    });
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true, data: result.affiliate });
  }

  if (body.action === "status" && body.id) {
    const row = await setAffiliateStatus(body.id, body.status === "paused" ? "paused" : "active");
    return Response.json({ ok: true, data: row });
  }

  if (body.action === "payout" && body.id) {
    const result = await payoutAffiliate(body.id, body.reference ?? `manual-${Date.now()}`);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true, data: result });
  }

  return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
