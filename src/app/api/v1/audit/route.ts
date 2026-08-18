import { getAuditBundle } from "@/lib/audit/repo";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const bundle = await getAuditBundle();
  return Response.json({
    ok: true,
    data: bundle,
  });
}
