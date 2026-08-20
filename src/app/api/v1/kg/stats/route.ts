import { graphStats } from "@/lib/kg/search";
import { publicCacheHeaders } from "@/lib/perf/cache";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  return Response.json(
    { ok: true, data: await graphStats() },
    { headers: publicCacheHeaders(300) },
  );
}
