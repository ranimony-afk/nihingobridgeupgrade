import { disableTotp, enableTotp, setupTotp } from "@/lib/identity/service";
import { getIdentity } from "@/lib/identity/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getIdentity(request);
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { action?: string; code?: string };
  if (body.action === "setup") {
    const result = await setupTotp(user.id);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true, data: result });
  }
  if (body.action === "enable") {
    const result = await enableTotp(user.id, body.code ?? "");
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true });
  }
  if (body.action === "disable") {
    const result = await disableTotp(user.id, body.code ?? "");
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
