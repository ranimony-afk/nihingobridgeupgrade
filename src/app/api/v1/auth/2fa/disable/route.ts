import { disableTwoFactor, getRequestMetadata } from "@/lib/auth/identity";
import { requireIdentity } from "@/lib/auth/guard";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { mfaRateLimitPolicy } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const disableSchema = z.object({ code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, mfaRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const payload = disableSchema.safeParse(await request.json());
  if (!payload.success) {
    return rateLimitedJson(
      { error: "Provide an authenticator or recovery code.", code: "VALIDATION_ERROR" },
      rateLimit,
      { status: 400 },
    );
  }

  const disabled = await disableTwoFactor(
    identity.identity.user.id,
    payload.data.code,
    getRequestMetadata(request),
  );
  if (!disabled) {
    return rateLimitedJson(
      { error: "The authenticator or recovery code is invalid.", code: "INVALID_MFA_CODE" },
      rateLimit,
      { status: 400 },
    );
  }

  return rateLimitedJson({ ok: true }, rateLimit);
}
