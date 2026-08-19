import { listSessions, revokeSession } from "@/lib/identity/service";
import { getIdentity } from "@/lib/identity/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getIdentity(request);
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const rows = await listSessions(user.id);
  return Response.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    })),
  });
}

export async function DELETE(request: Request) {
  const user = await getIdentity(request);
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { id?: string };
  if (!body.id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
  await revokeSession(user.id, body.id);
  return Response.json({ ok: true });
}
