import { beginTwoFactorEnrollment } from "@/lib/auth/identity";
import { requireIdentity } from "@/lib/auth/guard";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { mfaRateLimitPolicy } from "@/lib/rate-limit";
import { reportException } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, mfaRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  try {
    const enrollment = await beginTwoFactorEnrollment(identity.identity.user.id);
    return rateLimitedJson({ ok: true, enrollment }, rateLimit);
  } catch (error) {
    reportException(error, { route: "/api/v1/auth/2fa/setup", method: "POST" }, "MFA enrollment setup failed");
    return rateLimitedJson(
      { error: "Two-factor enrollment is unavailable.", code: "MFA_UNAVAILABLE" },
      rateLimit,
      { status: 503 },
    );
  }
}
