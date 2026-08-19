import { getStaffSession } from "@/lib/audit/auth";
import { listBackups, runLogicalBackup } from "@/lib/infra/backups";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const rows = await listBackups();
  return Response.json({ ok: true, data: rows });
}

export async function POST() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const result = await runLogicalBackup(`staff:${staff.email}`);
  return Response.json({ ok: true, data: result });
}
