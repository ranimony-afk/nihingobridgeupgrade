import { clearStaffCookie } from "@/lib/audit/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearStaffCookie();
  return Response.json({ ok: true });
}
