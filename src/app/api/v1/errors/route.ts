import { getStaffSession } from "@/lib/audit/auth";
import { listErrors, reportError } from "@/lib/infra/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { message?: string; source?: string; stack?: string };
  await reportError(new Error(body.message || "client error"), body.source ?? "client", {
    stack: body.stack ?? null,
  });
  return Response.json({ ok: true });
}

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const events = await listErrors(40);
  return Response.json({ ok: true, data: events });
}
