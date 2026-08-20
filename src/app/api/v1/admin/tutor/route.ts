import { getStaffSession } from "@/lib/audit/auth";
import { listSessions, tutorStats } from "@/lib/tutor/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const [stats, sessions] = await Promise.all([tutorStats(), listSessions(30)]);
  return Response.json({ ok: true, data: { stats, sessions } });
}
