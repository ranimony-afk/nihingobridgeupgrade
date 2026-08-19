import { getStaffSession } from "@/lib/audit/auth";
import { updateFindingStatus } from "@/lib/audit/repo";
import type { FindingStatus } from "@/lib/audit/types";

export const dynamic = "force-dynamic";

const allowed: FindingStatus[] = ["open", "in_progress", "resolved", "accepted_risk"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as { status?: string };
  if (!body.status || !allowed.includes(body.status as FindingStatus)) {
    return Response.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }

  const result = await updateFindingStatus(id, body.status as FindingStatus, staff.id);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }
  return Response.json({ ok: true, data: result.finding });
}
