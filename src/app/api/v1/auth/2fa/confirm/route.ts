import { confirmTwoFactorEnrollment, getRequestMetadata } from "@/lib/auth/identity";
import { requireIdentity } from "@/lib/auth/guard";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { mfaRateLimitPolicy } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmationSchema = z.object({ code: z.string().trim().regex(/^[0-9]{6}$/) });

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, mfaRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const payload = confirmationSchema.safeParse(await request.json());
  if (!payload.success) {
    return rateLimitedJson(
      { error: "Enter the six-digit authenticator code.", code: "VALIDATION_ERROR" },
      rateLimit,
      { status: 400 },
    );
  }

  const result = await confirmTwoFactorEnrollment(
    identity.identity.user.id,
    payload.data.code,
    getRequestMetadata(request),
  );
  if (!result) {
    return rateLimitedJson(
      { error: "The authenticator code is invalid or enrollment is no longer pending.", code: "INVALID_MFA_CODE" },
      rateLimit,
      { status: 400 },
    );
  }

  return rateLimitedJson({ ok: true, recoveryCodes: result.recoveryCodes }, rateLimit);
}
