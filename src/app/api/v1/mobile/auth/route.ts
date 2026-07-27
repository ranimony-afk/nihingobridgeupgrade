import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { signMobileJwt, verifyMobileJwt, checkRateLimit } from "@/shared/mobile";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mobile/auth { email, brandSlug?, token? }
 * Returns JWT token for Flutter and native mobile clients.
 */
export async function POST(req: Request) {
  try {
    await ensureSeed();
    const clientIp = req.headers.get("x-forwarded-for") || "mobile-client";
    const rl = checkRateLimit(clientIp, 60, 60000);
    if (!rl.allowed) return fail("Too many requests", 429, "RATE_LIMITED");

    const body = (await req.json()) as { email?: string; brandSlug?: string; token?: string };

    // Token verification / refresh mode
    if (body.token) {
      const decoded = verifyMobileJwt(body.token);
      if (!decoded) return fail("Invalid or expired JWT token", 401, "UNAUTHORIZED");
      return ok({ valid: true, user: decoded });
    }

    if (!body.email) return fail("Email is required", 400, "BAD_REQUEST");

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    let userRecord;
    if (existing.length > 0) {
      userRecord = existing[0];
    } else {
      const inserted = await db
        .insert(users)
        .values({
          email: body.email,
          displayName: body.email.split("@")[0],
          role: "learner",
        })
        .returning();
      userRecord = inserted[0];
    }

    const token = signMobileJwt({
      userId: userRecord.id,
      email: userRecord.email,
      role: userRecord.role,
      brandSlug: body.brandSlug ?? "nihongo",
    });

    return ok(
      {
        token,
        tokenType: "Bearer",
        expiresIn: 86400 * 30,
        user: {
          id: userRecord.id,
          email: userRecord.email,
          displayName: userRecord.displayName,
          role: userRecord.role,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rl.remaining),
        },
      },
    );
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
