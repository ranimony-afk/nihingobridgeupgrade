import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { setStaffCookie, verifyPassword } from "@/lib/audit/auth";
import { clientKey, enforceRateLimit } from "@/lib/infra/rate-limit";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforceRateLimit({
    key: clientKey(request),
    bucket: "admin-login",
    limit: 10,
    windowSec: 60,
  });
  if (!limited.allowed) {
    return Response.json(
      { ok: false, error: "Too many sign-in attempts" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  await seedReady();
  const body = (await request.json()) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!email || !password) {
    return Response.json({ ok: false, error: "Email and password required" }, { status: 400 });
  }

  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, email));
  if (!staff || !verifyPassword(password, staff.passwordHash)) {
    return Response.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  await setStaffCookie(staff.id);
  return Response.json({
    ok: true,
    data: { id: staff.id, email: staff.email, name: staff.name, role: staff.role },
  });
}
