import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { hashPassword, readStaffToken, signStaffToken, verifyPassword } from "./crypto";

export const STAFF_COOKIE = "nb_staff";
export { hashPassword, verifyPassword, signStaffToken, readStaffToken };

export async function setStaffCookie(staffId: string) {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, signStaffToken(staffId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearStaffCookie() {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getStaffSession() {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    if (session?.user?.id && session.user.email) {
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? "Staff",
        role: session.user.role ?? "editor",
      };
    }
  } catch {
    // Auth.js is additive; HMAC cookie remains the fallback.
  }

  const jar = await cookies();
  const staffId = readStaffToken(jar.get(STAFF_COOKIE)?.value);
  if (!staffId) return null;
  const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, staffId));
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}
