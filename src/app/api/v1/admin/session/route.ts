import { getStaffSession } from "@/lib/audit/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, data: staff });
}
