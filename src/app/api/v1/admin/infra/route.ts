import { getStaffSession } from "@/lib/audit/auth";
import { listEvents, eventCounts } from "@/lib/infra/analytics";
import { listBackups } from "@/lib/infra/backups";
import { listErrors } from "@/lib/infra/errors";
import { getInfraStatus } from "@/lib/infra/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const [status, backups, errors, analytics, summary] = await Promise.all([
    getInfraStatus(),
    listBackups(8),
    listErrors(8),
    listEvents(8),
    eventCounts(),
  ]);
  return Response.json({ ok: true, data: { status, backups, errors, analytics, summary } });
}
