import { requestPasswordReset, resetPassword, verifyEmail } from "@/lib/identity/service";
import { clientKey, enforceRateLimit } from "@/lib/infra/rate-limit";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforceRateLimit({ key: clientKey(request), bucket: "auth", limit: 20, windowSec: 60 });
  if (!limited.allowed) return Response.json({ ok: false, error: "Too many requests" }, { status: 429 });
  await seedReady();
  const body = (await request.json()) as { action?: string; email?: string; token?: string; password?: string };
  if (body.action === "forgot") {
    return Response.json({ ok: true, data: await requestPasswordReset(body.email ?? "") });
  }
  if (body.action === "reset") {
    const result = await resetPassword(body.token ?? "", body.password ?? "");
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true });
  }
  if (body.action === "verify") {
    const result = await verifyEmail(body.token ?? "");
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
