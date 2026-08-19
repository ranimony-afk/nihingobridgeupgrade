import { getInfraStatus } from "@/lib/infra/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getInfraStatus();
  return Response.json({ ok: data.ok, data }, { status: data.ok ? 200 : 503 });
}
