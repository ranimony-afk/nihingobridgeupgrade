import { getRequestMetadata, requestPasswordReset } from "@/lib/auth/identity";
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

    await requestPasswordReset(payload.data.email, getRequestMetadata(request));
    return rateLimitedJson(
      { ok: true, message: "If an eligible account exists, reset instructions will arrive shortly." },
      rateLimit,
      { status: 202 },
    );
  } catch (error) {
    reportException(error, { route: "/api/v1/auth/password/reset/request", method: "POST" }, "Password reset request failed");
    return rateLimitedJson(
      { error: "Password reset is temporarily unavailable.", code: "PASSWORD_RESET_UNAVAILABLE" },
      rateLimit,
      { status: 503 },
    );
  }
}
