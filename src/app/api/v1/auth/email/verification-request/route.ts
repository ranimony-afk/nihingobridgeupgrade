import { getRequestMetadata, requestEmailVerification } from "@/lib/auth/identity";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { authRateLimitPolicy } from "@/lib/rate-limit";
import { reportException } from "@/lib/observability";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, authRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  try {
    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) {
      return rateLimitedJson(
        { error: "Please provide a valid email address.", code: "VALIDATION_ERROR" },
        rateLimit,
        { status: 400 },
      );
    }

    await requestEmailVerification(payload.data.email, getRequestMetadata(request));
    return rateLimitedJson(
      { ok: true, message: "If an account requires verification, an email will arrive shortly." },
      rateLimit,
      { status: 202 },
    );
  } catch (error) {
    reportException(error, { route: "/api/v1/auth/email/verification-request", method: "POST" }, "Email verification request failed");
    return rateLimitedJson(
      { error: "Email verification is temporarily unavailable.", code: "EMAIL_UNAVAILABLE" },
      rateLimit,
      { status: 503 },
    );
  }
}
