import { registerUser } from "@/lib/identity/service";
import { setIdentityCookies } from "@/lib/identity/cookies";
import { issueTokens } from "@/lib/identity/service";
import { getUserById } from "@/lib/identity/service";
import { clientKey, enforceRateLimit } from "@/lib/infra/rate-limit";
import { seedReady } from "@/lib/seed";
import { getLearnerId } from "@/lib/learner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforceRateLimit({ key: clientKey(request), bucket: "auth", limit: 20, windowSec: 60 });
  if (!limited.allowed) {
    return Response.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  await seedReady();
  const body = (await request.json()) as { email?: string; name?: string; password?: string };
  const learnerId = await getLearnerId();
  const result = await registerUser({
    email: body.email ?? "",
    name: body.name ?? "",
    password: body.password ?? "",
    learnerId,
  });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
  const user = await getUserById(result.user.id);
  const tokens = user ? await issueTokens(user, request.headers.get("user-agent")) : null;
  if (tokens) await setIdentityCookies({ ...tokens, learnerId: tokens.user.learnerId });
  return Response.json({
    ok: true,
    data: { user: result.user, verifyLink: result.verifyLink, tokens },
  });
}
