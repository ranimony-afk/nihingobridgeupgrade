import { listFindings } from "@/lib/audit/repo";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await seedReady();
  const url = new URL(request.url);
  const findings = await listFindings({
    domain: url.searchParams.get("domain") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  return Response.json({ ok: true, data: findings });
}
