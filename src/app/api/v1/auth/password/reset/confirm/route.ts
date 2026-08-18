import { getRequestMetadata, resetPassword } from "@/lib/auth/identity";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { authRateLimitPolicy } from "@/lib/rate-limit";
import { reportException } from "@/lib/observability";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmationSchema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, authRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  try {
    const payload = confirmationSchema.safeParse(await request.json());
    if (!payload.success) {
      return rateLimitedJson(
        { error: "The reset link or password is invalid.", code: "VALIDATION_ERROR" },
        rateLimit,
        { status: 400 },
      );
    }

    const result = await resetPassword(
      payload.data.token,
      payload.data.password,
      getRequestMetadata(request),
    );

    if (result.passwordIssues.length > 0) {
      return rateLimitedJson(
        { error: "Password does not meet the required security policy.", code: "WEAK_PASSWORD", issues: result.passwordIssues },
        rateLimit,
        { status: 400 },
      );
    }

    if (!result.ok) {
      return rateLimitedJson(
        { error: "This reset link is invalid or expired.", code: "INVALID_RESET_TOKEN" },
        rateLimit,
        { status: 400 },
      );
    }

    return rateLimitedJson(
      { ok: true, message: "Your password has been reset. Please sign in again." },
      rateLimit,
    );
  } catch (error) {
    reportException(error, { route: "/api/v1/auth/password/reset/confirm", method: "POST" }, "Password reset confirmation failed");
    return rateLimitedJson(
      { error: "Password reset is temporarily unavailable.", code: "PASSWORD_RESET_UNAVAILABLE" },
      rateLimit,
      { status: 503 },
    );
  }
}
