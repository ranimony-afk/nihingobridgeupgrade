import { completeTwoFactor, loginUser } from "@/lib/identity/service";
import { setIdentityCookies } from "@/lib/identity/cookies";
import { clientKey, enforceRateLimit } from "@/lib/infra/rate-limit";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforceRateLimit({ key: clientKey(request), bucket: "auth", limit: 20, windowSec: 60 });
  if (!limited.allowed) {
    return Response.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  await seedReady();
  const body = (await request.json()) as { email?: string; password?: string; otp?: string; challengeId?: string };
  const agent = request.headers.get("user-agent") ?? undefined;
  if (body.challengeId && body.otp) {
    const result = await completeTwoFactor(body.challengeId, body.otp, agent);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    await setIdentityCookies({ accessToken: result.accessToken, refreshToken: result.refreshToken, learnerId: result.user.learnerId });
    return Response.json({ ok: true, data: result });
  }
  const result = await loginUser({
    email: body.email ?? "",
    password: body.password ?? "",
    otp: body.otp,
    userAgent: agent,
  });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
  if ("requires2fa" in result && result.requires2fa) {
    return Response.json({ ok: true, data: result });
  }
  if (!("accessToken" in result)) {
    return Response.json({ ok: false, error: "Login failed" }, { status: 401 });
  }
  await setIdentityCookies({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    learnerId: result.user.learnerId,
  });
  return Response.json({ ok: true, data: result });
}
